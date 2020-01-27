import numpy as np 
from sklearn.model_selection import train_test_split

from utils.preprocessing import Normalizer2d, cat2num


class Dataset:
    """
    """
    def __init__(self, attr_disc, name="dataset", normalizer=None, x=np.array([[]]), y=np.array([])):
        """
        param attr_disc: [{'name': str, 'type': str, 'description': str}]
        """
        self._name = name
        self._attr_disc = attr_disc
        if type(normalizer) == type(None):
            self._normalizer = Normalizer2d()
        else:
            self._normalizer = normalizer
        self.load_data(x, y)

    def load_data(self, x, y):
        self._x = np.array(x)
        self._y = np.array(y)
        if len(self._y) > 0:
            mask = np.array([attr['type'] == 'numerical' for attr in self._attr_disc])
            numbered_data, self._symbol_dict = cat2num(np.concatenate((self._x, np.expand_dims(self._y, axis=0).T), axis=1), ~mask)
            self._x = numbered_data[:, :-1]
            self._y = numbered_data[:, -1]
            self._normalizer.fit(self._x, mask[:-1])
        # init the train dataset and testdataset
        # self._x_train = np.array([[]])
        # self._y_train = np.array([])
        # self._x_train = np.array([[]])
        # self._y_train = np.array([])
        self.split_data()

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

    def get_x(self, normalize=True):
        if normalize:
            return self._normalizer.transform(self._x)
        else:
            return self._x

    def get_y(self):
        return self._y
    
    def get_x_train(self, normalize=True):
        if normalize:
            return self._normalizer.transform(self._x_train)
        else:
            return self._x_train

    def get_x_test(self, normalize=True):
        if normalize:
            return self._normalizer.transform(self._x_test)
        else:
            return self._x_test

    def get_y_train(self):
        return self._y_train

    def get_y_test(self):
        return self._y_test

    # def normalize(self):

if __name__ == '__main__':
    dataset = Dataset(attr_disc=[])