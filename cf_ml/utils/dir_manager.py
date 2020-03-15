import os
import io
import json
import shutil
import collections
import torch
import pandas as pd
import numpy as np

from cf_engine.counterfactual import CounterfactualExampleBySubset

OUTPUT_ROOT = os.path.join(os.path.dirname(__file__), 'output')


class DirectoryManager:
    """A class to manage the path of the model files and output files"""

    def __init__(self, dataset, model_manager, root=OUTPUT_ROOT, auto_save=True):
        self.root = root
        self.createifnotexist(self.root)
        self.dir = None
        self._init = False
        self.dataset = dataset
        self.model_manager = model_manager
        self.desc = self.dataset.get_description()
        self.data_meta = {}
        self.model_meta = {}
        self.cf_setting = []
        self.cache_capacity = 100
        self.auto_save = auto_save

    def load_meta_from_path(self, dirpath):
        if not os.path.isdir(dirpath):
            raise FileNotFoundError('{} doesn\'t exists.'.format(dirpath))
        meta_path = os.path.join(dirpath, 'meta.json')
        with open(meta_path) as f:
            meta_info = json.load(f)
        self.data_meta = meta_info['data_meta']
        self.model_meta = meta_info['model_meta']
        self.cf_setting = meta_info['cf_setting']
        self.dir = dirpath
        self._init = True

    def load_meta(self):
        dataset_name = self.dataset.get_name()
        model_name = self.model_manager.get_name()
        self.load_meta_from_path(os.path.join(
            self.root, dataset_name, model_name))

    def init(self):
        dataset_name = self.dataset.get_name()
        model_name = self.model_manager.get_name()
        # self.createifnotexist(os.path.join(self.root, dataset_name))
        self.dir = os.path.join(self.root, dataset_name, model_name)
        self.ensure_dir()

        self.update_dataset_meta()
        self.update_model_meta()

        self._init = True

    def update_dataset_meta(self):
        self.data_meta = {'name': self.dataset.get_name(),
                          'description': self.desc,
                          'target_name': self.dataset.get_target_names(preprocess=False)}

    def update_model_meta(self):
        self.model_meta = {'name': self.model_manager.get_name(),
                           'train_accuracy': self.model_manager.get_train_accuracy(),
                           'test_accuracy': self.model_manager.get_test_accuracy()}

    def save_meta(self):
        if self._init is False:
            raise ValueError('DirectoryManager save before init.')
        with open(os.path.join(self.dir, 'meta.json'), 'w') as f:
            f.write(json.dumps({'data_meta': self.data_meta,
                                'model_meta': self.model_meta, 'cf_setting': self.cf_setting}))

    def _get_model_path(self):
        return os.path.join(self.dir, '{}_test_accuracy_{:.3f}'.format(self.model_meta['name'], self.model_meta['test_accuracy']))

    def save_pytorch_model_state(self, model_state):
        if self.model_meta['test_accuracy'] is not None:
            old_model_path = self._get_model_path()
            if os.path.exists(old_model_path):
                os.remove(old_model_path)
        self.update_model_meta()

        new_path = self._get_model_path()
        torch.save(model_state, new_path)

        if self.auto_save:
            self.save_meta()

    def load_pytorch_model_state(self):
        model_path = self._get_model_path()
        return torch.load(model_path)

    def save_prediction(self, data_df, dataset_name='dataset'):
        """ a tmp implementation
        :param dataset_name: str, in ['dataset', 'train_dataset', 'test_dataset']
        """
        data_df.to_csv(os.path.join(self.dir, dataset_name+'.csv'))

    def load_prediction(self, dataset_name='dataset', only_valid=False):
        """ a tmp implementation
        :param dataset_name: str, in ['dataset', 'train_dataset', 'test_dataset']
        """
        data_df = pd.read_csv(os.path.join(self.dir, dataset_name+'.csv'))
        if only_valid:
            for col in self.dataset.get_feature_names(preprocess=False):
                if self.desc[col]['type'] == 'numerical':
                    data_df = data_df[data_df[col] >= self.desc[col]['min']]
                    data_df = data_df[data_df[col] <= self.desc[col]['max']]
                else:
                    data_df = data_df[data_df[col].isin(
                        self.desc[col]['category'])]
        return data_df

    def equal_setting(self, s1, s2):
        return self.equal_attributes(s1.get('changeable_attribute', []), s2.get('changeable_attribute', [])) \
            and s1.get('index', 'all') == s1.get('index', 'all') \
            and s1.get('k', -1) == s1.get('k', -1) \
            and s1.get('cf_num', 1) == s1.get('cf_num', 1) \
            and self.equal_ranges(s1.get('cf_range', {}), s1.get('cf_range', {})) \
            and self.equal_ranges(s1.get('data_range', {}), s2.get('data_range', {})) \
            and s1.get('desired_class', 'opposite') == s2.get('desired_class', 'opposite')

    def contain_setting(self, s1, s2):
        pass

    def equal_attributes(self, a1, a2):
        if isinstance(a1, str) and isinstance(a2, str):
            return a1 == a2
        elif isinstance(a1, list) and isinstance(a2, list):
            return len(sorted(a1)) == len(sorted(a2)) and '_'.join(sorted(a1)) == '_'.join(sorted(a2))
        else:
            return False

    def equal_ranges(self, r1, r2):
        return self.contain_ranges(r1, r2) and self.contain_ranges(r2, r1)

    def contain_ranges(self, r1, r2):
        flag = True
        r1 = self.simplify_ranges(r1)
        r2 = self.simplify_ranges(r2)
        for col, info in self.desc.items():
            if col in r2:
                if col in r1:
                    if info['type'] == 'categorical':
                        if not np.array([cat in r1[col]['category'] for cat in r2[col]['category']]).all():
                            flag = False
                            break
                    else:
                        if r2[col]['min'] < r1[col]['min'] or r2[col]['max'] > r1[col]['max']:
                            flag = False
                            break
                else:
                    flag = False
                    break
        return flag

    def simplify_ranges(self, r):
        new_range = {}
        for col, info in r.items():
            if self.desc[col]['type'] == 'categorical':
                if not np.array([cat in self.desc[col]['category'] for cat in info['category']]).all():
                    new_range[col] = info
            if self.desc[col]['type'] == 'numerical':
                if info['min'] > (self.desc[col]['min']+1e-4) or info['max'] < (self.desc[col]['max']-1e-4):
                    new_range[col] = info
        return new_range

    def save_cf_with_setting(self, subset_cf, setting):
        index = self.indexof_setting(setting)
        if index < 0:
            index = len(self.cf_setting)
            self.cf_setting.append(setting)
        subset_cf.to_csv('{}'.format(index), self.dir)
        if self.auto_save:
            self.save_meta()

    def load_cf_with_setting(self, setting):
        index = self.indexof_setting(setting)
        subset_cf = CounterfactualExampleBySubset(self.dataset, setting['cf_num'])
        subset_cf.from_csv('{}'.format(index), self.dir)
        return subset_cf

    def indexof_setting(self, setting):
        index = -1
        for i, s in enumerate(self.cf_setting):
            if self.equal_setting(s, setting):
                index = i
                break
        return index

    def init_dir(self):
        if os.path.exists(self.dir):
            shutil.rmtree(self.dir)
        os.makedirs(self.dir)
        if self.auto_save:
            self.save_meta()

    def ensure_dir(self):
        if not os.path.exists(self.dir):
            os.makedirs(self.dir)

    def alterifexist(self, path):
        pass

    def createifnotexist(self, dirpath):
        if not os.path.exists(dirpath):
            os.mkdir(dirpath)

    def get_dataset_meta(self):
        return self.data_meta

    def get_model_meta(self):
        return self.model_meta
