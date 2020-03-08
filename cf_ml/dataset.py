import json
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split


class Dataset:
    """A class to store and process dataframe dataset."""

    def __init__(self, name, dataframe, description, target_name, split_rate=0.8, split_seed=0):
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
            self.raw_df.reset_index(), train_size=split_rate, random_state=0)
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
                if 'min' not in info or np.isnan(info['min']):
                    info['min'] = float(self.raw_df[col].min())
                if 'max' not in info or np.isnan(info['max']):
                    info['max'] = float(self.raw_df[col].max())
                if 'decile' not in info or np.isnan(info['decile']):
                    info['decile'] = 0
                else:
                    info['decile'] = int(info['decile'])

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

    # def any2df(self, data, mode='all'):
    #     if type(data) is type(pd.DataFrame()):
    #         data_df = data
    #     else:
    #         data = np.array(data, dtype=np.float)
    #         if len(data.shape) == 1:
    #             data = data[np.newaxis, :, :]
    #         if 'mode' == 'all':
    #             if data.shape[1] == len(self.origin_columns):
    #                 data_df = pd.DataFrame(data, columns=self.origin_columns)
    #             elif data.shape[1] == len(self.dummy_columns):
    #                 data_df = pd.DataFrame(data, columns=self.dummy_columns)
    #         elif 'mode' == 'x':
    #             if data.shape[1] == len(self.get_feature_names(preprocess=False)):
    #                 data_df = pd.DataFrame(data, columns=self.get_feature_names(preprocess=False))
    #             elif data.shape[1] == len(self.get_feature_names(preprocess=True)):
    #                 data_df = pd.DataFrame(data, columns=self.get_feature_names(preprocess=True))
    #     return data_df

    def _normalize(self, data_df):
        for col in self.origin_columns:
            if self.description[col]['type'] == 'numerical':
                minx = self.description[col]['min']
                maxx = self.description[col]['max']
                if maxx - minx > 1e-6:
                    data_df[col] = (data_df[col] - minx)/(maxx-minx)
        return data_df

    def _denormalize(self, data_df):
        for col in self.origin_columns:
            if self.description[col]['type'] == 'numerical':
                minx = self.description[col]['min']
                maxx = self.description[col]['max']
                decile = self.description[col]['decile']
                if maxx - minx > 1e-6:
                    data_df[col] = (data_df[col] * (maxx-minx) + minx).round(decile)
        return data_df

    def _to_dummy(self, data_df):
        for col in self.origin_columns:
            if self.description[col]['type'] == 'categorical':
                for cat in self.description[col]['category']:
                    data_df.loc[:, '{}_{}'.format(col, cat)] = (data_df[col] == cat).astype(int)
        return data_df[self.dummy_columns]

    def _from_dummy(self, data_df):
        for col in self.origin_columns:
            if self.description[col]['type'] == 'categorical':
                cats = self.description[col]['category']
                dummy_col = ['{}_{}'.format(col, cat) for cat in cats]
                category_index = data_df[dummy_col].values.argmax(axis=1)
                category_value = [cats[index] for index in category_index]
                data_df[col] = category_value
                # data_df[col] = data_df.apply(lambda row: \
                #     cats[np.array([val for col_name, val in zip(data_df.columns, row) if col_name in dummy_col]).argmax()])
        return data_df[self.origin_columns]

    def preprocess(self, data, mode='all'):
        if mode == 'all':
            if type(data) is type(pd.DataFrame()):
                data_df = data
            elif type(data) is type(np.array([])):
                data_df = pd.DataFrame(data, columns=self.origin_columns)
            processed_df = self._normalize(self._to_dummy(data_df))
        elif mode == 'x':
            if type(data) is type(pd.DataFrame()):
                data_df = data
            elif type(data) is type(np.array([])):
                data_df = pd.DataFrame(data, columns=self.get_feature_names(preprocess=False))
            target_col = self.get_target_names(preprocess=False)
            if self.description[target_col]['type'] == 'categorical':
                data_df[target_col] = self.description[target_col]['category'][0]
            else:
                data_df[target_col] = self.description[target_col]['min']
            processed_df = self._normalize(self._to_dummy(data_df))[self.get_feature_names(preprocess=False)]

        return processed_df
        
    def depreprocess(self, data, mode='all'):
        if mode == 'all':
            if type(data) is type(pd.DataFrame()):
                data_df = data
            elif type(data) is type(np.array([])):
                data_df = pd.DataFrame(data, columns=self.dummy_columns)
            deprocessed_df = self._from_dummy(self._denormalize(data_df))
        elif mode == 'x':
            if type(data) is type(pd.DataFrame()):
                data_df = data
            elif type(data) is type(np.array([])):
                data_df = pd.DataFrame(data, columns=self.get_feature_names(preprocess=False))
            for col in self.get_target_names(preprocess=True):  
                data_df[col] = 0
            deprocessed_df = self._from_dummy(self._denormalize(data_df))[self.get_feature_names(preprocess=True)]
        return deprocessed_df

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

    def get_dataset(self, preprocess=True, valid=False):
        data = self.raw_df.copy()
        if valid:
            for f in self.get_feature_names(preprocess=False):
                des = self.description[f]
                if des['type'] == 'numerical':
                    data = data[(data[f] >= des['min']) & (data[f] <= des['max'])]
        if preprocess:
            data = self.preprocess(data)
        return data

    def get_sample(self, index='all', filters=[], preprocess=True):
        if type(index) == int:
            index = [index]
        elif type(index) == str and index == 'all':
            index = self.raw_df.index
        elif type(index) == str and index == 'train':
            index = self.train_df.index
        elif type(index) == str and index == 'test':
            index = self.test_df.index
        # else:
        #     raise ValueError('index: {} should be either int, list of int, or \'all\'.'.format(index))
        filtered_df = self.raw_df.iloc[index]

        for f in filters:
            col = f[0]
            if self.description[col]['type'] == 'numerical':
                filtered_df = filtered_df[(filtered_df[col] >= f[1]) & (filtered_df[col] < f[2])]
            else:
                filtered_df = filtered_df[filtered_df[col].isin(f[1])]
        # filtered_df.set_index(index, inplace=True)
        if preprocess:
            return self.preprocess(filtered_df)
        else:
            return filtered_df

    def get_mads(self, preprocess=True):
        """"""
        data = self.get_dataset(preprocess=preprocess, valid=True)
        features = self.get_feature_names(preprocess=False)
        mads = {}
        for f in features:
            if self.description[f]['type'] == 'numerical':
                mads[f] = np.median(abs(data[f].values - np.median(data[f].values)))
            else:
                for cat in self.description[f]['category']:
                    mads['{}_{}'.format(f, cat)] = 0
        return mads
    
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