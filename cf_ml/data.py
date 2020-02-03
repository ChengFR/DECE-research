import numpy as np 
from sklearn.model_selection import train_test_split
from collections import OrderedDict

from utils.preprocessing import Normalizer, OneHotEncodder


class Dataset:
    """A class for tabular dataset."""

    def __init__(self, attr_disc, name="dataset", normalizer=None, one_hot_encoder=None, x=np.array([[]]), y=np.array([])):
        """
        param attr_disc: [{'name': str, 'type': str, 'description': str}], 
              /type in ['continued', 'discrete', 'categorical', 'mixed', 'dummy']
        """
        self._name = name

        # initialize attribute and target discription
        self._attr_disc = OrderedDict()
        for attr in attr_disc[:-1]:
            self._attr_disc[attr['name']] == attr
        self._target_disc = OrderedDict() # reserverd for dummy columns
        self._target_disc[attr_disc[-1]['name']] == attr_disc[-1]

        # initialize normalizer
        if normalizer is None:
            self._normalizer = Normalizer()
        else:
            self._normalizer = normalizer

        # initialize one_hot_encoder
        if one_hot_encoder is None:
            self._one_hot_encoder = OneHotEncodder()
        else:
            self._one_hot_encoder = one_hot_encoder
        
        self.dummy_attr = []
        
        # load data
        if y.shape[0] > 0:
            self.load_data(x, y)

    def load_data(self, x, y, train_size=0.8, random_state=0):
        self._x = np.array(x)
        self._y = np.array(y)
        if len(self._y) > 0:
            # fit one_hot_encoder with x
            self.dummy_attr = self._one_hot_encoder.fit(self._x, [attr['type'] in ['categorical'] for attr in self._attr_disc])
            # fit normalizer with x
            self._normalizer.fit(self._x)
        self.split_data(train_size, random_state)

    def one_hot_encode_data(self):
        pass

    def split_data(self, train_size=0.8, random_state=0):
        self._x_train, self._x_test, self._y_train, self._y_test = \
            train_test_split(self._x, self._y, train_size=train_size, random_state=random_state)

    @property
    def name(self):
        return self._name
    
    @name.setter
    def name(self, new_name):
        self._name = new_name

    @property
    def normalizer(self):
        return self._normalizer

    def get_x(self, normalize=True, one_hot=True):
        if normalize:
            _x = self._normalizer.transform(self._x)
        else:
            _x = self._x
        if one_hot:
            _x = self._one_hot_encoder.transform(_x)
        else:
            _x = _x
        return _x

    def get_y(self):
        return self._y
    
    def get_x_train(self, normalize=True, one_hot=True):
        if normalize:
            _x_train = self._normalizer.transform(self._x_train)
        else:
            _x_train = self._x_train
        if one_hot:
            _x_train = self._one_hot_encoder.transform(_x_train)
        else:
            _x_train = _x_train
        return _x_train

    def get_x_test(self, normalize=True, one_hot=True):
        if normalize:
            _x_test = self._normalizer.transform(self._x_test)
        else:
            _x_test = self._x_test
        if one_hot:
            _x_test = self._one_hot_encoder.transform(_x_test)
        else:
            _x_test = _x_test
        return _x_test

    def get_y_train(self):
        return self._y_train

    def get_y_test(self):
        return self._y_test

    # def normalize(self):

if __name__ == '__main__':
    dataset = Dataset(attr_disc=[])