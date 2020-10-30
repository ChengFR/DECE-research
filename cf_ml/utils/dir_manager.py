import os
import io
import json
import shutil
import collections
import torch
import pandas as pd
import numpy as np

from cf_ml.utils.feature_range import tokenize

OUTPUT_ROOT = os.path.join('../../', os.path.dirname(__file__), 'output')

class DirectoryManager:
    """A class to save and load output files."""

    def __init__(self, dataset, model_name, root=OUTPUT_ROOT):
        self._root = root
        self.ensure_dir(self._root)

        self._dataset = dataset
        self._model_name = model_name

        self._dir = os.path.join(self._root, self.dataset_name, self.model_name)
        self.ensure_dir(self._dir)

        self._data_meta = {'name': self.dataset_name,
                          'description': self._dataset.description,
                          'features': self._dataset.features,
                          'target': self._dataset.target,
                          'prediction': self._dataset.prediction}
        self._model_meta = {'name': self._model_name,
                           'train_accuracy': None,
                           'test_accuracy': None}
        self._universal_range = self._dataset.get_universal_range()
        self._cf_setting = []
    
    @property
    def model_name(self):
        return self._model_name
    
    @property
    def dataset_name(self):
        return self._dataset.name

    def load_meta(self):
        meta_path = os.path.join(self._dir, 'meta.json')
        with open(meta_path) as f:
            meta_info = json.load(f)
        self._data_meta = meta_info['data_meta']
        self._model_meta = meta_info['model_meta']
        self._cf_setting = meta_info['cf_setting']

    def update_model_meta(self, **kwargs):
        self._model_meta = {'name': self._model_name, **kwargs}

    def save_meta(self):
        with open(os.path.join(self._dir, 'meta.json'), 'w') as f:
            f.write(json.dumps({'data_meta': self._data_meta,
                                'model_meta': self._model_meta, 'cf_setting': self._cf_setting}))

    def _get_model_path(self):
        return os.path.join(self._dir, '{}'.format(self._model_meta['name']))

    def save_pytorch_model_state(self, model_state):
        if self._model_meta['test_accuracy'] is not None:
            old_model_path = self._get_model_path()
            if os.path.exists(old_model_path):
                os.remove(old_model_path)

        new_path = self._get_model_path()
        torch.save(model_state, new_path)

        self.save_meta()

    def load_pytorch_model_state(self):
        model_path = self._get_model_path()
        return torch.load(model_path)

    def save_prediction(self, data_df, dataset_name='dataset'):
        """ a tmp implementation
        :param dataset_name: str, in ['dataset', 'train_dataset', 'test_dataset']
        """
        data_df.to_csv(os.path.join(self._dir, dataset_name+'.csv'))

    def load_prediction(self, dataset_name='dataset'):
        """ a tmp implementation
        :param dataset_name: str, in ['dataset', 'train_dataset', 'test_dataset']
        """
        data_df = pd.read_csv(os.path.join(self._dir, dataset_name+'.csv'), index_col=0)
        return data_df

    def include_setting(self, data_range, feature_range):
        return self.find_setting(data_range, feature_range) > -1
    
    def find_setting(self, data_range, feature_range):
        index = -1
        for i, (d, f) in enumerate(self._cf_setting):
            if tokenize(d, f, self._universal_range) == \
                    tokenize(data_range, feature_range, self._universal_range):
                index = i
        return index

    def load_subset_cf(self, data_range, feature_range):
        index = self.find_setting(data_range, feature_range)
        if index == -1:
            raise KeyError("Subset does not exist.")
        cf_path = os.path.join(self._dir, "subset_{}.csv".format(index))
        return pd.read_csv(cf_path)

    def save_subset_cf(self, data_range, feature_range, subset_report):
        index = self.find_setting(data_range, feature_range)
        if index == -1:
            index = len(self._cf_setting)
            self._cf_setting.append((data_range, feature_range))
        else:
            print("Overwrite")
        cf_path = os.path.join(self._dir, "subset_{}.csv".format(index))
        subset_report.to_csv(cf_path)
        self.save_meta()

    def clean_subset_cache(self):
        for index in range(len(self._cf_setting)):
            cf_path = os.path.join(self._dir, "subset_{}.csv".format(index))
            os.remove(cf_path)
        self._cf_setting = []
        self.save_meta()

    def ensure_dir(self, dir_path=None):
        if dir_path is None:
            dir_path = self._dir
        if not os.path.exists(dir_path):
            os.makedirs(dir_path)

    def init_dir(self, dir_path=None):
        if dir_path is None:
            dir_path = self._dir
        if os.path.exists(dir_path):
            shutil.rmtree(dir_path)
        self.ensure_dir(dir_path)

    @property
    def dataset_meta(self):
        return self._data_meta

    @property
    def model_meta(self):
        return self._model_meta
