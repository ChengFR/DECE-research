import numpy as np
import pandas as pd
from scipy.special import softmax
import timeit
import math
import copy

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
    'diversity_weight': 0.01,
    'lr': 0.01,
    'min_iter': 500,
    'max_iter': 2000,
    'project_frequency': 250,
    'post_steps': 10,
    'batch_size': 1024,
    'loss_diff': 1e-5,
    "refine_with_topk": -1,
    'perturbation': 'unit'
}


class CFEnginePytorch:
    """A class to generate counterfactual examples.

    Args:
        dataset: dataset.Dataset, target dataset.
        model_manager: model.PytorchModelManager, target model.
        config: dict,
            feature_weights: 'mads' or 'unit', feature weighting algorithm name in distance calculating;
            validity_weight: number, weight of the validity term in the loss function;
            proximity_weight: number, weight of the proximity term in the loss function;
            diversity_weight: number, weight of the diversity term in the loss function;
            lr: number, learning rate in the optimization procedure;
            min_iter: number, number of the minimal iterations processed;
            max_iter: number, number of the maximal iterations processed;
            project_frequency: number, frequency of applying tensor clipping and reloading 
                in the optimization procedure;
            post_steps: number, the number of maximal iterations in the refinement procedure;
            batch_size: number, the size of the mini-batch;
            loss_diff: number, the minimal loss difference for an early stop of the optimization;
            refine_with_topk: number, the number of features to update in one iteration 
                in the refinement procedure.
            perturbation: 'unit', 'random' or 'none', method used to perturb the dummy features. 
    """

    def __init__(self, dataset, model_manager, config=None):
        self._dataset = dataset
        self._mm = model_manager
        self._dir_manager = self._mm.dir_manager
        self._desc = self._dataset.description
        self._data_meta = self._dir_manager.dataset_meta
        self._target = self._data_meta["target"]
        self._prediction = self._data_meta["prediction"]
        self._features = self._data_meta["features"]
        self._columns = self._features + [self._target, self._prediction]
        if config is None:
            config = DEFAULT_CONFIG
        self._config = {**DEFAULT_CONFIG, **config}

        self._index_of_num_features = [i for i, f in enumerate(self._dataset.features) if
                                       self._dataset.is_num(f)]
        dummy_features = [self._dataset.get_dummy_columns(f) for f in self._dataset.features if
                          not self._dataset.is_num(f)]
        self._index_of_dummy_cat_features = [
            [self._dataset.dummy_features.index(d) for d in dummies] for dummies in dummy_features]
        min_scales = pd.DataFrame(self._data_meta["description"]).T['scale'].fillna(0)
        self._min_scales = np.array(
            [min_scales[col] if col in min_scales else 0 for col in self._dataset.features])

    def update_config(self, new_config):
        self._config = {**self._config, **new_config}

    def generate_r_counterfactuals(self, subset_range=None, use_cache=True, cache=True,
                                   verbose=True):
        """Generate r-counterfactuals (subgroup counterfactuals).

        Args:
            subset_range: dict, keys are feature names and values are the min/max/(allowed) 
                categories of the counterfactual examples' feature values.
            use_cache: boolean, whether to use the cached the r-counterfactuals if exists.
            cache: boolean, whether to restore the r-counterfactuals.
            verbose: boolean, whether to log information.

        Returns:
            A cf_engine.CounterfactualExampleBySubset object storing r-counterfactuals.
        """
        subset_range = subset_range if subset_range is not None else {}
        cf_range = copy.deepcopy(subset_range)
        subset = self._dataset.get_subset(filters=subset_range, preprocess=False)
        X = subset[self._dataset.features]

        r_counterfactuals = CounterfactualExampleBySubset(self._data_meta, subset_range, subset)
        for feature in self._dataset.features:
            by_feature_cf_range = {k: v for k, v in cf_range.items() if k != feature}
            if use_cache and self._dir_manager.include_setting(subset_range, by_feature_cf_range):
                subset_cf = CounterfactualExample(self._data_meta,
                                                  self._dir_manager.load_subset_cf(subset_range,
                                                                                   by_feature_cf_range))
                if verbose:
                    print("Load from cache... #instance: {}, validation rate: {:.3f}".format(
                        len(subset_cf.all),
                        len(subset_cf.valid) / len(subset_cf.all)))
            else:
                subset_cf = self.generate_counterfactual_examples(X, setting={
                    'cf_range': by_feature_cf_range}, verbose=verbose)

            if cache:
                self._dir_manager.save_subset_cf(subset_range, by_feature_cf_range, subset_cf.all)

            r_counterfactuals.append_counterfactuals(feature, subset_cf)
        return r_counterfactuals

    def generate_counterfactual_examples(self, X, setting=None, preprocess=True,
                                         verbose=True):
        """Generate counterfactual explanations to the given preprocessed data.

        Args:
            X: pd.DataFrame data-input-like, feature values of the target data
            preprocess: boolean, whether to preprocess the target data
            setting: dict,
                k: number, maximal number of changed attributes in each counterfactual example;
                num: number, number of counterfactual examples generated for each data instance;
                cf_range: dict, variation ranges for attributes;
                changeable_attr: list or 'all', the name of changeable attributes. 'All' means that
                    all features are changeable;
                desired_class: list, np.array, or 'opposite', target classes of the counterfactual 
                    examples. 'Opposite' means that the target classes are the opposite ones to 
                    the predictions from the original instances in a bi-classification problem.
            verbose: boolean, whether to log information.

        Returns:
            A cf_engine.CounterfactualExample object storing counterfactual examples.
        """
        if setting is None:
            setting = DEFAULT_SETTING
        batch_size = self._config["batch_size"]
        n = setting.get('num', DEFAULT_SETTING['num'])
        k = setting.get('k', DEFAULT_SETTING['k'])

        if preprocess:
            X = self._dataset.preprocess_X(X)

        data_num = len(X)
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

            # generate the gradient mask according the setting
            mask = self._gradient_mask_by_setting(setting)

            # init counterfactual values and targets
            original_X = self._expand_array(X.iloc[start_id: end_id].values, setting)
            targets = self._target_array(original_X, setting)

            # STEP-0: select top-k important features and update the mask if sparsity is required
            if if_sparse:
                inited_cfs = self._init_cfs(original_X, setting, mask)
                cfs, _, loss, iter = self._optimize(inited_cfs, original_X, targets, mask, n,
                                                    weights, min_values, max_values)
                top_k_features = self._topk_features(cfs, original_X, k)
                # update the mask with the top-k important feaures
                mask = np.array(
                    [self._gradient_mask_by_setting(setting, top_k) for top_k in top_k_features])

            # STEP-1: optimize the counterfactual examples
            inited_cfs = self._init_cfs(original_X, setting, mask)
            cfs, _, loss, iter = self._optimize(inited_cfs, original_X, targets, mask, n, weights,
                                                min_values, max_values)

            # STEP-2: refine counterfactual examples
            cfs = self._refine(cfs, original_X, targets, mask, n, weights, min_values, max_values)

            # generate report (features, target, predictions) for counterfactual examples
            report = self._mm.report(x=cfs, y=targets, preprocess=False)
            reports.append(report)

            if verbose:
                valid_rate = (report[self._target] == report[self._prediction]).sum() / len(report)
                print("[{}/{}]  Epoch-{}, time cost: {:.3f}s, loss: {:.3f}, iterations: {}, "
                      "validation rate: {:.3f}".format(end_id, data_num, batch_num,
                                                       timeit.default_timer() - checkpoint,
                                                       loss, iter, valid_rate))

        return CounterfactualExample(self._data_meta, pd.concat(reports))

    def _gradient_mask(self, changeable_attr):
        """Generate boolean mask array from a list of changeable attributes."""
        if isinstance(changeable_attr, str) and changeable_attr == 'all':
            mask = pd.DataFrame(np.ones((1, len(self._dataset.dummy_features))),
                                columns=self._dataset.dummy_features)
        else:
            mask = pd.DataFrame(np.zeros((1, len(self._dataset.dummy_features))),
                                columns=self._dataset.dummy_features)
            for feature in changeable_attr:
                mask[self._dataset.get_dummy_columns(feature)] = 1
        return mask.values.squeeze()

    def _gradient_mask_by_setting(self, setting, changeable_attr=None):
        """Generate boolean mask array from setting."""

        cf_range = setting.get('cf_range', DEFAULT_SETTING['cf_range'])
        if changeable_attr is None:
            changeable_attr = setting.get('changeable_attr', DEFAULT_SETTING['changeable_attr'])

        # set the mask of the unchangeable feature to 0
        mask = pd.DataFrame([self._gradient_mask(changeable_attr)],
                            columns=self._dataset.dummy_features)

        # set the mask of banned categories to 0
        for feature, range in cf_range.items():
            if not self._dataset.is_num(feature) and 'categories' in range:
                cached_mask = mask[self._dataset.get_dummy_columns(feature, range['categories'])]
                mask[self._dataset.get_dummy_columns(feature)] = 0
                mask[self._dataset.get_dummy_columns(feature, range['categories'])] = cached_mask

        return mask.values.squeeze()

    def _if_sparse(self, setting):
        """Check whether a feature selection procedure should be processed to 
        fulfill the sparsity requirements."""
        k = setting.get('k', DEFAULT_SETTING['k'])
        changeable_attr = setting.get('changeable_attr', DEFAULT_SETTING['changeable_attr'])
        if isinstance(changeable_attr, str) and changeable_attr == 'all':
            changeable_attr = self._features
        sparse = 0 < k < len(changeable_attr)
        return sparse

    def _generate_max_array(self, setting):
        """Generate an array of the maximal values of all attributes."""
        max_array = pd.DataFrame(np.ones((1, len(self._dataset.dummy_features))),
                                 columns=self._dataset.dummy_features)
        cf_range = setting.get('cf_range', DEFAULT_SETTING['cf_range'])

        # set the max value of numerical features according to cf_range
        for feature, range in cf_range.items():
            if self._dataset.is_num(feature) and 'max' in range:
                max_array[feature] = self._dataset.normalize_feature(feature, range['max'])

        # set the max value of banned categories to 0
        for feature, range in cf_range.items():
            if not self._dataset.is_num(feature) and 'categories' in range:
                max_array[self._dataset.get_dummy_columns(feature)] = 0
                max_array[self._dataset.get_dummy_columns(feature, range['categories'])] = 1

        return max_array.values.squeeze()

    def _generate_min_array(self, setting):
        """Generate an array of the minimal values of all attributes."""
        min_array = pd.DataFrame(np.zeros((1, len(self._dataset.dummy_features))),
                                 columns=self._dataset.dummy_features)

        cf_range = setting.get('cf_range', DEFAULT_SETTING['cf_range'])

        # set the min value of numerical features according to cf_range
        for feature, range in cf_range.items():
            if self._dataset.is_num(feature) and 'min' in range:
                min_array[feature] = self._dataset.normalize_feature(feature, range['min'])

        return min_array.values.squeeze()

    def _feature_weights(self, dummy=True):
        """Generate weights to all attributes."""
        if self._config['feature_weights'] == 'mads':
            mads = self._dataset.get_mads()
            weights = np.array(
                [round(1 / (1 + mads.get(f, 1)), 3) for f in self._dataset.dummy_features])
        elif self._config['feature_weights'] == 'unit':
            weights = np.ones(len(self._dataset.dummy_features))
        else:
            raise NotImplementedError
        return weights

    def _target_array(self, original_X, setting):
        """Generate the target array of counterfactual examples."""
        target = setting.get('desired_class', DEFAULT_SETTING['desired_class'])

        if isinstance(target, str) and target == 'opposite':
            original_X = torch.from_numpy(original_X).float()
            pred = self._mm.forward(original_X).detach().numpy()
            pred = pred > (0.5 - 1e-6)
            target = np.logical_not(pred).astype(int)

        elif isinstance(target, list):
            target = np.array(target)

        return target

    def _init_cfs(self, X, setting, mask=None):
        """Initialize counterfactual examples with random perturbation."""
        if mask is None:
            mask = self._gradient_mask_by_setting(setting)

        num_mask = self._gradient_mask(self._dataset.numerical_features) * mask
        cat_mask = self._gradient_mask(self._dataset.categorical_features) * mask

        # add random perturbations to numerical features
        cfs = pd.DataFrame(X, columns=self._dataset.dummy_features)
        cfs += num_mask * np.random.rand(*cfs.shape) * 0.1

        # assign random values to categorical dummy features
        if self._config["perturbation"] == 'unit':
            cfs -= cat_mask * cfs
            cfs += cat_mask * np.ones((cfs.shape[0], cat_mask.shape[-1])) * 0.5
        elif self._config["perturbation"] == 'random':
            cfs -= cat_mask * cfs
            cfs += softmax(np.random.rand(cfs.shape[0], cat_mask.shape[-1]), axis=1)
        elif self._config["perturbation"] == 'none':
            pass
        else:
            raise NotImplementedError

        return cfs.values

    def _expand_array(self, array, setting):
        """Expand an array n times. n is the number of the counterfactual examples 
        for each instance."""
        n = setting.get('num', DEFAULT_SETTING['num'])
        return np.repeat(array, n, axis=0)

    def _topk_features(self, cfs, original_X, k):
        """Get the name of top-k features according to normalized difference from their 
        original values"""
        feature_weights = self._feature_weights()
        cfs = self._dataset.preprocess_X(self._dataset.inverse_preprocess_X(cfs))
        original_X = self._dataset.preprocess_X(self._dataset.inverse_preprocess_X(original_X))
        diff = pd.DataFrame(abs(cfs - original_X) * feature_weights,
                            columns=self._dataset.dummy_features)
        aggr_diff = pd.DataFrame(columns=self._dataset.features)
        aggr_diff[self._dataset.numerical_features] = diff[self._dataset.numerical_features]
        for feature in self._dataset.categorical_features:
            dummies = self._dataset.get_dummy_columns(feature)
            # if a categorical feature value is changed, then the difference is 1, else 0
            aggr_diff[feature] = diff[dummies].max(axis=1)
        index_mat = aggr_diff.values.argsort(axis=1)[:, -k:]
        return np.array(self._dataset.features)[index_mat]

    def _optimize(self, cfs, original_X, target, mask, num, weights=None, min_values=None,
                  max_values=None):
        """Optimize the counterfactual examples according a mixed loss function 
        through a gradient-based optimizer."""
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
            out = mask * out
            return out

        cfs.register_hook(backward_hook)

        optimizer = optim.SGD([cfs], lr=self._config['lr'])
        criterion = nn.MarginRankingLoss(reduction='sum')
        stored_loss = 0
        
        if self._config["max_iter"] <= 0:
            raise ValueError("The maximum iteration should greater than 0.")
        
        for iter in range(self._config["max_iter"]):
            optimizer.zero_grad()
            pred = self._mm.forward(cfs)
            loss = self._loss(cfs, original_X, pred, target, criterion, num, weights)
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

    def _loss(self, cfs, original_X, pred, target, criterion, num, weights=None):
        """A mixed loss function"""
        # prediction loss
        loss = self._config["validity_weight"] * criterion(pred, torch.ones(pred.shape) * 0.5,
                                                           target)

        # proximity loss
        loss += self._config["proximity_weight"] * self._proximity_loss(cfs, original_X, weights,
                                                                        'L1')

        # diversity loss
        if self._config["diversity_weight"] > 0 and num > 1:
            loss += self._config["diversity_weight"] * self._diversity_loss(cfs, num, weights,
                                                                            'L1')

        return loss

    def _proximity_loss(self, cfs, original_X, weights=None, metric='L1'):
        """Proximity term in the loss function"""
        proximity_loss = torch.sum(self._distance_quick(
            cfs, original_X, weights, metric))
        return proximity_loss

    def _diversity_loss(self, cfs, num, weights=None, metric='L1', diversity='sum'):
        """Diversity term in the loss function"""
        diversity_loss = torch.tensor(0).float()
        if diversity == 'sum':
            for i in range(len(cfs) // num):
                for j in range(num):
                    start = i * num
                    end = (i + 1) * num
                    diversity_loss += -self._distance_quick(cfs[start: end], cfs[start + j],
                                                            weights, metric).mean()
        else:
            raise NotImplementedError
        return diversity_loss

    def _distance(self, cf, origin, weights=None, metric='L1'):
        """Get the distance between the counterfactual examples and the original instances."""
        diff = torch.abs(cf - origin)
        if weights is not None:
            diff = diff * weights

        if metric == 'L1':
            dist = torch.sum(diff)
        elif metric == 'L2':
            dist = torch.sum(diff ** 2)
        else:
            raise NotImplementedError
        return dist

    def _distance_quick(self, cfs, origins, weights=None, metric='L1'):
        """Get the distance between a batch of counterfactual examples 
            and the original instances."""
        if origins.dim == 1:
            origins = origins.unsqueeze(0).repeat(len(cfs), 1)

        diff = torch.abs(cfs - origins)
        if weights is not None:
            diff = diff * weights.unsqueeze(0).repeat(len(cfs), 1)

        if metric == 'L1':
            dist = torch.sum(diff, dim=1)
        elif metric == 'L2':
            dist = torch.sum(diff ** 2, dim=1)
        else:
            raise NotImplementedError

        return dist

    def _clip_tensor(self, data, min_tensor=None, max_tensor=None):
        """Clip the tensor with the minimal values and the maximal values."""
        if min_tensor is not None:
            data = torch.max(data, min_tensor)
        if max_tensor is not None:
            data = torch.min(data, max_tensor)
        return data

    def _reload_tensor(self, data):
        """Re-do the preprocessing to the data aftering an inverse-preprocessing"""
        inversed_data = self._dataset.inverse_preprocess_X(data)
        return torch.from_numpy(self._dataset.preprocess_X(inversed_data).values).float()

    def _check_valid(self, pred, target):
        """Check whether all counterfactual examples are valid."""
        pred_class = pred.argmax(axis=1).numpy()
        target_class = target.argmax(axis=1).numpy()
        return np.equal(pred_class, target_class).all()

    def _stopable(self, iter, pred, target, loss_diff):
        """Check whether the optimization can stop."""
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

    def _get_gradient(self, cfs, original_X, target, criterion, num, weights):
        """Get the gradients to the counterfactual examples according the mixed loss function."""
        pred = self._mm.forward(cfs)
        loss = self._loss(cfs, original_X, pred, target, criterion, num, weights)

        loss.backward()
        gradient = cfs.grad
        return gradient, pred

    def _refine(self, cfs, original_X, targets, mask, num, weights=None, min_values=None,
                max_values=None, verbose=True):
        """Refine the counterfactual examples."""
        numerical_feature_mask = self._gradient_mask(self._dataset.numerical_features)
        if weights is not None:
            weights = torch.from_numpy(weights).float()
        inv_cfs = self._dataset.inverse_preprocess_X(cfs)
        cfs = torch.from_numpy(cfs).float()
        original_X = torch.from_numpy(original_X).float()
        targets = torch.from_numpy(targets).float()
        cfs.requires_grad = True

        criterion = nn.MarginRankingLoss(reduction='sum')

        for _ in range(self._config["post_steps"]):
            cfs.data = torch.from_numpy(self._dataset.preprocess_X(inv_cfs).values).float()

            grad, pred = self._get_gradient(cfs, original_X, targets, criterion, num, weights)

            if self._check_valid(pred, targets):
                break

            invalid_index = (pred.argmax(axis=1) != targets.argmax(dim=1)).int().numpy()
            invalid_mask = np.repeat(invalid_index[:, np.newaxis], cfs.shape[1], axis=1)

            # only numerical features will be updated in the refinement process
            grad_updates = -grad.detach().numpy() * mask * numerical_feature_mask * \
                           invalid_mask * self._config["lr"]
            inv_grad_updates = self._inverse_updates(cfs.detach().numpy(), grad_updates,
                                                     min_values, max_values)
            scale_udpates = self._min_scales * np.sign(inv_grad_updates)
            inv_scale_udpates = self._inverse_updates(cfs.detach().numpy(), scale_udpates,
                                                      min_values, max_values, False)

            # select the top-k feature
            if self._config["refine_with_topk"] > 0:
                inv_salient_update_mask = abs(inv_grad_updates).argsort(axis=1) >= (
                    inv_grad_updates.shape[1] - self._config["refine_with_topk"])
                inv_grad_updates = inv_grad_updates * inv_salient_update_mask
                inv_scale_udpates = inv_scale_udpates * inv_salient_update_mask

            inv_updates = (abs(inv_grad_updates) >= abs(inv_scale_udpates)) * inv_grad_updates \
                          + (abs(inv_scale_udpates) > abs(inv_grad_updates)) * inv_scale_udpates

            # apply updates to the counterfactuals in the original data space
            inv_cfs[self._dataset.numerical_features] += inv_updates[:,
                                                         self._index_of_num_features]

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
        num_diff = updated[self._dataset.numerical_features] - original[
            self._dataset.numerical_features]
        all_diff = pd.DataFrame(columns=self._dataset.features)
        all_diff[self._dataset.numerical_features] = num_diff
        return all_diff.fillna(0).values
