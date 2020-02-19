import os
from abc import ABC, abstractmethod
import numpy as np
import pandas as pd 

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader, TensorDataset
import torch.optim as optim

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

    def __init__(self, feature_num, class_num):
        super(PytorchModel, self).__init__()

        self.fc1 = nn.Linear(feature_num, 60)
        self.fc2 = nn.Linear(60, 30)
        self.fc3 = nn.Linear(30, class_num)

    def forward(self, x):
        x = F.relu(self.fc1(x))
        x = F.dropout(x)
        x = F.relu(self.fc2(x))
        x = F.dropout(x)
        x = F.sigmoid(self.fc3(x))
        return x

class PytorchModelManager(ModelManager):
    """Model manager of a pytorch model"""
    def __init__(self, dataset, model=None):
        ModelManager.__init__(self)
        self.dataset = dataset
        feature_names = self.dataset.get_feature_names()
        class_names = self.dataset.get_target_names()
        if model is None:
            self.model = PytorchModel(feature_num=len(feature_names), class_num=len(class_names))
        else:
            self.model = model

        train_dataset = self.dataset.get_train_dataset()
        test_dataset = self.dataset.get_test_dataset()
        train_x = torch.from_numpy(train_dataset[feature_names].values).float()
        train_y = torch.from_numpy(train_dataset[class_names].values).float()
        test_x = torch.from_numpy(test_dataset[feature_names].values).float()
        test_y = torch.from_numpy(test_dataset[class_names].values).float()
        self.train_dataset = TensorDataset(train_x, train_y)
        self.test_dataset = TensorDataset(test_x, test_y)

    def load_model(self):
        return

    def forward(self):
        self.model.eval()
        return

    def train(self, batch_size=32, epoch=40, lr=0.002, verbose=True):
        data_loader = DataLoader(dataset=self.train_dataset, batch_size=batch_size, shuffle=True)
        criterion = nn.BCELoss()
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
        return


if __name__ == '__main__':
    from load_dataset import load_HELOC_dataset
    dataset = load_HELOC_dataset()
    mm = PytorchModelManager(dataset)
    mm.train()
