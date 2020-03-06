import os
from abc import ABC, abstractmethod
import numpy as np
import pandas as pd 

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader, TensorDataset
import torch.optim as optim

from utils.dir_manager import DirectoryManager

OUTPUT_ROOT = os.path.join(os.path.dirname(__file__), 'output')

class ModelManager(ABC):

    @abstractmethod
    def load_model(self):
        return

    @abstractmethod
    def forward(self):
        return

    @abstractmethod
    def train(self):
        return

    @abstractmethod
    def evaluate(self):
        return

    @abstractmethod
    def save_model(self):
        return

class PytorchModel(nn.Module):

    def __init__(self, feature_num, class_num, dropout=0.5):
        super(PytorchModel, self).__init__()

        self.fc1 = nn.Linear(feature_num, 60)
        self.fc2 = nn.Linear(60, 30)
        self.fc3 = nn.Linear(30, class_num)

        self.dropout_layer = nn.Dropout(dropout)

    def forward(self, x):
        x = F.relu(self.fc1(x))
        x = self.dropout_layer(x)
        x = F.relu(self.fc2(x))
        x = self.dropout_layer(x)
        x = F.sigmoid(self.fc3(x))
        return x

class PytorchLinearModel(nn.Module):

    def __init__(self, feature_num, class_num):
        super(PytorchLinearModel, self).__init__()

        self.fc = nn.Linear(feature_num, class_num)

    def forward(self, x):
        return F.sigmoid(self.fc(x))


class PytorchModelManager(ModelManager):
    """Model manager of a pytorch model"""
    def __init__(self, dataset, model_name='MLP', root_dir=OUTPUT_ROOT, model_type="3fc", model=None):
        ModelManager.__init__(self)
        self.dataset = dataset
        self.model_name = model_name
        self.dir_manager = DirectoryManager(self.dataset, self, root=root_dir)

        self.feature_names = self.dataset.get_feature_names()
        self.target_names = self.dataset.get_target_names()

        if model is None:
            if model_type == "3fc":
                self.model = PytorchModel(feature_num=len(self.feature_names), class_num=len(self.target_names))
            elif model_type == "3fc_dropout0":
                self.model = PytorchModel(feature_num=len(self.feature_names), class_num=len(self.target_names), dropout=0)
            elif  model_type == "linear":
                self.model = PytorchLinearModel(feature_num=len(self.feature_names), class_num=len(self.target_names))
            else:
                raise ValueError("Model type should be in [\"3fc\", \"3fc_dropout0\", \"linear\"]")
        else:
            self.model = model

        train_dataset = self.dataset.get_train_dataset()
        test_dataset = self.dataset.get_test_dataset()
        train_x = torch.from_numpy(train_dataset[self.feature_names].values).float()
        train_y = torch.from_numpy(train_dataset[self.target_names].values).float()
        test_x = torch.from_numpy(test_dataset[self.feature_names].values).float()
        test_y = torch.from_numpy(test_dataset[self.target_names].values).float()
        self.train_dataset = TensorDataset(train_x, train_y)
        self.test_dataset = TensorDataset(test_x, test_y)

        self.train_accuracy = None
        self.test_accuracy = None

        self.dir_manager.init()

    def load_model(self):
        # self.model.load_state_dict(torch.load(path))
        self.dir_manager.load_meta()
        self.model.load_state_dict(self.dir_manager.load_pytorch_model_state())

    def forward(self, x):
        self.model.eval()
        return self.model(x)

    def predict(self, x):
        self.model.eval()
        if type(x) is type(pd.DataFrame()):
            if len(x.columns) == len(self.dataset.get_columns(preprocess=False)):
                x = self.dataset.preprocess(x)
            x = torch.from_numpy(x[self.feature_names].values).float()
        pred = self.model(x).detach().numpy()
        output_df = pd.DataFrame(np.concatenate((x, pred), axis=1), \
            columns=self.feature_names+self.target_names)
        output_df = self.dataset.depreprocess(output_df)
        origin_target_name = self.dataset.get_target_names(preprocess=False)
        origin_columns = self.dataset.get_columns(preprocess=False)
        output_df['{}_pred'.format(origin_target_name)] = output_df[origin_target_name]
        output_df['Score'] = pred[:, 1]
        return output_df[origin_columns+['{}_pred'.format(origin_target_name), 'Score']]

    def predict_instance(self, index):
        instances = self.dataset.get_sample(index=index)
        x = instances[self.feature_names].values
        x = torch.from_numpy(x).float()
        origin_target_name = self.dataset.get_target_names(preprocess=False)
        target = self.dataset.get_sample(index, preprocess=False)[origin_target_name]
        output_df = self.predict(x)
        output_df[origin_target_name] = target
        return output_df.set_index(instances.index)

    def fix_model(self):
        for param in self.model.parameters():
            param.requires_grad = False
        self.model.eval()
        
    def release_model(self):
        for param in self.model.parameters():
            param.requires_grad = True

    def train(self, batch_size=32, epoch=40, lr=0.002, verbose=True):
        data_loader = DataLoader(dataset=self.train_dataset, batch_size=batch_size, shuffle=True)
        criterion = nn.BCELoss()
        self.release_model()
        # optimizer = optim.SGD(self.model.parameters(), lr=lr)
        optimizer = optim.RMSprop(self.model.parameters(), lr=lr)
        for e in range(epoch):
            self.model.train()

            for x, target in data_loader:
                optimizer.zero_grad()

                pred = self.model(x)
                loss = criterion(pred, target)
                loss.backward()
                optimizer.step()
            if verbose:
                print("Epoch: {}, loss={:.3f}, train_accuracy={:.3f}, test_accuracy={:.3f}".format(e, loss, self.evaluate('train'), self.evaluate('test')))
        self.train_accuracy = float(self.evaluate('train'))
        self.test_accuracy = float(self.evaluate('test'))

        self.dir_manager.update_model_meta()
        self.dir_manager.init_dir()

    def evaluate(self, dataset='test', batch_size=128):
        if dataset == 'test':
            data_loader = DataLoader(dataset=self.test_dataset, batch_size=batch_size, shuffle=True)
        else:
            data_loader = DataLoader(dataset=self.train_dataset, batch_size=batch_size, shuffle=True)

        target_class = np.array([])
        pred_class = np.array([])

        self.model.eval()

        for x, target in data_loader:
            pred = self.model(x)
            pred = pred.argmax(axis=1).numpy()
            target = target.argmax(axis=1).numpy()
            target_class = np.concatenate((target_class, target))
            pred_class = np.concatenate((pred_class, pred))
        return (target_class == pred_class).mean()

    def save_model(self):
        self.dir_manager.save_pytorch_model_state(self.model.state_dict())

    def save_prediction(self):
        """a tmp implemetation"""
        self.dir_manager.save_prediction(self.predict_instance('all'), 'dataset')
        self.dir_manager.save_prediction(self.predict_instance('train'), 'train_dataset')
        self.dir_manager.save_prediction(self.predict_instance('test'), 'test_dataset')

    def get_name(self):
        return self.model_name

    def get_train_accuracy(self):
        return self.train_accuracy

    def get_test_accuracy(self):
        return self.test_accuracy

    def get_dir_manager(self):
        return self.dir_manager

if __name__ == '__main__':
    from load_dataset import load_HELOC_dataset
    dataset = load_HELOC_dataset()
    mm = PytorchModelManager(dataset)
    try:
        mm.load_model()
    except FileNotFoundError:
        mm.train()
        mm.save_model()
    mm.save_prediction()
