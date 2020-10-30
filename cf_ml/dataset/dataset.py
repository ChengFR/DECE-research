import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import MinMaxScaler


class Dataset:
    """A class to store and process datasets in pd.DataFrame.

    Args: 
        name: str, the name of the dataset, e.g. diabetes, german-credit.
        dataframe: pandas.DataFrame, raw dataset in the form of pandas.DataFrame
        description: dict, key: column name, value: {'type': 'numerical'|'categorical', 
            'min': number (optional), 'max': number (optional), 
            'decile': precision in number (optional), 
            'category': list of categories (optional)}.
        target_name: str, the name of the target attribute.
        split_rate: number, the ratio between the training dataset size and the whole dataset 
    """

    def __init__(self, name, dataframe, description, target_name, split_rate=0.8):
        self._name = name
        self._data = dataframe
        self._columns = [col for col in self._data.columns if col in description]
        self._description = self._check_and_clean_description(description)
        self._target = target_name

        self._dummy_columns = self._get_all_columns(self._columns)

        self._features = list(filter(lambda x: x != self.target, self.columns))
        self._numerical_features = list(filter(self.is_num, self._features))
        self._categorical_features = list(filter(lambda x: not self.is_num(x), self._features))

        self._check_dataframe()

        self._feature_scalar = MinMaxScaler()
        self._fit_normalizer()
        self._fit_one_hot_encoder()

        train_df, test_df = train_test_split(
            self._data, train_size=split_rate, random_state=0)

        self._train_X = train_df[self.features]
        self._train_y = train_df[self.target]
        self._test_X = test_df[self.features]
        self._test_y = test_df[self.target]

    def _check_and_clean_description(self, description):
        """Check and fill the descriptions to the dataset."""
        clean_description = {col: {'index': self.columns.index(col), 'type': info['type']} 
			for col, info in description.items()}
        # check whether each column is noted as numerical or categorical
        for col, info in clean_description.items():
            if info['type'] not in ['numerical', 'categorical']:
                raise ValueError(
                    "Illegal description of attribute: {}".format(col))

        for col, info in description.items():
            # complete min, max, and decile for numerical attributes
            if info['type'] == 'numerical':
                clean_description[col]['min'] = info.get('min', float(self.data[col].min()))
                clean_description[col]['max'] = info.get('max', float(self.data[col].max()))
                decile = int(info.get('decile', 0))
                clean_description[col]['decile'] = decile
                clean_description[col]['scale'] = 1 if decile == 0 else 0.1 ** decile
            # complete categories for categorical attributes
            else:
                clean_description[col]['categories'] = info.get('category',
                                                                self._data[col].unique().tolist())

        return clean_description

    def _check_dataframe(self):
        """Check the stringify the categorical data in the dataframe."""
        for col in self.columns:
            if not self.is_num(col):
                self._data[col] = self._data[col].apply(lambda x: str(x))
                self._description[col]['categories'] = [str(cat) for cat in
                                                        self._description[col]['categories']]

    def is_num(self, column_name):
        """Check whether the type of the column is numerical."""
        return self.description[column_name]['type'] == 'numerical'

    def get_dummy_columns(self, column, categories=None):
        """Get the names of the dummy columns from the original column name and categories."""
        if self.is_num(column):
            return [column]
        if categories is None:
            categories = self.description[column]['categories']
        return ["{}_{}".format(column, cat) for cat in categories]

    def _get_all_columns(self, columns):
        dummy_columns = []
        for col in columns:
            dummy_columns.extend(self.get_dummy_columns(col))
        return dummy_columns

    def _fit_normalizer(self):
        self._feature_scalar.fit(self._data[self.numerical_features])

    def _fit_one_hot_encoder(self):
        pass

    def _normalize(self, data):
        data = data.copy()
        data[self.numerical_features] = self._feature_scalar.transform(
            data[self.numerical_features])
        return data

    def normalize_feature(self, feature, value):
        """Get the normalized feature value."""
        data = pd.DataFrame(np.zeros((1, len(self.numerical_features))),
                            columns=self.numerical_features)
        data[feature] = value
        data[data.columns] = self._feature_scalar.transform(data)
        return data[feature]

    def _denormalize(self, data):
        data = data.copy()
        data[self.numerical_features] = self._feature_scalar.inverse_transform(
            data[self.numerical_features])
        # Refine the numerical feauture values with valid precisions.
        for f in self.numerical_features:
            data[f] = np.round(data[f].astype(float) / self.description[f]['scale']) * \
                      self.description[f]['scale']
        return data

    def _to_dummy(self, data):
        data = data.copy()
        cat_cols = [col for col in self.categorical_features + [self.target] if
                    col in data.columns]
        for col in cat_cols:
            for cat in self.description[col]['categories']:
                data["{}_{}".format(col, cat)] = data[col].apply(lambda x: x == cat).astype(int)

        cols = [col for col in self.dummy_columns if col in data.columns]
        return data[cols]

    def _from_dummy(self, data, inplace=True):
        data = data.copy()
        for col in self.columns:
            if not self.is_num(col):
                cats = self._description[col]['categories']
                dummy_cols = ['{}_{}'.format(col, cat) for cat in cats]
                intersection_cols = [col for col in dummy_cols if col in data.columns]
                if len(intersection_cols) > 0:
                    data[col] = self._stack_dummy(data[intersection_cols], col)
                    if inplace:
                        for col in intersection_cols:
                            data.pop(col)

        cols = [col for col in self.columns if col in data.columns]

        return data[cols]

    def _stack_dummy(self, data, original_column):
        cats = self._description[original_column]['categories']
        dummy_col = ['{}_{}'.format(original_column, cat) for cat in cats]
        category_index = data.loc[:, dummy_col].values.argmax(axis=1)
        category_value = [cats[index] for index in category_index]
        return category_value

    def _any2df(self, data, columns):
        if isinstance(data, dict):
            data = [data]
        return pd.DataFrame(data, columns=columns)

    def preprocess(self, data):
        """Pre-process data, including both feature values and target values."""
        data = self._any2df(data, self.columns)
        return self._normalize(self._to_dummy(data))

    def preprocess_X(self, data):
        """Pre-process feature data."""
        data = self._any2df(data, self.features)
        return self._normalize(self._to_dummy(data))

    def preprocess_y(self, data):
        """Pre-process target data."""
        data = self._any2df(data, [self.target])
        return self._to_dummy(pd.DataFrame(data))

    def inverse_preprocess(self, data):
        """Inversely process data, including both feature values and target values."""
        data = self._any2df(data, self.dummy_columns)
        return self._from_dummy(self._denormalize(data))

    def inverse_preprocess_X(self, data):
        """Inversely process feature data."""
        data = self._any2df(data, self.dummy_features)
        return self._from_dummy(self._denormalize(data))

    def inverse_preprocess_y(self, data):
        """Inversely process target data."""
        data = self._any2df(data, self.dummy_target)
        return self._from_dummy(pd.DataFrame(data))

    def get_subset(self, index='all', filters=None, preprocess=True):
        """Get a subset of data from the given indexes and constrained by the given filters."""
        if filters is None:
            filters = {}
        if type(index) == int:
            index = [index]
        elif type(index) == str and index == 'all':
            index = self._data.index
        elif type(index) == str and index == 'train':
            index = self._train_X.index
        elif type(index) == str and index == 'test':
            index = self._test_X.index

        filtered_df = self._data.iloc[index]

        for col, info in filters.items():
            if 'min' in info:
                filtered_df = filtered_df[filtered_df[col] >= info['min']]
            if 'max' in info:
                filtered_df = filtered_df[filtered_df[col] < info['max']]
            if 'categories' in info:
                filtered_df = filtered_df[filtered_df[col].isin(info['categories'])]

        if len(filtered_df) == 0:
            return None

        if preprocess:
            return self.preprocess(filtered_df)
        else:
            return filtered_df

    def get_mads(self, preprocess=True):
        """Gets median absolute deviation (MAD) values of all features. """
        columns = self.dummy_features if preprocess else self.features
        mads = {col: 1 for col in columns}
        data = self.preprocess(self.data) if preprocess else self.data
        for feature in self.numerical_features:
            mads[feature] = np.median(abs(data[feature].values - np.median(data[feature].values)))
        return mads

    def get_universal_range(self):
        """Get the range of all feature values."""
        categorical_feature_range = {cat_f: {'categories': self.description[cat_f]['categories']}
                                     for cat_f in self.categorical_features}
        numerical_feature_range = {num_f: {
            'decile': self.description[num_f]['decile'],
            'min': int(self.description[num_f]['min'] / self.description[num_f]['scale']),
            'max': int(self.description[num_f]['max'] / self.description[num_f]['scale']) + 1} for
            num_f in self.numerical_features}
        return {**categorical_feature_range, **numerical_feature_range}

    @property
    def name(self):
        return self._name

    @property
    def description(self):
        return self._description

    @property
    def data(self):
        return self._data

    @property
    def target(self):
        return self._target

    @property
    def prediction(self):
        return "{}_pred".format(self._target)

    @property
    def columns(self):
        return self._columns

    @property
    def dummy_columns(self):
        return self._dummy_columns

    @property
    def dummy_target(self):
        return self._get_all_columns([self.target])

    @property
    def features(self):
        return self._features

    @property
    def dummy_features(self):
        return self._get_all_columns(self.features)

    @property
    def numerical_features(self):
        return self._numerical_features

    @property
    def categorical_features(self):
        return self._categorical_features

    def get_train_X(self, preprocess=True):
        return self.preprocess_X(self._train_X) if preprocess else self._train_X

    def get_train_y(self, preprocess=True):
        return self.preprocess_y(self._train_y) if preprocess else self._train_y

    def get_test_X(self, preprocess=True):
        return self.preprocess_X(self._test_X) if preprocess else self._test_X

    def get_test_y(self, preprocess=True):
        return self.preprocess_y(self._test_y) if preprocess else self._test_y
