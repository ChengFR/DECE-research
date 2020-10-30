import os
from abc import ABC, abstractmethod
import numpy as np
import pandas as pd

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader, TensorDataset
import torch.optim as optim

from cf_ml.utils import DirectoryManager

OUTPUT_ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'output')


class ModelManager(ABC):

    @abstractmethod
    def load_model(self):
        return

    @abstractmethod
    def forward(self, x):
        return

    @abstractmethod
    def evaluate(self):
        return

    @abstractmethod
    def save_model(self):
        return


class MLP(nn.Module):

    def __init__(self, feature_num, class_num, dropout=0.5):
        super(MLP, self).__init__()

        self.fc1 = nn.Linear(feature_num, 60)
        self.fc2 = nn.Linear(60, 30)
        self.fc3 = nn.Linear(30, class_num)

        self.dropout_layer = nn.Dropout(dropout)

    def forward(self, x):
        x = F.relu(self.fc1(x))
        x = self.dropout_layer(x)
        x = F.relu(self.fc2(x))
        x = self.dropout_layer(x)
        x = torch.sigmoid(self.fc3(x))
        return x


class LR(nn.Module):

    def __init__(self, feature_num, class_num):
        super(LR, self).__init__()

        self.fc = nn.Linear(feature_num, class_num)

    def forward(self, x):
        return F.sigmoid(self.fc(x))


class PytorchModelManager(ModelManager):
    """A class to store, train, evaluate, and apply a pytorch model.

    Args:
        dataset: dataset.Dataset, the target dataset.
        model_name: str, name of the model.
        root_dir: str, the path of the directory to store the model and relative information.
        model: a torch model or None, if model is none, a new MLP (#f, 60, 30, #c) will be created.
    """

    def __init__(self, dataset, model_name='MLP', root_dir=OUTPUT_ROOT, model=None):
        self._dataset = dataset
        self._name = model_name
        self._dir_manager = DirectoryManager(self._dataset, model_name, root=root_dir)

        self._features = self._dataset.dummy_features
        self._target = self._dataset.dummy_target
        self._prediction = "{}_pred".format(self._dataset.target)

        if model is None:
            self._model = MLP(feature_num=len(self._features),
                              class_num=len(self._target))
        else:
            self._model = model

        train_X = torch.from_numpy(
            self.dataset.get_train_X().values).float()
        train_y = torch.from_numpy(
            self.dataset.get_train_y().values).float()
        test_X = torch.from_numpy(
            self.dataset.get_test_X().values).float()
        test_y = torch.from_numpy(
            self.dataset.get_test_y().values).float()

        self.train_dataset = TensorDataset(train_X, train_y)
        self.test_dataset = TensorDataset(test_X, test_y)

        self._train_accuracy = None
        self._test_accuracy = None

    def load_model(self):
        """Load model states."""
        self._dir_manager.load_meta()
        self._model.load_state_dict(self._dir_manager.load_pytorch_model_state())

    def forward(self, x):
        """Get the forward results to the given data."""
        self._model.eval()
        return self._model(x)

    def report(self, x, y=None, preprocess=True):
        """Generate the report from the feature values and target values (optional). 
        The report includes (features, target, prediction)."""
        if preprocess:
            x = self._dataset.preprocess_X(x)
            if y is not None:
                y = self._dataset.preprocess_y(y)

        if isinstance(x, pd.DataFrame):
            x = x[self._features].values
        if isinstance(x, np.ndarray):
            x = torch.from_numpy(x).float()

        pred = self.forward(x).detach().numpy()
        if y is None:
            y = np.zeros(pred.shape)

        report_df = self._dataset.inverse_preprocess(np.concatenate((x, y), axis=1))
        report_df[self._prediction] = self._dataset.inverse_preprocess_y(pred)

        return report_df

    def report_on_instance(self, index):
        """Generate the report to an instance in the dataset. 
        The report includes (features, target, prediction)."""
        instances = self._dataset.get_subset(index=index, preprocess=False)
        report_df = self.report(instances[self._dataset.features], instances[self._dataset.target])
        report_df[self._dataset.features] = instances[self._dataset.features]
        report_df[self._dataset.target] = instances[self._dataset.target]
        return report_df.set_index(instances.index)

    # TODO: remove this function in the later version.
    def train(self, batch_size=32, epoch=40, lr=0.002, verbose=True, save_result=True):
        """Train the model with an RMS optimizer."""
        dataset = self.train_dataset
        data_loader = DataLoader(
            dataset=dataset, batch_size=batch_size, shuffle=True)

        criterion = nn.BCELoss()
        optimizer = optim.RMSprop(self._model.parameters(), lr=lr)
        for e in range(epoch):
            self._model.train()

            for x, target in data_loader:
                optimizer.zero_grad()

                pred = self._model(x)
                loss = criterion(pred, target)
                loss.backward()
                optimizer.step()

            if verbose:
                print("Epoch: {}, loss={:.3f}, train_accuracy={:.3f}, test_accuracy={:.3f}".format(
                    e, loss, self.evaluate('train'), self.evaluate('test')))

        if save_result:
            self._train_accuracy = float(self.evaluate('train'))
            self._test_accuracy = float(self.evaluate('test'))
            self._dir_manager.update_model_meta(train_accuracy=self._train_accuracy,
                                                test_accuracy=self._test_accuracy)

    def evaluate(self, dataset='test', metric='accuracy', batch_size=128):
        """Evaluate the model from either the training dataset or testing dataset 
        with the given metrics."""
        if dataset == 'test':
            data_loader = DataLoader(
                dataset=self.test_dataset, batch_size=batch_size, shuffle=True)
        elif dataset == 'train':
            data_loader = DataLoader(
                dataset=self.train_dataset, batch_size=batch_size, shuffle=True)
        else:
            raise ValueError("{} should be either 'train' or 'test'".format(dataset))

        target_class = np.array([])
        pred_class = np.array([])

        self._model.eval()

        for x, target in data_loader:
            pred = self._model(x)
            pred = pred.argmax(axis=1).numpy()
            target = target.argmax(axis=1).numpy()
            target_class = np.concatenate((target_class, target))
            pred_class = np.concatenate((pred_class, pred))

        if metric == 'accuracy':
            return (target_class == pred_class).mean()
        else:
            raise NotImplementedError

    def save_model(self):
        """Save the model states."""
        self._dir_manager.init_dir()
        self._dir_manager.save_pytorch_model_state(self._model.state_dict())

    def save_reports(self):
        """a tmp implemetation"""
        self.dir_manager.save_prediction(
            self.report_on_instance('all'), 'dataset')
        self.dir_manager.save_prediction(
            self.report_on_instance('train'), 'train_dataset')
        self.dir_manager.save_prediction(
            self.report_on_instance('test'), 'test_dataset')

    @property
    def name(self):
        return self._name

    @property
    def dataset(self):
        return self._dataset

    @property
    def train_accuracy(self):
        return self._train_accuracy

    @property
    def test_accuracy(self):
        return self._test_accuracy

    @property
    def dir_manager(self):
        return self._dir_manager
