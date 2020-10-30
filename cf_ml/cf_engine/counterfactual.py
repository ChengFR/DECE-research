import pandas as pd


class CounterfactualExample:
    """A class to store counterfactual examples"""

    def __init__(self, data_meta, cfs=None):
        self._target = data_meta["target"]
        self._prediction = data_meta["prediction"]
        self._features = data_meta["features"]

        self._cfs = pd.DataFrame(cfs, columns=self._features + [self._target, self._prediction])

    @property
    def all(self):
        return self._cfs

    @all.setter
    def all(self, cfs):
        self._cfs = pd.DataFrame(cfs, columns=self._features + [self._target, self._prediction])
        self._cfs["{}_target".format(self._target)] = self._cfs.pop(self._prediction)

    @property
    def valid(self):
        return self._cfs[self._cfs[self._target] == self._cfs[self._prediction]]

    @property
    def invalid(self):
        return self._cfs[self._cfs[self._target] != self._cfs[self._prediction]]

    def query(self, index):
        return self._cfs.loc[index, :]


class CounterfactualExampleBySubset:
    """A class to store counterfactual examples to a subset of instances"""

    def __init__(self, data_meta, range, original_instances=None):
        self._data_meta = data_meta
        self._target = data_meta["target"]
        self._prediction = data_meta["prediction"]
        self._features = data_meta["features"]

        self._range = range
        self._original_instances = original_instances
        self._subsets = {}

    @property
    def original_instances(self):
        return self._original_instances

    @original_instances.setter
    def original_instances(self, original_instances):
        self._original_instances = original_instances

    def append_counterfactuals(self, feature, cfs):
        if isinstance(cfs, pd.DataFrame):
            cfs = CounterfactualExample(self._data_meta, cfs)
        elif isinstance(cfs, CounterfactualExample):
            pass
        else:
            raise TypeError(
                "Counterfactuals should be either a DataFrame or a CounterFactualExample.")

        self._subsets[feature] = cfs

    @property
    def subsets(self):
        return self._subsets
