import numpy as np 

class Normalizer2d():
    """
    """
    def __init__(self, mode='minmax'):
        self._mode = mode
        self._data_min = None
        self._data_range = None
        self._scale = None # for L1/L2 norm
        self._where = None

    def fit(self, data, where):
        """
        param where: array_like of bool, ture indicates that the corresponding attribute needs to be noramlized
        """
        raw_data = np.array(data, dtype=np.float)
        self._where = np.array(where)
        if self._mode == 'minmax':
            self._data_min = raw_data.min(axis=0)
            self._data_range = raw_data.max(axis=0) - self._data_min
        elif self._mode == 'L2':
            # self._scale = np.sqrt(np.sum(axis=0, raw_data.square()))
            raise NotImplementedError

    def transform(self, data):
        if type(self._where) == type(None):
            raise SyntaxError("The Normalizer should fit to a dataset before applying the transformation.")
        raw_data = np.array(data, dtype=np.float)
        if self._mode == 'minmax':
            normed_data = np.divide(np.subtract(raw_data, self._data_min), 
                self._data_range, where=self._data_range > 0)
            normed_data[:, self._data_range == 0] = 1
            normed_data[:, ~self._where] = raw_data[:, ~self._where]
        return normed_data

    def fit_transform(self, data, where):
        self.fit(data, where)
        return self.transform(data)


def cat2num(data, where=True):
    """
    param where: bool or array_like of bool, ture indicates that the corresponding attribute needs to be transformed to numerical data
    """
    raw_data = np.array(data)
    where = np.array(where)
    if raw_data.ndim == 1:
        new_col, symbol_dict = _cat2num(raw_data)
        # if type(data) == list:
        #     new_col = new_col.tolist()
        return new_col, symbol_dict
    elif raw_data.ndim == 2:
        assert(raw_data.shape[1] == where.shape[0])
        symbol_dict_list = []
        for col_index in range(raw_data.shape[1]):
            if where[col_index] == False:
                symbol_dict_list.append({})
            else:
                new_col, symbol_dict = _cat2num(raw_data[:, col_index])
                raw_data[:, col_index] = new_col
                symbol_dict_list.append(symbol_dict)
        # if type(data) == list:
        #     raw_data = raw_data.tolist()
        return raw_data, symbol_dict_list
        
def _cat2num(column):
    raw_column = np.array(column)
    symbols = np.unique(raw_column)
    symbol_dict = {}
    reverse_dict = {}
    for i, s in enumerate(symbols):
        symbol_dict[i] = s
        reverse_dict[s] = i
    return np.array([reverse_dict[s] for s in raw_column]), symbol_dict
    

if __name__ == '__main__':
    # print(normalize(np.array([[3, 2, 5], [3, 2, -1]]), where=[True, False, True]))
    # print(cat2num(np.array([[3, 2, 5], [3, 2, -1]]), where=[True, True, False]))
    normalizer = Normalizer2d('minmax')
    print(normalizer.fit_transform(np.array([[3, 2, 5], [3, 2, -1]]), where=[True, False, True]))