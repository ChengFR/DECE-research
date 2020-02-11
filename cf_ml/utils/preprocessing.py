from abc import ABC, abstractmethod
import numpy as np 


class Normalizer():
    """A class for normalizing continuous feature value."""
    
    def __init__(self, mode='minmax'):
        self._mode = mode
        self._fitted = False
        self._data_min = None
        self._data_max = None
        self._scale = None # for L1/L2 norm

    def fit(self, data):
        raw_data = np.array(data, dtype=np.float)
        if self._mode == 'minmax':
            self._data_min = raw_data.min(axis=0)
            self._data_max = raw_data.max(axis=0)
            self._fitted = True
        elif self._mode == 'L2':
            # self._scale = np.sqrt(np.sum(axis=0, raw_data.square()))
            raise NotImplementedError

    def transform(self, data):
        if not self._fitted:
            raise ValueError("Normalizer should fit to dataset first before being applied.")
        raw_data = np.array(data, dtype=np.float)
        if self._mode == 'minmax':
            data_range = self._data_max - self._data_min
            normed_data = np.divide(raw_data - self._data_min, 
                data_range, where=data_range > 0)
            normed_data[:, data_range == 0] = 1
        return normed_data

    def fit_transform(self, data):
        self.fit(data)
        return self.transform(data)


class OneHotEncodder:
    """A class for transforming categorical feature value to one-bot encodding value."""

    def __init__(self):
        self._categories = []
        self._mask = None

    def fit(self, data, mask=None, category_dict={}):
        """
        :param category_dict: {`feature index`: [feature categories]}
        """
        if mask is None:
            self._mask = np.ones(data.shape[1])
        else:
            self._mask = np.array(mask)

        raw_data = np.array(data)
        
        if self._mask.shape[0] != raw_data.shape[1]:
            raise ValueError('Attribute mask.shape({},) is inconsistent with data.shape(,{}).'.format(self._mask.shape[0], data.shape[1]))
        
        for index in range(raw_data.shape[1]):
            if not mask[index]:
                self._categories.append([])
            elif index in category_dict.keys():
                self._categories.append(np.array(category_dict[index]))
            else:
                self._categories.append(np.unique(raw_data[:,index]))

        return self._categories

    def transform(self, data):
        if self._mask is None:
            raise ValueError("OneHotEncodder should fit to dataset first before being applied.")

        raw_data = np.array(data)
        if self._mask.shape[0] != raw_data.shape[1]:
            raise ValueError('Attribute mask.shape({},) is inconsistent with data.shape(,{}).'.format(self._mask.shape[0], data.shape[1]))
        
        for i in range(raw_data.shape[1]):
            if self._mask[i]:
                # dummy_columns = np.zeros([data.shape[0], self._categories[i].shape[0]])
                for category in self._categories[i]:
                    raw_data = np.concatenate([raw_data, np.expand_dims(raw_data[:,i]==category, axis=1)], axis=1)
        
        return np.delete(raw_data, np.argwhere(self._mask), axis=1)
        

    def fit_transform(self, data, mask=None, category_dict={}):
        self.fit(data, mask, category_dict)
        return self.transform(data)

    def get_categories(self):
        return self._categories

if __name__ == '__main__':
    one_hot = OneHotEncodder()
    print(one_hot.fit_transform([['abc', 1], ['d', 3]], [True, False]))