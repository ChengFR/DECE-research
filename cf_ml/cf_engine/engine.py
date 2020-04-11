import numpy as np
import pandas as pd
import timeit
import math
import copy
from collections import OrderedDict

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
        self.desc = self.dataset.get_description()
        self.features = self.dataset.get_feature_names()

    def generate_cfs_subset(self, subset={}, weight='mads', **kwargs):
        """
        """
        results = OrderedDict()
        for feature in self.dataset.get_feature_names(False):
            setting = {'data_range': copy.deepcopy(subset), 'cf_range': copy.deepcopy(subset)}
            if feature in subset:
                del setting['cf_range'][feature]
            results[feature] = self.generate_cfs_from_setting(setting, None, **kwargs)
        return results

    def generate_cfs_from_setting(self, setting, data=None, weight='mads', proximity_weight=0.01, diversity_weight=0, lr=0.01, clip_frequency=50, init_cat='rand', max_iter=2000, min_iter=100,
                                  loss_diff=5e-6, post_step=5, batch_size=1, evaluate=1, verbose=True, use_cache=True, cache=True):
        """
        :param setting: {'index': list of int or str, optional
                        'changeable_attribute': str or list of str, 
                        'k': int, number of changed attribute,
                        'cf_range': dict, range of attribute
                        'data_range': dict, range of attribute
                        'cf_num': int, 
                        'desired_class': 'opposite' or ndarray}
        """
        if data is None and use_cache and self.dir_manager.indexof_setting(setting) >= 0:
            subset_cf = self.dir_manager.load_cf_with_setting(setting)
        else:
            changeable_attribute = setting.get('changeable_attribute', 'all')
            data_range = setting.get('data_range', {})
            cf_num = setting.get('cf_num', 1)
            desired_class = setting.get('desired_class', 'opposite')
            k = setting.get('k', -1)
            cf_range = setting.get('cf_range', {})
            index = setting.get('index', 'all')
            if data is None:
                data_df = self.dataset.get_sample(
                    index=index, filters=data_range, preprocess=False)
            elif isinstance(data, list) or isinstance(data, np.ndarray):
                data = np.array(data)
                if len(data.shape) == 1:
                    data = data[np.newaxis, :]
                data_df = pd.DataFrame(
                    data, columns=self.dataset.get_feature_names(False))
            else:
                data_df = data
            subset_cf = self.generate_cfs(data_df, cf_num, desired_class, weight, proximity_weight, diversity_weight, lr, clip_frequency, changeable_attribute,
                                          k, cf_range, init_cat, max_iter, min_iter, loss_diff, post_step, batch_size, evaluate, verbose)
        if data is None and cache:
            self.dir_manager.save_cf_with_setting(subset_cf, setting)
        return subset_cf

    def generate_cfs(self, data_df, cf_num=4, desired_class='opposite', weight='mads', proximity_weight=0.1, diversity_weight=1.0, lr=0.05, clip_frequency=50,
                     changeable_attr='all', k=-1, cf_range={}, init_cat='rand', 
                     max_iter=2000, min_iter=100, loss_diff=5e-6, post_step=5, batch_size=1, evaluate=True, verbose=1):
        """Generate cfs to an instance or a dataset in the form of pandas.DataFrame. mini_batch is applied if batch_size > 1
        :param data_df: pandas.DataFrame, raw target dataset in the form of pandas.DataFrame
        :param cf_num: int, number of the generated counterfactual examples
        :param desired_class: 'opposite' or pandas.DataFrame
        :param proximity_weight: float, weight of proximity loss part
        :param diversity_weight: float, weight of diversity loss part (not implementated)
        :param lr: float, learning rate in the optimization process
        :param clip_frequency: int, frquency of clip operation to norm values to [0, 1]
        :param changeable_attr: str of list of str, attribute names that are allowed to change, 'all' means that all attributes are allowed to be change
        :param k: int, number of changeable attribute, if k > 0 and k < len(changeable_attr), for each cf, 
            a post-hoc process will be made to ensure only k attributes finally changed.
        :param cf_range: dict, range of attribute
        :param init_cat: 'rand' or 'avg', initialization of dummy attribute values
        :param max_iter: int, maximum iteration
        :param min_iter: int, minimun iteraction
        :param loss_diff: float, an early stop happends when the difference of loss is below loss_diff
        :param batch_size: int, number of instance in a batch
        :param verbose: boolean, whether to print out the log information
        """
        self.update_config(cf_num, desired_class, proximity_weight, weight,
                           diversity_weight, clip_frequency, changeable_attr, k, cf_range, init_cat, max_iter, min_iter, loss_diff, lr)
        # init timer
        start_time = timeit.default_timer()
        # init result contrainer
        subset_cf = CounterfactualExampleBySubset(self.dataset, self.cf_num)
        # init original instances
        data_df = self.dataset.preprocess(data_df, mode='x')
        data_num = len(data_df)
        total_loss = 0
        # start generating
        for batch_num in range(math.ceil(data_num / batch_size)):
            checkpoint = timeit.default_timer()
            start_id = batch_num*batch_size
            end_id = min(batch_num*batch_size+batch_size, len(data_df))
            # get original instances in a batch
            instances = data_df[self.features].iloc[start_id: end_id].values

            expanded_mask = np.repeat(
                self.mask_change[np.newaxis, :], self.cf_num*(end_id-start_id), axis=0)
            # init target classes
            if type(desired_class) is str and desired_class == 'opposite':
                targets = self.get_desired_class(instances)
            else:
                targets = desired_class
            # prepare initialized counterfactuals, target, and instances for generation
            init_cfs, targets, instances = self.prepare_cfs(
                targets=targets, instances=instances, mask=expanded_mask)
            # optimization process
            cfs, _, loss, iter = self.optimize(
                init_cfs, instances, targets, expanded_mask, lr)
            # regenerate counterfactual examples if the number of changeable attributes is fixed
            if self.k > 0 and self.k < self.mask_change.sum():
                diff = (cfs - instances).abs()
                key_features = diff.argsort(dim=1, descending=True)[:, :k]
                new_mask = torch.zeros(cfs.shape[0], cfs.shape[1])
                for i in range(cfs.shape[0]):
                    new_mask[i, key_features[i]] = 1
                cfs, _, loss, iter = self.optimize(
                    init_cfs, instances, targets, expanded_mask, lr)

            cfs = cfs.detach().numpy()

            # project the counterfactuals to the original space
            projected_cfs = self.project(cfs)

            # post steps to refine counterfactual examples
            for _ in range(post_step):
                projected_cfs = self.post_step(
                    projected_cfs, instances, targets, expanded_mask, verbose=verbose>1)

            # store the final counterfactuals and the original instances into the container
            predicted_cfs = self.model_manager.predict(
                projected_cfs[self.dataset.get_feature_names(preprocess=False)])
            predicted_instances = self.model_manager.predict(
                data_df.iloc[start_id: end_id], preprocess=False).set_index(data_df.iloc[start_id: end_id].index)
            subset_cf.append_cfs(predicted_cfs, predicted_instances)

            total_loss += loss*(end_id-start_id)

            if evaluate:
                eval_result = self.evaluate_cfs(
                    predicted_cfs, predicted_instances)
            if verbose > 0:
                print("[{}/{}]  Epoch-{}, time cost: {:.3f}s, loss: {:.3f}, iteration: {}, validation rate: {:.3f}".format(
                    end_id, data_num, batch_num, timeit.default_timer()-checkpoint, loss, iter, eval_result['valid_rate']))
        if evaluate:
            eval_result = self.evaluate_cfs(
                subset_cf.get_cf(), subset_cf.get_instance())
            print('Total time cost: {:.3f}, validation rate: {:.3f}, average distance: {:.3f}, average loss: {:.3f}'.format(
                timeit.default_timer()-start_time, eval_result['valid_rate'], eval_result['avg_distance'], total_loss/data_num))
        return subset_cf

    def update_config(self, cf_num, desired_class, proximity_weight, weight, diversity_weight, clip_frequency, changeable_attribute,
                      k, cf_range, init_cat, max_iter, min_iter, loss_diff, lr):
        self.cf_num = cf_num
        self.desired_class = desired_class
        self.proximity_weight = proximity_weight
        self.diversity_weight = diversity_weight
        self.category_weight = 0.01
        self.clip_frequency = clip_frequency
        self.init_cat = init_cat
        self.reload_frequency = 100
        if isinstance(changeable_attribute, str) and changeable_attribute == 'all':
            self.changeable_attribute = self.features
        else:
            self.changeable_attribute = self.dataset.process_columns(changeable_attribute)
        self.max_iter = max_iter
        self.min_iter = min_iter
        self.loss_diff = loss_diff
        self.lr = lr
        self.k = k
        # set mask of changeable attributes; numerical attributes; categorical attributes
        self.mask_change = \
            np.array(
                [feature in self.changeable_attribute for feature in self.features]).astype(int)

        self.mask_num = \
            np.array(
                [True if attr in self.desc else False for attr in self.features]).astype(int)

        self.mask_cat = \
            np.array(
                    [False if attr in self.desc else True for attr in self.features]).astype(int)
        # list of the indexes of dummy attributes
        self.categorical_attr_list = []
        for attr, info in self.desc.items():
            if attr != self.dataset.get_target_names(False) and info['type'] == 'categorical':
                self.categorical_attr_list.append([self.features.index(
                    '{}_{}'.format(attr, cat)) for cat in info['category']])
        # set feature weight
        if weight == 'mads':
            mads = self.dataset.get_mads()
            features = self.dataset.get_feature_names(preprocess=True)
            self.feature_weight = np.array(
                [round(1 / (1 + mads[f]), 3) for f in features])
        elif weight == 'unit':
            features = self.dataset.get_feature_names(preprocess=True)
            self.feature_weight = np.array([1 for f in features])
        else:
            self.feature_weight = np.array(weight)
        self.feature_weight = torch.from_numpy(self.feature_weight).float()

        # set min and max of both the preprocessed data and the non-preprocessed data
        target = self.dataset.get_target_names(preprocess=False)
        self.cf_range = OrderedDict()
        for col, info in self.desc.items():
            if col != target:
                self.cf_range[col] = {}
                if col in cf_range:
                    self.cf_range[col] = cf_range[col]
                elif info['type'] == 'numerical':
                    self.cf_range[col]['min'] = info['min']
                    self.cf_range[col]['max'] = info['max']
                else:
                    self.cf_range[col]['category'] = info['category']

        print(self.cf_range)
        self.normed_min = self.dataset.preprocess([info['min'] if self.desc[col]['type'] == 'numerical' else info['category'][0]
                                                   for col, info in self.cf_range.items()], mode='x')
        for col, info in self.desc.items():
            if col != target and info['type'] == 'categorical':
                for cat in info['category']:
                    self.normed_min['{}_{}'.format(col, cat)] = 0
        self.normed_min = torch.from_numpy(self.normed_min.values).float()

        self.normed_max = self.dataset.preprocess([info['max'] if self.desc[col]['type'] == 'numerical' else info['category'][0]
                                                   for col, info in self.cf_range.items()], mode='x')
        for col, info in self.desc.items():
            if col != target and info['type'] == 'categorical':
                for cat in info['category']:
                    if cat in self.cf_range[col]['category']:
                        self.normed_max['{}_{}'.format(col, cat)] = 1
                    else:
                        self.normed_max['{}_{}'.format(col, cat)] = 0
        print(self.normed_max)
        self.normed_max = torch.from_numpy(self.normed_max.values).float()

    def init_cfs(self, data, mask):
        cfs = np.repeat(data, self.cf_num, axis=0)
        cfs += mask * self.mask_num * np.random.rand(cfs.shape[0], cfs.shape[1])*0.1
        if self.init_cat == 'rand':
            cfs[:, mask * self.mask_cat] = np.random.rand(cfs.shape[0], len(self.mask_cat))
        elif self.init_cat == 'avg':
            cfs[:, mask * self.mask_cat] = np.zeros(cfs.shape[0], len(self.mask_cat)).fill(0.5)
        return cfs

    def init_targets(self, target):
        return np.repeat(target, self.cf_num, axis=0)

    def init_instances(self, instances):
        return np.repeat(instances, self.cf_num, axis=0)

    def prepare_cfs(self, instances, targets, cfs=None, mask=None):

        # init cfs
        if cfs is None:
            cfs = torch.from_numpy(self.init_cfs(instances, mask)).float()
        else:
            cfs = torch.from_numpy(cfs).float()

        cfs = self.clip(cfs)
        cfs.requires_grad = True
        # init targets
        targets = torch.from_numpy(self.init_targets(targets)).float()
        # init instances
        instances = torch.from_numpy(self.init_instances(instances)).float()
        return cfs, targets, instances

    def get_desired_class(self, data):
        data = torch.from_numpy(data).float()
        output = self.model_manager.forward(data)
        target_idx = output.argmin(axis=1).numpy()  # the opposite class
        return np.eye(output.shape[1])[target_idx]

    def project(self, data):
        if len(data.shape) == 1:
            data = np.array([data])
        data_df = pd.DataFrame(data,
                               columns=self.features)
        projected_df = self.dataset.depreprocess(data_df, mode='x')
        return projected_df

    def optimize(self, cfs, data_instances, target, mask, lr):

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
                cfs.data = self.clip(cfs.data)

            if iter % self.reload_frequency == 0:
                cfs.data = self.reload(cfs.data)

        cfs.data = self.clip(cfs.data)
        return cfs, pred, loss.detach().numpy(), iter

    def init_loss(self):
        # self.criterion = nn.HingeEmbeddingLoss(reduction='sum')
        # self.criterion = nn.L1Loss(reduction='sum')
        self.criterion = nn.MarginRankingLoss(reduction='sum')

    def get_loss(self, cfs, data_instances, pred, target):
        # prediction loss
        loss = self.criterion(pred, torch.ones(pred.shape)*0.5, target)
        # proximity loss
        loss += self.proximity_weight * self.get_proximity_loss(cfs, data_instances, 'L1')
        # diversity loss
        if self.diversity_weight > 0 and self.cf_num > 1:
            loss += self.diversity_weight * self.get_diversity_loss(cfs, 'avg')
        # category loss
        loss += self.category_weight * self.get_category_loss(cfs)
        
        return loss

    def get_proximity_loss(self, cfs, data_instances, metric='L1'):
        proximity_loss = torch.sum(self.get_distance_quick(
                cfs, data_instances, metric))
        return proximity_loss

    def get_diversity_loss(self, cfs, metric='avg'):
        diversity_loss = torch.tensor(0).float()
        if metric == 'avg':
            for i in range(len(cfs) // self.cf_num):
                for j in range(self.cf_num):
                    start = i*self.cf_num
                    end = (i+1)*self.cf_num
                    diversity_loss += (1 - self.get_distance_quick(cfs[start: end], cfs[start+j]).mean())
        else:
            raise NotImplementedError
        return diversity_loss

    def get_category_loss(self, cfs):
        category_loss = torch.tensor(0).float()
        for cat_index in self.categorical_attr_list:
            category_loss += (cfs[:, cat_index].sum(axis=1) - torch.ones([1, len(cfs)])).abs().mean()
        return category_loss
    
    def get_distance(self, cf, origin, metric='L1'):
        if metric == 'L1':
            # dist = torch.dist(cf, origin, 1)
            dist = torch.sum(torch.abs(cf - origin) * self.feature_weight)
        elif metric == 'L2':
            dist = torch.sum(torch.sqrt(
                (torch.abs(cf - origin) * self.feature_weight)**2))
            # dist = torch.sum(torch.abs(cf - origin) * self.feature_weight)
        return dist

    def get_distance_quick(self, cfs, origins, metric='L1'):
        if origins.dim == 1:
            origins = origins.unsqueeze(0).repeat(len(cfs), 1)
        if metric == 'L1':
            dist = torch.sum(torch.abs(
                cfs - origins) * self.feature_weight.unsqueeze(0).repeat(len(cfs), 1), axis=1)
        elif metric == 'L2':
            dist = torch.sum(torch.sqrt((torch.abs(
                cfs - origins) * self.feature_weight.unsqueeze(0).repeat(len(cfs), 1))**2), axis=1)
        return dist

    def clip(self, data):
        # """clip value of each feature to [0, 1]"""
        # torch.clamp_(data, min=0, max=1)
        return torch.max(torch.min(data, self.normed_max), self.normed_min)

    def reload(self, data):
        return torch.from_numpy(self.dataset.preprocess(self.project(data), 'x').values).float()

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
        self.model_manager.fix_model()
        self.init_loss()

        mask = torch.from_numpy(mask).int()
        pred = self.model_manager.forward(cfs)
        loss = self.get_loss(cfs, data_instances, pred, target)

        loss.backward()
        gradient = cfs.grad
        return gradient*mask, pred

    def post_step(self, projected_cfs, data_instances, target, mask, verbose=False):
        feature_names = self.features
        target_name = self.dataset.get_target_names(preprocess=False)

        cfs = torch.from_numpy(self.dataset.preprocess(
            projected_cfs, 'x')[feature_names].values).float()

        valid_pos_grad_mask = (cfs < (self.normed_max-0.001)).detach().numpy()
        valid_neg_grad_mask = (cfs > (self.normed_min+0.001)).detach().numpy()

        cfs.requires_grad = True
        grad, pred = self.get_gradient(cfs, data_instances, target, mask)
        grad = -grad.detach().numpy()

        pos_grad = grad.copy()
        pos_grad[pos_grad < 0] = 0
        neg_grad = grad.copy()
        neg_grad[neg_grad > 0] = 0
        valid_grad = pos_grad * valid_pos_grad_mask + neg_grad * valid_neg_grad_mask

        salient_attr = abs(valid_grad).argmax(axis=1)
        grad_sign = np.sign(grad)

        invalid_cfs = pred.argmax(
            axis=1).numpy() != target.argmax(axis=1).numpy()

        for i in range(len(projected_cfs)):
            if invalid_cfs[i]:
                salient_feature_name = feature_names[salient_attr[i]]
                if salient_feature_name in self.desc.keys() and self.desc[salient_feature_name]['type'] == 'numerical':
                    max_value = self.desc[salient_feature_name]['max']
                    min_value = self.desc[salient_feature_name]['min']
                    precision = self.desc[salient_feature_name]['decile']
                    scale = max_value - min_value
                    sign = grad_sign[i, salient_attr[i]]
                    update = sign * max(10**precision, round(abs(grad[i, salient_attr[i]])*self.lr*scale, precision))
                    if sign > 0:
                        update = min(update, max_value - projected_cfs.loc[i, salient_feature_name])
                    else:
                        update = max(update, min_value - projected_cfs.loc[i, salient_feature_name])
                    # update = grad_sign[i, salient_attr[i]] * 1 / \
                    #     10**self.desc[salient_feature_name]['decile']
                    if verbose:
                        print("{}: {:.3f}->{}: {}:{} + {}".format(
                            i, pred[i, 0], target[i, 0], salient_feature_name, projected_cfs.loc[i, salient_feature_name], update))
                    projected_cfs.loc[i, salient_feature_name] += update
                else:
                    update = 1.1 * grad_sign[i, salient_attr[i]]
                    cfs[i][salient_attr[i]] += update
                    projected_cfs.loc[i, :] = self.project(
                        cfs[i].detach().numpy()).loc[0, :]
                    if verbose:
                        print("{}: {:.3f}->{}: {} set {}".format(i,
                                                                 pred[i, 0], target[i, 0], salient_feature_name, update > 0))
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
