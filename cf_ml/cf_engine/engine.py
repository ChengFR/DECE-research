import numpy as np
import pandas as pd
import timeit
import math

import torch
from torch import nn
import torch.optim as optim

from cf_engine.counterfactual import CounterfactualExample, CounterfactualExampleBySubset


class CFEnginePytorch:
    """A class to generate counterfactual examples."""

    def __init__(self, model_manager, dataset):
        self.model_manager = model_manager
        self.dataset = dataset
        self.dir_manager = self.model_manager.get_dir_manager()

    def generate_cfs_from_setting(self, setting, proximity_weight=0.1, diversity_weight=1.0, lr=0.05, clip_frequency=50, max_iter=2000, min_iter=100,
                                  loss_diff=5e-6, loss_threshold=0.01, post_step=5, batch_size=1, evaluate=True, verbose=True, use_cache=True, cache=True):
        """
        :param setting: {'index': list of int or str, optional
                        'changeable_attribute': str or list of str, 
                        'weight': str or array-like
                        'k': int, number of changed attribute
                        'filters': list of ($attr_name, min, max, boolean: allow special value) or ($attr_name, list of any, boolean: allow special value), 
                        'cf_num': int, 
                        'desired_class': 'opposite' or pandas.DataFrame}
        """
        if use_cache and self.dir_manager.indexof_setting(setting) >= 0:
            subset_cf = self.dir_manager.load_cf_with_setting(setting)
        else:
            changeable_attribute = setting['changeable_attribute']
            filters = setting['filters']
            cf_num = setting['cf_num']
            desired_class = setting['desired_class']
            weight = setting['weight']
            if 'index' in setting.keys():
                index = setting['index']
            else:
                index = 'all'
            data_df = self.dataset.get_sample(index=index, filters=filters)
            subset_cf = self.generate_cfs(data_df, cf_num, desired_class, weight, proximity_weight, diversity_weight, lr, clip_frequency, changeable_attribute, \
                        max_iter, min_iter, loss_diff, loss_threshold, post_step, batch_size, evaluate, verbose)
        if cache:
            self.dir_manager.save_cf_with_setting(subset_cf, setting)
        return subset_cf


    def generate_cfs(self, data_df, cf_num=4, desired_class='opposite', weight='mads', proximity_weight=0.1, diversity_weight=1.0, lr=0.05, clip_frequency=50,
                     changeable_attribute='all',
                     max_iter=2000, min_iter=100, loss_diff=5e-6, loss_threshold=0.01, post_step=5, batch_size=1, evaluate=True, verbose=True):
        """Generate cfs to an instance or a dataset in the form of pandas.DataFrame. mini_batch is applied if batch_size > 1
        :param data_df: pandas.DataFrame, target dataset in the form of pandas.DataFrame
        :param cf_num: int, number of the generated counterfactual examples
        :param desired_class: 'opposite' or pandas.DataFrame
        :param proximity_weight: float, weight of proximity loss part
        :param diversity_weight: float, weight of diversity loss part (not implementated)
        :param lr: float, learning rate in the optimization process
        :param clip_frequency: int, frquency of clip operation to norm values to [0, 1]
        :param max_iter: int, maximum iteration
        :param min_iter: int, minimun iteraction
        :param loss_diff: float, an early stop happends when the difference of loss is below loss_diff
        :param batch_size: int, number of instance in a batch
        :param verbose: boolean, whether to print out the log information
        """
        self.update_config(cf_num, desired_class, proximity_weight, weight,
                           diversity_weight, clip_frequency, changeable_attribute, max_iter, min_iter, loss_diff, loss_threshold, lr)

        # cf_df = pd.DataFrame(columns=self.dataset.get_columns(preprocess=False) +
        #                      ['{}_pred'.format(self.dataset.get_target_names(preprocess=False)), 'score'])
        # instance_df = pd.DataFrame(columns=self.dataset.get_columns(preprocess=False) +
        #                            ['{}_pred'.format(self.dataset.get_target_names(preprocess=False)), 'score'])
        subset_cf = CounterfactualExampleBySubset(self.dataset, self.cf_num)

        feature_names = self.dataset.get_feature_names()
        mask = np.array(
            [feature in self.changeable_attribute for feature in feature_names]).astype(int)

        start_time = timeit.default_timer()
        data_num = len(data_df)
        total_loss = 0
        for batch_num in range(math.ceil(data_num / batch_size)):
            checkpoint = timeit.default_timer()
            start_id = batch_num*batch_size
            end_id = min(batch_num*batch_size+batch_size, len(data_df))

            data_instances = data_df[feature_names].iloc[start_id: end_id].values

            if type(desired_class) is str and desired_class == 'opposite':
                target = self.get_desired_class(data_instances)
            else:
                target = desired_class

            cfs = self.init_cfs(data_instances)
            target = self.init_target(target)
            data_instances = torch.from_numpy(data_instances).float()

            expanded_mask = np.repeat(
                mask[np.newaxis, :], self.cf_num*(end_id-start_id), axis=0)

            cfs, _, loss, iter = self.optimize(
                cfs, data_instances, target, expanded_mask, lr)

            # predicted_cfs = self.model_manager.predict(self.project(cfs))
            predicted_instances = self.model_manager.predict(data_df.iloc[start_id: end_id]).set_index(data_df.iloc[start_id: end_id].index)

            projected_cfs = self.project(cfs)
            

            for _ in range(post_step):
                projected_cfs = self.post_step(projected_cfs, data_instances, target, expanded_mask)
                # print(projected_cfs.loc[0, :])

            predicted_cfs = self.model_manager.predict(projected_cfs[self.dataset.get_columns(preprocess=False)])
            # print(predicted_cfs[])

            subset_cf.append_cfs(predicted_cfs, predicted_instances)

            total_loss += loss*(end_id-start_id)

            if evaluate:
                eval_result = self.evaluate_cfs(predicted_cfs, predicted_instances)
            if verbose:
                print("[{}/{}]  Epoch-{}, time cost: {:.3f}s, loss: {:.3f}, iteration: {}, validation rate: {:.3f}".format(\
                    end_id, data_num, batch_num, timeit.default_timer()-checkpoint, loss*1000, iter, eval_result['valid_rate']))
            # print(cf_df)
        if evaluate:
            eval_result = self.evaluate_cfs(subset_cf.get_cf(), subset_cf.get_instance())
            print('Total time cost: {:.3f}, validation rate: {:.3f}, average distance: {:.3f}, average loss: {:.3f}'.format(
                timeit.default_timer()-start_time, eval_result['valid_rate'], eval_result['avg_distance'], total_loss/data_num*1000))
        return subset_cf

    def update_config(self, cf_num, desired_class, proximity_weight, weight, diversity_weight, clip_frequency, changeable_attribute, max_iter, min_iter, loss_diff, loss_threshold, lr):
        self.cf_num = cf_num
        self.desired_class = desired_class
        self.proximity_weight = proximity_weight
        self.diversity_weight = diversity_weight
        self.clip_frequency = clip_frequency
        if type(changeable_attribute) == str:
            self.changeable_attribute = self.dataset.get_feature_names(
                preprocess=True)
        else:
            self.changeable_attribute = self.dataset.process_columns(
                changeable_attribute)
        self.max_iter = max_iter
        self.min_iter = min_iter
        self.loss_diff = loss_diff
        self.loss_threshold = loss_threshold
        self.lr = lr

        if weight == 'mads':
            mads = self.dataset.get_mads()
            features = self.dataset.get_feature_names(preprocess=True)
            self.feature_weight = np.array([round(1 / (1 + mads[f]), 3) for f in features])
        elif weight == 'unit':
            features = self.dataset.get_feature_names(preprocess=True)
            self.feature_weight = np.array([1 for f in features])
        else:
            self.feature_weight = np.array(weight)
        self.feature_weight = torch.from_numpy(self.feature_weight).float()

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

    def optimize(self, cfs, data_instances, target, mask, lr):
        cfs = torch.from_numpy(cfs).float()
        target = torch.from_numpy(target).float()
        cfs.requires_grad = True
        target.requires_grad = False

        self.model_manager.fix_model()
        self.init_loss()

        mask = torch.from_numpy(mask).int()

        def backward_hook(grad):
            out = grad.clone()
            out = out*mask
            return out

        cfs.register_hook(backward_hook)

        optimizer = optim.SGD([cfs], lr=lr)

        iter = 0

        pred = self.model_manager.forward(cfs)
        loss = self.get_loss(cfs, data_instances, pred, target)
        old_loss = loss

        while(not self.checkstopable(iter, pred, target, loss, old_loss-loss)):
            optimizer.zero_grad()

            pred = self.model_manager.forward(cfs)
            old_loss = loss.clone()
            loss = self.get_loss(cfs, data_instances, pred, target)

            loss.backward()
            optimizer.step()

            iter += 1
            if iter % self.clip_frequency == 0:
                self.clip(cfs.data)

        self.clip(cfs.data)
        return cfs.detach().numpy(), pred.detach().numpy(), loss.detach().numpy(), iter

    def init_loss(self):
        # self.criterion = nn.HingeEmbeddingLoss(reduction='sum')
        # self.criterion = nn.L1Loss(reduction='sum')
        self.criterion = nn.MarginRankingLoss(reduction='mean')

    def get_loss(self, cfs, data_instances, pred, target):
        loss = self.criterion(pred, torch.ones(pred.shape)*0.5, target)
        for i, cf in enumerate(cfs):
            loss += self.proximity_weight * (1/self.cf_num/len(cfs)) * \
                self.get_distance(cf, data_instances[i//self.cf_num])
        return loss

    def get_distance(self, cf, origin, metric='L2'):
        if metric == 'L1':
            # dist = torch.dist(cf, origin, 1)
            dist = torch.sum(torch.abs(cf - origin) * self.feature_weight)
        elif metric == 'L2':
            dist = torch.dist(cf, origin, 2)
            # dist = torch.sum(torch.abs(cf - origin) * self.feature_weight)
        return dist

    def clip(self, data):
        """clip value of each feature to [0, 1]"""
        torch.clamp_(data, min=0, max=1)

    def checkvalid(self, pred, target):
        pred_class = pred.argmax(axis=1).numpy()
        target_class = target.argmax(axis=1).numpy()
        return np.equal(pred_class, target_class).all()

    def checkstopable(self, iter, pred, target, loss, loss_diff):
        if iter < self.min_iter:
            return False
        elif iter >= self.max_iter:
            return True
        elif self.checkvalid(pred, target) and loss_diff > 0 and loss_diff <= self.loss_diff:
            return True
        else:
            return False

    def get_gradient(self, cfs, data_instances, target, mask):
        cfs = torch.from_numpy(cfs).float()
        target = torch.from_numpy(target).float()
        cfs.requires_grad = True
        target.requires_grad = False

        self.model_manager.fix_model()
        self.init_loss()

        mask = torch.from_numpy(mask).int()
        pred = self.model_manager.forward(cfs)
        loss = self.get_loss(cfs, data_instances, pred, target)

        loss.backward()
        gradient = cfs.grad
        return gradient*mask, pred

    def post_step(self, projected_cfs, data_instances, target, mask):
        feature_names = self.dataset.get_feature_names()
        target_name = self.dataset.get_target_names(preprocess=False)
        description = self.dataset.get_description()

        cfs = self.dataset.preprocess(projected_cfs)[feature_names].values
        grad, pred = self.get_gradient(cfs, data_instances, target, mask)
        grad = grad.detach().numpy()
        salient_attr = abs(grad).argmax(axis=1)
        grad_sign= np.sign(grad)
        # salient_grad = np.array([[1 if j == salient_attr[i] else 0 for j in range(gard.shape[1])] for i in range(grad.shape[0])]) * np.sign(grad)

        invalid_cfs = pred.argmax(axis=1).numpy() != target.argmax(axis=1)
        # masked_salient_grad = salient_grad * np.repeat(invalid_cfs[:, np.newaxis], grad.shape[1], axis=1)
        for i in range(len(projected_cfs)):
            if invalid_cfs[i]:
                salient_feature_name = feature_names[salient_attr[i]]
                if salient_feature_name in description.keys() and description[salient_feature_name]['type'] == 'numerical':
                    projected_cfs.loc[i, salient_feature_name] -= grad_sign[i, salient_attr[i]] * 1 / 10**description[salient_feature_name]['decile']
                    # print("{}->{}: {} + {}".format(pred[i, 0], target[i ,0], salient_feature_name, grad_sign[i, salient_attr[i]] * 1 / 10**description[salient_feature_name]['decile']))
                else:
                    cfs[i][salient_attr[i]] += grad_sign[i, salient_attr[i]]
                    projected_cfs.loc[i, :] = self.model_manager.predict(self.project(cfs[i]))
        return projected_cfs

    def evaluate_cfs(self, cf_df, instance_df, metrics=['valid_rate', 'avg_distance']):
        result = {}
        if 'valid_rate' in metrics:
            target_name = self.dataset.get_target_names(preprocess=False)
            cf_pred = cf_df['{}_pred'.format(target_name)].values
            instance_pred = np.repeat(
                instance_df['{}_pred'.format(target_name)].values, self.cf_num, axis=0)
            result['valid_rate'] = np.not_equal(
                cf_pred, instance_pred).sum() / cf_pred.shape[0]
        if 'avg_distance' in metrics:
            dist = 0
            preprocessed_feature_name = self.dataset.get_feature_names(
                preprocess=True)
            pp_cf_data = torch.from_numpy(self.dataset.preprocess(
                cf_df)[preprocessed_feature_name].values).float()
            pp_instance_data = torch.from_numpy(self.dataset.preprocess(
                instance_df)[preprocessed_feature_name].values).float()
            for i, cf_data in enumerate(pp_cf_data):
                dist += self.get_distance(cf_data,
                                          pp_instance_data[i//self.cf_num])
            dist /= len(pp_cf_data)
            result['avg_distance'] = dist.numpy()
        return result
    
