import numpy as np 
import pandas as pd 


class CounterfactualExample:
    """A class to store counterfactual examples to an instance"""
    def __init__(self):
        pass

class CounterfactualExampleBySubset:
    """A class to store counterfactual examples to a subset"""

    def __init__(self, dataset, cf_num):
        self.dataset = dataset
        self.cf_num = cf_num
        self.cf_df = pd.DataFrame()
        self.instance_df = pd.DataFrame()

    def append_cfs(self, cf_df, instance_df):
        if len(self.cf_df) == 0:
            self.cf_df = cf_df
            self.instance_df = instance_df
        else:
            self.cf_df = self.cf_df.append(cf_df)
            self.instance_df = self.instance_df.append(instance_df)

    def _add_index_col(self):
        self.cf_df['OriginIndex'] = np.array([(i//self.cf_num) for i in range(len(self.cf_df))])

    