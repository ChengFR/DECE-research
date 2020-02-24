import json
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split


class Dataset:
    """A class to store and process dataframe dataset."""

    def __init__(self, name, dataframe, description, target_name, split_rate=0.8):
        """ The initial method
        :param name: str, the name of the dataset, e.g. HELOC, adult
        :param dataframe: pandas.Dataframe, raw dataset in the form of pandas.dataframe
        :param description: dict, key: column name, value: {'type': 'numerical'|'categorical', 'min': number, 'max': number, 
            'decile': number in [0, 1, 2, 3], 'category': array-like}
        :param target_name: str, the name of the target attribute
        """
        self.name = name
        self.raw_df = dataframe
        self.description = description
        self.target_name = target_name

        self.origin_columns = self.raw_df.columns.values.tolist()
        self.dummy_columns = []

        self._check_and_complete_description()
        self._fit_normalizer(self.raw_df)
        self._fit_one_hot_encoder(self.raw_df)

        self.train_df, self.test_df = train_test_split(
            self.raw_df.reset_index(), train_size=split_rate)
        self.train_df.set_index('index', inplace=True)
        self.test_df.set_index('index', inplace=True)

    def _check_and_complete_description(self):
        # check whether each column is noted as numerical or categorical
        assert len(self.raw_df.columns.values) == len(self.description)
        for col, info in self.description.items():
            if not (col in self.origin_columns
                    and info['type'] in ['numerical', 'categorical']):
                raise ValueError(
                    "Illegal description of attribute: {}".format(col))

        # complete min and max for numerical attributes
        for col, info in self.description.items():
            if info['type'] == 'numerical':
                if np.isnan(info['min']):
                    info['min'] = float(self.raw_df[col].min())
                if np.isnan(info['max']):
                    info['max'] = float(self.raw_df[col].max())
                if np.isnan(info['decile']):
                    info['decile'] = 0

        # complete category for categorial attribtues and generate dummy attributes
        for col, info in self.description.items():
            if info['type'] == 'categorical':
                if info['category'] is None or len(info['category']) == 0:
                    info['category'] = self.raw_df[col].unique()
                self.dummy_columns += ['{}_{}'.format(col, cat)
                                       for cat in info['category']]
            else:
                self.dummy_columns.append(col)

        # add index of attributes in dataframe
        for i, col in enumerate(self.origin_columns):
            self.description[col]['index'] = i

    def _fit_normalizer(self, data):
        pass

    def _fit_one_hot_encoder(self, data):
        pass

    def any2df(self, data):
        if type(data) is type(pd.DataFrame()):
            data_df = data
        else:
            data = np.array(data, dtype=np.float)
            if len(data.shape) == 1:
                data = data[np.newaxis, :, :]
            if data.shape[1] == len(self.origin_columns):
                data_df = pd.DataFrame(data, columns=self.origin_columns)
            elif data.shape[1] == len(self.dummy_columns):
                data_df = pd.DataFrame(data, columns=self.dummy_columns)
        return data_df

    def normalize(self, data):
        data_df = self.any2df(data)
        for col in self.origin_columns:
            if self.description[col]['type'] == 'numerical':
                minx = self.description[col]['min']
                maxx = self.description[col]['max']
                if maxx - minx > 1e-6:
                    data_df[col] = (data_df[col] - minx)/(maxx-minx)
        return data_df

    def denormalize(self, data):
        data_df = self.any2df(data)
        for col in self.origin_columns:
            if self.description[col]['type'] == 'numerical':
                minx = self.description[col]['min']
                maxx = self.description[col]['max']
                decile = self.description[col]['decile']
                if maxx - minx > 1e-6:
                    data_df[col] = (data_df[col] * (maxx-minx) + minx).round(decile)
        return data_df

    def to_dummy(self, data):
        data_df = self.any2df(data)
        for col in self.origin_columns:
            if self.description[col]['type'] == 'categorical':
                for cat in self.description[col]['category']:
                    data_df.loc[:, '{}_{}'.format(col, cat)] = (data_df[col] == cat).astype(int)
        return data_df[self.dummy_columns]

    def from_dummy(self, data):
        data_df = self.any2df(data)
        for col in self.origin_columns:
            if self.description[col]['type'] == 'categorical':
                cats = self.description[col]['category']
                dummy_col = ['{}_{}'.format(col, cat) for cat in cats]
                data_df[col] = data_df.apply(lambda row: \
                    cats[np.array([val for col_name, val in zip(data_df.columns, row) if col_name in dummy_col]).argmax()], axis=1)
                # data_df[col] = data_df.apply(lambda row: \
                #     cats[np.array([val for col_name, val in zip(data_df.columns, row) if col_name in dummy_col]).argmax()])
        return data_df[self.origin_columns]

    def preprocess(self, data):
        return self.normalize(self.to_dummy(data))

    def depreprocess(self, data):
        return self.from_dummy(self.denormalize(data))

    def get_train_dataset(self, preprocess=True):
        if preprocess:
            return self.preprocess(self.train_df)
        else:
            return self.train_df

    def get_test_dataset(self, preprocess=True):
        if preprocess:
            return self.preprocess(self.test_df)
        else:
            return self.test_df

    def get_dataset(self, preprocess=True):
        if preprocess:
            return self.preprocess(self.raw_df)
        else:
            return self.raw_df 

    def get_sample(self, index='all', filters=[], preprocess=True):
        if type(index) == int:
            index = [index]
        elif type(index) == str and index == 'all':
            index = [i for i in range(len(self.raw_df))]
        # else:
        #     raise ValueError('index: {} should be either int, list of int, or \'all\'.'.format(index))
        filtered_df = self.raw_df.reset_index().iloc[index]
        for f in filters:
            col = f[0]
            if self.description[col]['type'] == 'numerical':
                filtered_df = filtered_df[(filtered_df[col] >= f[1]) & (filtered_df[col] < f[2])]
            else:
                filtered_df = filtered_df[filtered_df[col].isin(f[1])]
        filtered_df.set_index('index', inplace=True)
        if preprocess:
            return self.preprocess(filtered_df)
        else:
            return filtered_df
    
    def get_columns(self, preprocess=True):
        if preprocess:
            return self.dummy_columns
        else:
            return self.origin_columns

    def process_columns(self, columns):
        new_columns = []
        for col in columns:
            if self.description[col]['type'] == 'categorical':
                cats = self.description[col]['category']
                new_columns += ['{}_{}'.format(col, cat) for cat in cats]
            else:
                new_columns += [col]
        return new_columns

    def get_feature_names(self, preprocess=True):
        column_names = self.get_columns(preprocess)
        target_names = self.get_target_names(preprocess)
        return [col for col in column_names if col not in target_names]

    def get_target_names(self, preprocess=True):
        if preprocess and self.description[self.target_name]['type'] == 'categorical':
            return ['{}_{}'.format(self.target_name, cat) for cat in self.description[self.target_name]['category']]
        else:
            return self.target_name

    def get_name(self):
        return self.name

    def get_description(self):
        return self.description


# class DataMeta(object):

#     def __init__(self, features, target, prediction=None):
#         self.features = features
#         self.target = target
#         self.prediction = prediction

#     @classmethod
#     def from_csv(cls, filename, feature_indices=None, target_index=None, prediction_index=None):
#         df = pd.read_csv(filename)
#         dd = df.to_dict('records')
#         return cls.from_records(dd, feature_indices, target_index, prediction_index)

#     @classmethod
#     def from_records(cls, records, feature_indices=None, target_index=None, prediction_index=None):
#         for i, d in enumerate(records):
#             d["index"] = i
#         target = None if target_index is None else records[target_index]
#         prediction = None if prediction_index is None else records[prediction_index]
#         features = records
#         if feature_indices is not None:
#             features = [records[i] for i in feature_indices]
#         # make sure no column is used twice
#         features = [f for f in features if f is not target and f is not prediction]
#         assert len(features) + (int(target is not None) + int(prediction is not None)) == len(records)
#         return cls(features, target, prediction)


#     @classmethod
#     def from_json(cls, filename):
#         with open(filename, 'r') as f:
#             data = json.load(f)
#         return cls(data['features'], data['target'], data.get('prediction', None))

#     def to_json(self, filename):
#         data = dict(features=self.features, target=self.target)
#         if self.prediction:
#             data['prediction'] = self.prediction
#         with open(filename, 'w') as f:
#             json.dump(data, f)