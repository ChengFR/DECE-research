import os
import numpy as np 
from sklearn import datasets
import pandas as pd

from dataset import Dataset

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data')

def load_HELOC_dataset():
    data_df = pd.read_csv(os.path.join(DATA_DIR, 'HELOC/heloc_dataset_v1.csv'))
    description = pd.read_csv(os.path.join(DATA_DIR,'HELOC/description.csv'), index_col='name').to_dict('index')
    for _, info in description.items():
        if type(info['category']) is str:
            info['category'] = info['category'].split(' ')
    return Dataset('HELOC', data_df, description, 'RiskPerformance')

def load_german_credit_dataset():
    description = pd.read_csv(os.path.join(DATA_DIR,'german-credit/description.csv'), index_col='name')
    cols = description.index
    description = description.to_dict('index')
    data_df = pd.read_csv(os.path.join(DATA_DIR, 'german-credit/GermanData.csv'), names=cols)
    for _, info in description.items():
        if type(info['category']) is str:
            try: 
                info['category'] = [int(cat) for cat in info['category'].split(' ')]
            except:
                info['category'] = info['category'].split(' ')
    return Dataset('german-credit', data_df, description, 'Output')

def load_simplified_german_credit_dataset():
    description = pd.read_csv(os.path.join(DATA_DIR,'german-credit-simplified/description.csv'), index_col='name').to_dict('index')
    data_df = pd.read_csv(os.path.join(DATA_DIR, 'german-credit-simplified/german_credit_data.csv'), index_col='Unnamed: 0')
    return Dataset('german-credit-simplified', data_df, description, 'Risk')

def load_boston_housing_dataset():
    pass

def load_diabetes_dataset():
    data_df = pd.read_csv(os.path.join(DATA_DIR, 'diabetes/diabetes.csv'))
    description = pd.read_csv(os.path.join(DATA_DIR,'diabetes/description.csv'), index_col='name').to_dict('index')
    for _, info in description.items():
        if type(info['category']) is str:
            info['category'] = [int(cat) for cat in info['category'].split(' ')]
    return Dataset('diabetes', data_df, description, 'Outcome')


if __name__ == '__main__':
    dataset = load_HELOC_dataset()