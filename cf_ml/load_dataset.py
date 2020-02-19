import os
import numpy as np 
from sklearn import datasets
import pandas as pd

from dataset import Dataset

def load_HELOC_dataset():
    data_df = pd.read_csv('../data/HELOC/heloc_dataset_v1.csv')
    description = pd.read_csv('../data/HELOC/description.csv', index_col='name').to_dict('index')
    for _, info in description.items():
        if type(info['category']) is str:
            info['category'] = info['category'].split(' ')
    return Dataset('HELOC', data_df, description, 'RiskPerformance')

def load_german_credit_dataset():
    pass

def load_boston_housing_dataset():
    pass


if __name__ == '__main__':
    dataset = load_HELOC_dataset()