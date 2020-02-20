import os
import io
import json
import shutil

output_root = './output/'

class DirectoryManager:
    """A class to manage the path of the model files and output files"""
    
    def __init__(self, root=output_root, auto_save=True):
        self.root = root
        self.createifnotexist(self.root)
        self.dir = None
        self._init = False
        self.data_meta = {}
        self.model_meta = {}
        self.cf_setting = []
        self.auto_save = auto_save

    def load_meta_from_path(self, dirpath):
        if not os.path.isdir(dirpath):
            raise ValueError('{} is not directory.'.format(dirpath))
        meta_path = os.path.join(dirpath, 'meta.json')
        with open(meta_path) as f:
            meta_info = json.load(f)
        self.data_meta = meta_info['data_meta']
        self.model_meta = meta_info['model_meta']
        self.cf_setting = meta_info['cf_setting']
        self.dir = dirpath
        self._init = True

    def load_meta(self, dataset, model_manager):
        dataset_name = dataset.get_name()
        model_name = model_manager.get_name()
        self.load_meta_from_path(os.path.join(self.root, dataset_name, model_name))

    def init(self, dataset, model_manager):
        dataset_name = dataset.get_name()
        model_name = model_manager.get_name()
        # self.createifnotexist(os.path.join(self.root, dataset_name))
        self.dir = os.path.join(self.root, dataset_name, model_name)
        self.ensure_dir()

        self.update_dataset_meta(dataset)
        self.update_model_meta(model_manager)

        self._init = True

    def update_dataset_meta(self, dataset):
        self.data_meta = {'name': dataset.get_name(), \
            'description': dataset.get_description()}

    def update_model_meta(self, model_manager):
        self.model_meta = {'name': model_manager.get_name(), \
            'train_accuracy': model_manager.get_train_accuracy(), \
            'test_accuracy': model_manager.get_test_accuracy()}

    def save_meta(self):
        if self._init is False:
            raise ValueError('DirectoryManager save before init.')
        with open(os.path.join(self.dir, 'meta.json'), 'w') as f:
            f.write(json.dumps({'data_meta': self.data_meta, 'model_meta': self.model_meta, 'cf_setting': self.cf_setting}))

    def get_model_path(self):
        return os.path.join(self.dir, '{}_test_accuracy_{:.3f}'.format(self.model_meta['name'], self.model_meta['test_accuracy']))

    def renew_model_path(self, model_manager):
        if self.model_meta['test_accuracy'] is not None:
            old_model_path = self.get_model_path()
            if os.path.exists(old_model_path):
                os.remove(old_model_path)

        self.update_model_meta(model_manager)

        return self.get_model_path()

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


