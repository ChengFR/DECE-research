import os
import numpy as np 
from sklearn import datasets
import pandas as pd

from data import Dataset

def load_HELOC_dataset():
    df = pd.read_csv('../data/HELOC/heloc_dataset_v2.csv')
    data = df.to_numpy()
    x = data[:, 1:]
    y = data[:, 0]
    dd = pd.read_csv('../data/HELOC/description.csv')
    attr_disc = dd.to_dict('records')
    return Dataset(attr_disc=attr_disc, name='HELOC', x=x, y=y)

def load_german_credit_dataset():
    pass

def load_boston_housing_dataset():
    pass


if __name__ == '__main__':
    dataset = load_HELOC_dataset()