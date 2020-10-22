import numpy as np
import pandas as pd
from scipy.special import softmax
import timeit
import math
import copy
from collections import OrderedDict

import torch
from torch import nn
import torch.optim as optim

from cf_ml.cf_engine import CounterfactualExample, CounterfactualExampleBySubset

DEFAULT_SETTING = {
    'k': -1,
    'num': 1,
    'cf_range': {},
    'changeable_attr': 'all',
    'desired_class': 'opposite'
}

DEFAULT_CONFIG = {
    'feature_weights': 'mads',
    'validity_weight': 1,
    'proximity_weight': 0.01,
    'diversity_weight': 0,
    'lr': 0.01,
    'min_iter': 500,
    'max_iter': 2000,
    'project_frequency': 100,
    'post_steps': 10,
    'batch_size': 1024,
    'loss_diff': 1e-5,
    'metric': ['Validity_Rate', 'Avg_Distance'],
    "refine_with_topk": -1
}

class Softmax(nn.Module):

    def __init__(self, dummy_indexes):
        super(Softmax, self).__init__()

        self._dummy_indexes = dummy_indexes

    def forward(self, x):
        y = torch.tensor(x)
        for dummies in self._index_of_dummy_cat_features:
                y[:, dummies] = torch.softmax(x[:, dummies], dim=1)
        return y

class CFEnginePytorch:
    """A class to generate counterfactual examples."""

    def __init__(self, dataset, model_manager, config=DEFAULT_CONFIG):
        self._dataset = dataset
        self._mm = model_manager
        self._dir_manager = self._mm.dir_manager
        self._desc = self._dataset.description
        self._data_meta = self._dir_manager.dataset_meta
        self._target = self._data_meta["target"]
        self._prediction = self._data_meta["prediction"]
        self._features = self._data_meta["features"]
        self._columns = self._features + [self._target, self._prediction]
        self._config = {**DEFAULT_CONFIG, **config}

        self._index_of_num_features = [i for i, f in enumerate(self._dataset.features) if self._dataset.is_num(f)]
        dummy_features = [self._dataset.get_dummy_columns(f) for f in self._dataset.features if not self._dataset.is_num(f)]
        self._index_of_dummy_cat_features = [[self._dataset.dummy_features.index(d) for d in dummies] for dummies in dummy_features]
        min_scales = pd.DataFrame(self._data_meta["description"]).T['scale'].fillna(0)
        self._min_scales = np.array([min_scales[col] if col in min_scales else 0 for col in self._dataset.features])

    def update_config(self, new_config):
        self._config = {**self._config, **new_config}

    def generate_r_counterfactuals(self, subset_range=None, use_cache=True, cache=True, verbose=True):
        """
        """
        subset_range = subset_range if subset_range is not None else {}
        cf_range = copy.deepcopy(subset_range)
        subset = self._dataset.get_subset(filters=subset_range)
        X = subset[self._dataset.dummy_features]

        r_counterfactuals = CounterfactualExampleBySubset(self._data_meta, subset_range, subset)
        for feature in self._dataset.features:
            by_feature_cf_range = {k: v for k, v in cf_range.items() if k != feature}
            if use_cache and self._dir_manager.include_setting(subset_range, by_feature_cf_range):
                subset_cf = CounterfactualExample(self._data_meta, 
                    self._dir_manager.load_subset_cf(subset_range, by_feature_cf_range))
            else:
                subset_cf = self.generate_cfs_from_setting(X, setting={'cf_range': by_feature_cf_range}, verbose=verbose)

            if cache:
                self._dir_manager.save_subset_cf(subset_range, by_feature_cf_range, subset_cf.all)

            r_counterfactuals.append_counterfactuals(feature, subset_cf)
        return r_counterfactuals

    def generate_cfs_from_setting(self, X, setting=DEFAULT_SETTING, verbose=True):
        """Generate cfs to an instance or a dataset in the form of pandas.DataFrame. mini_batch is applied if batch_size > 1

        :param data: pandas.DataFrame, raw target dataset in the form of pandas.DataFrame
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
        batch_size = self._config["batch_size"]

        # init timer
        start_time = timeit.default_timer()
        data_num = len(X)
        mask = self._gradient_mask_by_setting(setting)
        if_sparse = self._if_sparse(setting)
        weights = self._feature_weights()
        min_values = self._generate_min_array(setting)
        max_values = self._generate_max_array(setting)
        reports = []

        # start generating
        for batch_num in range(math.ceil(data_num / batch_size)):
            checkpoint = timeit.default_timer()
            start_id = batch_num * batch_size
            end_id = min(batch_num * batch_size + batch_size, len(X))

            # init counterfactual values and targets
            original_X = self._expand_array(X.iloc[start_id: end_id].values, setting)
            # _y = self._expand_array(y.iloc[start_id: end_id].values, setting)
            targets = self._target_array(original_X, setting)
            inited_cfs = self._init_cfs(original_X, setting)

            # STEP-0: select top-k important features and update the mask if sparsity is required
            if if_sparse:
                cfs, _, loss, iter = self._optimize(inited_cfs, original_X, targets, mask, weights, min_values, max_values)
                top_k_features = self._topk_features(cfs, original_X)
                # update the mask with the top-k important feaures
                mask = self._gradient_mask(top_k_features)
            
            # STEP-1: optimize the counterfactual examples
            cfs, _, loss, iter = self._optimize(inited_cfs, original_X, targets, mask, weights, min_values, max_values)

            # STEP-2: refine counterfactual examples
            cfs = self._refine(cfs, original_X, targets, mask, weights, min_values, max_values, verbose=verbose > 1)
            
            # generate report (features, target, predictions) for counterfactual examples
            report = self._mm.report(x=cfs, y=targets, preprocess=False)
            reports.append(report)

            if verbose:
                print("[{}/{}]  Epoch-{}, time cost: {:.3f}s, loss: {:.3f}, iteration: {}, validation rate: {:.3f}".format(
                        end_id, data_num, batch_num, timeit.default_timer() - checkpoint, loss, iter, 
                        (report[self._target] == report[self._prediction]).sum()/len(report)))

        return CounterfactualExample(self._data_meta, pd.concat(reports))

    def _gradient_mask(self, changeable_attr):
        """"""
        if isinstance(changeable_attr, str) and changeable_attr == 'all':
            mask = pd.DataFrame(np.ones((1, len(self._dataset.dummy_features))), columns=self._dataset.dummy_features)
        else:
            mask = pd.DataFrame(np.zeros((1, len(self._dataset.dummy_features))), columns=self._dataset.dummy_features)
            for feature in changeable_attr:
                mask[self._dataset.get_dummy_columns(feature)] = 1
        return mask.values.squeeze()

    def _gradient_mask_by_setting(self, setting):
        """"""
        cf_range = setting.get('cf_range', DEFAULT_SETTING['cf_range'])
        changeable_attr = setting.get('changeable_attr', DEFAULT_SETTING['changeable_attr'])

        # set the mask of the unchangeable feature to 0
        mask = pd.DataFrame([self._gradient_mask(changeable_attr)], columns=self._dataset.dummy_features)

        # set the mask of banned categories to 0
        for feature, range in cf_range.items():
            if 'categories' in range:
                mask[self._dataset.get_dummy_columns(feature, range['categories'])] = 0

        return mask.values.squeeze()

    
    def _if_sparse(self, setting):
        k = setting.get('k', DEFAULT_SETTING['k'])
        changeable_attr = setting.get('changeable_attr', DEFAULT_SETTING['changeable_attr'])
        if isinstance(changeable_attr, str) and changeable_attr == 'all':
            changeable_attr = self._features
        sparse = k > 0 and k < len(changeable_attr)
        return sparse

    def _generate_max_array(self, setting):
        max_array = pd.DataFrame(np.ones((1, len(self._dataset.dummy_features))), columns=self._dataset.dummy_features)
        cf_range = setting.get('cf_range', DEFAULT_SETTING['cf_range'])

        # set the max value of numerical features according to cf_range
        for feature, range in cf_range.items():
            if 'max' in range:
                max_array[feature] = self._dataset.normalize_feature(feature, range['max'])
        
        # set the max value of banned categories to 0
        for feature, range in cf_range.items():
            if 'categories' in range:
                max_array[self._dataset.get_dummy_columns(feature, range['categories'])] = 0

        return max_array.values.squeeze()

    def _generate_min_array(self, setting):
        min_array = pd.DataFrame(np.zeros((1, len(self._dataset.dummy_features))), columns=self._dataset.dummy_features)

        cf_range = setting.get('cf_range', DEFAULT_SETTING['cf_range'])

        # set the min value of numerical features according to cf_range
        for feature, range in cf_range.items():
            if 'min' in range:
                min_array[feature] = self._dataset.normalize_feature(feature, range['min'])

        return min_array.values.squeeze()

    def _feature_weights(self, dummy=True):
        """"""
        if self._config['feature_weights'] == 'mads':
            mads = self._dataset.get_mads()
            if dummy:
                weights = np.array([round(1 / (1 + mads.get(f, 1)), 3) for f in self._dataset.dummy_features])
            else:
                weights = np.array([round(1 / (1 + mads[f]), 3) for f in self._dataset.features])
        elif self._config['feature_weights'] == 'unit':
            if dummy:
                weights = np.ones(len(self._dataset.dummy_features))
            else:
                weights = np.ones(len(self._dataset.features))
        else:
            raise NotImplementedError
        return weights

    def _target_array(self, original_X, setting):
        target = setting.get('desired_class', DEFAULT_SETTING['desired_class'])

        if isinstance(target, str) and target == 'opposite':
            original_X = torch.from_numpy(original_X).float()
            pred = self._mm.forward(original_X).detach().numpy()
            pred = pred > 0.5 - 1e-6
            target = np.logical_not(pred).astype(int)
            
        elif isinstance(target, list):
            target = np.array(target)
        
        return target

    def _init_cfs(self, X, setting, mask=None):
        if mask is None:
            mask = self._gradient_mask_by_setting(setting)

        cfs = pd.DataFrame(X, columns=self._dataset.dummy_features)
        cfs += mask * np.random.rand(*cfs.shape) * 0.1

        for feature in self._dataset.categorical_features:
            dummy_features = self._dataset.get_dummy_columns(feature)
            # cfs[dummy_features] = softmax(np.random.rand(cfs.shape[0], len(dummy_features)), axis=1)
            cfs[dummy_features] = np.ones((cfs.shape[0], len(dummy_features))) * 0.5

        return cfs.values

    def _expand_array(self, array, setting):
        k = setting.get('num', DEFAULT_SETTING['num'])
        return np.repeat(array, k, axis=0)

    def _topk_features(self, cfs, original_X):
        feature_weights = self._feature_weights(dummy=False)
        difference = self._dataset.inverse_preprocess_X(cfs) - self._dataset.inverse_preprocess_X(original_X)
        topk_features_index = abs(feature_weights * difference.values).argsort(dim=1, descending=True)[:, :k]
        return [self._dataset.features[i] for i in topk_features_index]

    def _optimize(self, cfs, original_X, target, mask, weights=None, min_values=None, max_values=None):

        cfs = torch.from_numpy(cfs).float()
        cfs.requires_grad = True
        original_X = torch.from_numpy(original_X).float()
        target = torch.from_numpy(target).float()
        mask = torch.from_numpy(mask).int()

        if min_values is not None:
            min_values = torch.from_numpy(min_values).float()
        if max_values is not None:
            max_values = torch.from_numpy(max_values).float()
        if weights is not None:
            weights = torch.from_numpy(weights).float()

        def backward_hook(grad):
            out = grad.clone()
            out = out * mask
            return out

        cfs.register_hook(backward_hook)

        optimizer = optim.SGD([cfs], lr=self._config['lr'])
        criterion = nn.MarginRankingLoss(reduction='sum')

        stored_loss = 0
        for iter in range(self._config["max_iter"]):

            optimizer.zero_grad()
            pred = self._mm.forward(cfs)

            loss = self._loss(cfs, original_X, pred, target, criterion, weights, min_values, max_values)
            loss.backward()
            optimizer.step()

            if self._stopable(iter, pred, target, stored_loss - loss):
                break

            if iter % self._config["project_frequency"] == 0:
                cfs.data = self._clip_tensor(cfs.data, min_values, max_values)
                cfs.data = self._reload_tensor(cfs.data)
            
            stored_loss = loss.clone()

        cfs.data = self._clip_tensor(cfs.data, min_values, max_values)
        return cfs.detach().numpy(), pred.detach().numpy(), loss.detach().numpy(), iter

    def _loss(self, cfs, original_X, pred, target, criterion, weights=None, min_values=None, max_values=None):
        # prediction loss
        loss = self._config["validity_weight"] * criterion(pred, torch.ones(pred.shape) * 0.5, target)

        # proximity loss
        loss += self._config["proximity_weight"] * self._proximity_loss(cfs, original_X, weights, 'L1')

        # diversity loss
        if self._config["diversity_weight"] > 0 and self.cf_num > 1:
            loss += self._config["diversity_weight"] * self._diversity_loss(cfs, weights, 'avg')

        return loss

    def _proximity_loss(self, cfs, original_X, weights=None, metric='L1'):
        proximity_loss = torch.sum(self._distance_quick(
            cfs, original_X, weights, metric))
        return proximity_loss

    def _diversity_loss(self, cfs, weights=None, metric='avg'):
        diversity_loss = torch.tensor(0).float()
        if metric == 'avg':
            for i in range(len(cfs) // self.cf_num):
                for j in range(self.cf_num):
                    start = i * self.cf_num
                    end = (i + 1) * self.cf_num
                    diversity_loss += (1 - self._distance_quick(cfs[start: end], cfs[start + j]).mean(), weights)
        else:
            raise NotImplementedError
        return diversity_loss

    def _distance(self, cf, origin, weights=None, metric='L1'):
        diff = torch.abs(cf - origin)
        if weights is not None:
            diff = diff * weights

        if metric == 'L1':
            dist = torch.sum(diff)
        elif metric == 'L2':
            dist = torch.sum(diff ** 2)
        return dist

    def _distance_quick(self, cfs, origins, weights=None, metric='L1'):
        if origins.dim == 1:
            origins = origins.unsqueeze(0).repeat(len(cfs), 1)

        diff = torch.abs(cfs - origins)
        if weights is not None:
            diff = diff * weights.unsqueeze(0).repeat(len(cfs), 1)

        if metric == 'L1':
            dist = torch.sum(diff, axis=1)
        elif metric == 'L2':
            dist = torch.sum(diff**2, axis=1)

        return dist

    def _clip_tensor(self, data, min_tensor=None, max_tensor=None):
        if min_tensor is not None:
            data = torch.max(data, min_tensor)
        if max_tensor is not None:
            data = torch.min(data, max_tensor)
        return data

    def _reload_tensor(self, data):
        return torch.from_numpy(self._dataset.preprocess_X(self._dataset.inverse_preprocess_X(data)).values).float()

    def _check_valid(self, pred, target):
        pred_class = pred.argmax(axis=1).numpy()
        target_class = target.argmax(axis=1).numpy()
        return np.equal(pred_class, target_class).all()

    def _stopable(self, iter, pred, target, loss_diff):
        if iter < self._config["min_iter"]:
            return False
        elif iter <= self._config["project_frequency"]:
            return False
        elif iter >= self._config["max_iter"]:
            return True
        elif self._check_valid(pred, target) and loss_diff < self._config["loss_diff"]:
            return True
        else:
            return False

    def _get_gradient(self, cfs, original_X, target, criterion, weight):

        pred = self._mm.forward(cfs)
        loss = self._loss(cfs, original_X, pred, target, criterion, weight)

        loss.backward()
        gradient = cfs.grad
        return gradient, pred

    def _refine(self, cfs, original_X, targets, mask, weights=None, min_values=None, max_values=None, verbose=True):

        numerical_feature_mask = self._gradient_mask(self._dataset.numerical_features)
        if weights is not None:
            weights = torch.from_numpy(weights).float()
        inv_cfs = self._dataset.inverse_preprocess_X(cfs)
        cfs = torch.from_numpy(cfs).float()
        original_X = torch.from_numpy(original_X).float()
        targets = torch.from_numpy(targets).float()
        cfs.requires_grad = True
        
        criterion = nn.MarginRankingLoss(reduction='sum')

        for iter in range(self._config["post_steps"]):
            cfs.data = torch.from_numpy(self._dataset.preprocess_X(inv_cfs).values).float()

            grad, pred = self._get_gradient(cfs, original_X, targets, criterion, weights)

            if self._check_valid(pred, targets):
                break

            invalid_index = (pred.argmax(axis=1) != targets.argmax(axis=1)).int().numpy()
            invalid_mask = np.repeat(invalid_index[:, np.newaxis], cfs.shape[1], axis=1)

            # only numerical features will be updated in the refinement process
            grad_updates = -grad.detach().numpy() * mask * numerical_feature_mask * invalid_mask * self._config["lr"]
            inv_grad_updates = self._inverse_updates(cfs.detach().numpy(), grad_updates, min_values, max_values)
            scale_udpates = self._min_scales * np.sign(inv_grad_updates)
            inv_scale_udpates = self._inverse_updates(cfs.detach().numpy(), scale_udpates, min_values, max_values, False)

            # select the top-k feature
            if self._config["refine_with_topk"] > 0:
                inv_salient_update_mask = abs(inv_grad_updates).argsort(axis=1) >= (inv_grad_updates.shape[1] - self._config["refine_with_topk"])
                inv_grad_updates = inv_grad_updates * inv_salient_update_mask 
                inv_scale_udpates = inv_scale_udpates * inv_salient_update_mask

            inv_updates = (abs(inv_grad_updates) >= abs(inv_scale_udpates)) * inv_grad_updates \
                    + (abs(inv_scale_udpates) > abs(inv_grad_updates)) * inv_scale_udpates

            # apply updates to the counterfactuals in the original data space
            inv_cfs[self._dataset.numerical_features] += inv_updates[:, self._index_of_num_features]

        return self._dataset.preprocess_X(inv_cfs)

    def _inverse_updates(self, cfs, updates, min_values=None, max_values=None, preprocess=True):
        process = self._dataset.preprocess_X
        inverse = self._dataset.inverse_preprocess_X
        min_values = min_values if min_values is not None else 0
        max_values = max_values if max_values is not None else 1
        if preprocess:
            updates = np.clip(cfs + updates, a_min=min_values, a_max=max_values) - cfs
            updated = inverse(cfs + updates)
        else:
            updated = inverse(cfs)
            updated[self._dataset.numerical_features] += updates[:, self._index_of_num_features]
            updated = inverse(np.clip(process(updated).values, a_min=min_values, a_max=max_values))
        original = self._dataset.inverse_preprocess_X(cfs)
        num_diff = updated[self._dataset.numerical_features] - original[self._dataset.numerical_features] 
        all_diff = pd.DataFrame(columns=self._dataset.features)
        all_diff[self._dataset.numerical_features] = num_diff
        return all_diff.fillna(0).values

    def _scales(self):
        scale = pd.DataFrame(self._data_meta["description"]).T['scale'].fillna(0)
        scales = np.array([scale[col] if col in scale else 0 for col in self._dataset.features])
        return scales
