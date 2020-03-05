import os
import io
import json
import shutil
import collections
import torch
import pandas as pd

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
        self.data_meta = {}
        self.model_meta = {}
        self.cf_setting = []
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
        self.load_meta_from_path(os.path.join(self.root, dataset_name, model_name))

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
        self.data_meta = {'name': self.dataset.get_name(), \
            'description': self.dataset.get_description(), \
            'target_name': self.dataset.get_target_names(preprocess=False)}

    def update_model_meta(self):
        self.model_meta = {'name': self.model_manager.get_name(), \
            'train_accuracy': self.model_manager.get_train_accuracy(), \
            'test_accuracy': self.model_manager.get_test_accuracy()}

    def save_meta(self):
        if self._init is False:
            raise ValueError('DirectoryManager save before init.')
        with open(os.path.join(self.dir, 'meta.json'), 'w') as f:
            f.write(json.dumps({'data_meta': self.data_meta, 'model_meta': self.model_meta, 'cf_setting': self.cf_setting}))

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
        des = self.dataset.get_description()
        if only_valid:
            for col in self.dataset.get_feature_names(preprocess=False):
                if des[col]['type'] == 'numerical':
                    data_df = data_df[data_df[col] >= des[col]['min']]
                    data_df = data_df[data_df[col] <= des[col]['max']]
                else:
                    data_df = data_df[data_df[col].isin(des[col]['category'])]
        return data_df

    def indexof_setting(self, setting):
        index = -1
        for i, s in enumerate(self.cf_setting):
            if self._setting2str(s) == self._setting2str(setting):
                index = i
        return index

    def save_cf_with_setting(self, subset_cf, setting):
        """
        """
        if self.indexof_setting(setting) >= 0:
            self.cf_setting[self.indexof_setting(setting)] = setting
        else:
            self.cf_setting.append(setting)

        file_header = self._setting2str(setting)

        subset_cf.to_csv(file_header, self.dir)

        if self.auto_save:
            self.save_meta()
        
    def load_cf_with_setting(self, setting):
        """
        """
        file_header = self._setting2str(setting)
        subset_cf = CounterfactualExampleBySubset(self.dataset, setting['cf_num'])
        subset_cf.from_csv(file_header, self.dir)
        return subset_cf

    def rm_cf_with_setting(self, setting):
        """tmp"""
        file_header = self._setting2str(setting)
        cf_file_path = os.path.join(self.dir, '{}_cf.csv'.format(file_header))
        instance_file_path = os.path.join(self.dir, '{}_data.csv'.format(file_header))
        if os.path.exists(cf_file_path):
            os.remove(cf_file_path)
        if os.path.exists(instance_file_path):
            os.remove(instance_file_path)
        if self.indexof_setting(setting) >= 0:
            del self.cf_setting[self.indexof_setting(setting)]


    def _equal_setting(self, s1, s2):
        pass
    
    def _setting2str(self, setting):
        if type(setting) is str:
            return setting
        c_att = setting['changeable_attribute']
        filters = setting['filters']
        cf_num = setting['cf_num']
        desired_class = setting['desired_class']

        c_att_str = c_att if type(c_att) == str else '-'.join(sorted(c_att))
        filters_str = '&'.join([self._filter2str(f) for f in sorted(filters)])
        cf_num_str = str(cf_num)
        desired_class_str = desired_class if type(desired_class) == str else '-'.join(sorted(desired_class))

        return '_'.join([c_att_str, filters_str, cf_num_str, desired_class_str])

    def _filter2str(self, f):
        col = f[0]
        col_description = self.dataset.get_description()
        if col_description[col]['type'] == 'categorical':
            # filter_str = col + '-' + '^'.join(sorted(f[1])) + '-' + str(f[2])
            filter_str = "{}-{}-{}".format(col, '^'.join(sorted(f[1])), f[2])
        elif col_description[col]['type'] == 'numerical':
            # filter_str = col + '-' + round(f[1], col_description[col]['decile']) + '-' + \
            #     round(f[2], col_description[col]['decile']) + '-' + str(f[3])
            filter_str = "{}-{}-{}-{}".format(col, round(f[1], col_description[col]['decile']), \
                round(f[2], col_description[col]['decile']), f[3])
        else:
            raise ValueError('{}: illegal filter.'.format(col))
        return filter_str

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
