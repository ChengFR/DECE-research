import numpy as np 
import pandas as pd 
import os


class CounterfactualExample:
    """A class to store counterfactual examples to an instance"""
    def __init__(self):
        pass

class CounterfactualExampleBySubset:
    """A class to store counterfactual examples to a subset"""

    def __init__(self, dataset, cf_num):
        self.dataset = dataset
        self.cf_num = cf_num
        origin_columns = self.dataset.get_columns(preprocess=False)
        target_name = self.dataset.get_target_names(preprocess=False)
        self.cf_column = origin_columns+['{}_pred'.format(target_name), 'Score', 'OriginIndex']
        self.instance_column = origin_columns+['{}_pred'.format(target_name), 'Score']
        self.cf_df = pd.DataFrame(columns=self.cf_column)
        self.instance_df = pd.DataFrame(columns=self.instance_column)

    def append_cfs(self, cf_df, instance_df):
        cf_df = cf_df.copy()
        instance_df = instance_df.copy()
        self.cf_df = pd.concat([self.cf_df, self._add_index_col(cf_df, instance_df)[self.cf_column]])
        self.instance_df = pd.concat([self.instance_df, instance_df[self.instance_column]])

    def _add_index_col(self, cf_df, instance_df):
        cf_df['OriginIndex'] = [instance_df.index.values.astype(int)[i//self.cf_num] for i in range(len(cf_df))]
        return cf_df

    def get_cf(self):
        """read only"""
        return self.cf_df.copy()
    
    def get_instance(self):
        """read only"""
        return self.instance_df.copy()

    def to_csv(self, header, dirpath):
        self.cf_df.to_csv(os.path.join(dirpath, '{}_cf.csv'.format(header)))
        self.instance_df.to_csv(os.path.join(dirpath, '{}_data.csv'.format(header)))

    def from_csv(self, header, dirpath):
        self.cf_df = pd.read_csv(os.path.join(dirpath, '{}_cf.csv'.format(header)))[self.cf_column]
        self.instance_df = pd.read_csv(os.path.join(dirpath, '{}_data.csv'.format(header)))[self.instance_column]

    

    
