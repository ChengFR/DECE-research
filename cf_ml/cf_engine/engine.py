import numpy as np
import pandas as pd
import timeit
import math

import torch
from torch import nn
import torch.optim as optim

# from cf_engine.counterfactual import CounterfactualExample, CounterfactualExampleBySubset


class CFEnginePytorch:
    """A class to generate counterfactual examples."""

    def __init__(self, model_manager, dataset):
        self.model_manager = model_manager
        self.dataset = dataset

    def generate_cfs(self, data_df, cf_num=4, desired_class='opposite', proximity_weight=1.0, diversity_weight=1.0, lr=0.005, clip_frequency=50,
                     max_iter=1000, min_iter=200, batch_size=1, evaluate=True, verbose=True):
        """Generate cfs to an instance or a dataset in the form of pandas.DataFrame. mini_batch is applied if batch_size > 1
        :param dataset: 

        """
        self.update_config(cf_num, desired_class, proximity_weight,
                           diversity_weight, clip_frequency, max_iter, min_iter, lr)
        cf_df = pd.DataFrame(columns=self.dataset.get_columns(preprocess=False) + \
                             ['{}_pred'.format(self.dataset.get_target_names(preprocess=False)), 'score'])
        instance_df = pd.DataFrame(columns=self.dataset.get_columns(preprocess=False) + \
                                   ['{}_pred'.format(self.dataset.get_target_names(preprocess=False)), 'score'])
        # pred_df =
        data_num = len(data_df)
        for batch_num in range(math.ceil(data_num / batch_size)):
            checkpoint = timeit.default_timer()
            start_id = batch_num*batch_size
            end_id = min(batch_num*batch_size+batch_size, len(data_df)+1)
            data_instances = data_df[self.dataset.get_feature_names()].iloc[start_id: end_id].values

            if type(desired_class) is str and desired_class == 'opposite':
                target = self.get_desired_class(data_instances)
            else:
                target = desired_class

            cfs = self.init_cfs(data_instances)
            target = self.init_target(target)
            data_instances = torch.from_numpy(data_instances).float()

            cfs, preds, iter = self.optimize(cfs, data_instances, target, lr)
            projected_cfs = self.project(cfs)
            cf_df = cf_df.append(self.model_manager.predict(projected_cfs))
            instance_df = instance_df.append(self.model_manager.predict(data_df.iloc[start_id: end_id]))
            if verbose:
                print("[{}/{}]Epoch-{}, time cost: {:.3f}s, iteraciton: {}".format(end_id,
                                                                                   data_num, batch_num, timeit.default_timer()-checkpoint, iter))
            # print(cf_df)
        if evaluate:
            eval_result = self.evaluate_cfs(cf_df, instance_df)
            print(eval_result)
        cf_df.to_csv('./cf.csv')
        instance_df.to_csv('./data.csv')

    def update_config(self, cf_num, desired_class, proximity_weight, diversity_weight, clip_frequency, max_iter, min_iter, lr):
        self.cf_num = cf_num
        self.desired_class = desired_class
        self.proximity_weight = proximity_weight
        self.diversity_weight = diversity_weight
        self.clip_frequency = clip_frequency
        self.max_iter = max_iter
        self.min_iter = min_iter
        self.lr = lr

    def init_cfs(self, data):
        return np.repeat(data, self.cf_num, axis=0)

    def init_target(self, target):
        return np.repeat(target, self.cf_num, axis=0)

    def get_desired_class(self, data):
        data = torch.from_numpy(data).float()
        output = self.model_manager.forward(data)
        target_idx = output.argmin(axis=1).numpy()  # the opposite class
        return np.eye(output.shape[1])[target_idx]

    def project(self, data):
        pred = np.zeros((len(data), len(self.dataset.get_target_names())))
        data_df = pd.DataFrame(np.concatenate((data, pred), axis=1),
                               columns=self.dataset.get_columns())
        return self.dataset.depreprocess(data_df)

    def optimize(self, cfs, data_instances, target, lr):
        cfs = torch.from_numpy(cfs).float()
        target = torch.from_numpy(target).float()
        cfs.requires_grad = True
        target.requires_grad = False

        self.model_manager.fix_model()
        self.init_loss()

        optimizer = optim.SGD([cfs], lr=lr)

        iter = 0
        pred = self.model_manager.forward(cfs)
        while(not self.checkstopable(iter, pred, target)):
            optimizer.zero_grad()

            pred = self.model_manager.forward(cfs)
            loss = self.get_loss(cfs, data_instances, pred, target)

            loss.backward()
            optimizer.step()

            iter += 1

            if iter % self.clip_frequency == 0:
                self.clip(cfs.data)

        return cfs.detach().numpy(), pred.detach().numpy(), iter

    def init_loss(self):
        # self.criterion = nn.HingeEmbeddingLoss(reduction='sum')
        # self.criterion = nn.L1Loss(reduction='sum')
        self.criterion = nn.MarginRankingLoss(reduction='sum')

    def get_loss(self, cfs, data_instances, pred, target):
        loss = 5 * self.criterion(pred, torch.ones(pred.shape)*0.5, target)
        for i, cf in enumerate(cfs):
            loss += self.proximity_weight * \
                self.get_distance(cf, data_instances[i//self.cf_num])
        return loss

    def get_distance(self, cf, origin, metric='L2'):
        if metric == 'L1':
            dist = torch.dist(cf, origin, 1)
        elif metric == 'L2':
            dist = torch.dist(cf, origin, 2)
        return dist

    def clip(self, data):
        """clip value of each feature to [0, 1]"""
        torch.clamp_(data, min=0, max=1)

    def checkvalid(self, pred, target):
        pred_class = pred.argmax(axis=1).numpy()
        target_class = target.argmax(axis=1).numpy()
        # print(np.equal(pred_class, target_class).sum())
        return np.equal(pred_class, target_class).all()

    def checkstopable(self, iter, pred, target):
        if iter < self.min_iter:
            return False
        if iter >= self.max_iter:
            return True
        if self.checkvalid(pred, target):
            return True

    def evaluate_cfs(self, cf_df, instance_df, metrics=['valid_rate', 'avg_distance']):
        result = {}
        if 'valid_rate' in metrics:
            target_name = self.dataset.get_target_names(preprocess=False)
            cf_pred = cf_df['{}_pred'.format(target_name)].values
            instance_pred = np.repeat(instance_df['{}_pred'.format(target_name)].values, self.cf_num, axis=0)
            result['valid_rate'] = np.not_equal(
                        cf_pred, instance_pred).sum() / cf_pred.shape[0]
        if 'avg_distance' in metrics:
            dist = 0
            preprocessed_feature_name = self.dataset.get_feature_names(preprocess=True)
            pp_cf_data = torch.from_numpy(self.dataset.preprocess(cf_df)[preprocessed_feature_name].values).float()
            pp_instance_data = torch.from_numpy(self.dataset.preprocess(instance_df)[preprocessed_feature_name].values).float()
            for i, cf_data in enumerate(pp_cf_data):
                dist += self.get_distance(cf_data, pp_instance_data[i//self.cf_num])
            dist /= len(pp_cf_data)
            result['avg_distance'] = dist.numpy()
        return result


if __name__ == '__main__':
    from load_dataset import load_HELOC_dataset
    from model_manager import PytorchModelManager
    dataset = load_HELOC_dataset()
    mm = PytorchModelManager(dataset)
    mm.load_model('../model/HELOC/MLP_test_accuracy_0.72')
    engine = CFEnginePytorch(mm, dataset)
    engine.generate_cfs(dataset.get_sample([i for i in range(
        100)]), cf_num=4, proximity_weight=0.5, lr=0.001, batch_size=4, max_iter=5000, min_iter=100)
    # engine.generate_cfs(dataset.get_sample(0), cf_num=10, proximity_weight=3.0, lr=0.0005)
