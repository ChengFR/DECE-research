import os
import os.path as path
import pandas as pd
from cf_ml.data import Dataset, DataMeta

DATA_DIR = './data/'

DATA_OUTPUT_DIR = './data/processed'

dataname = 'HELOC'


def preprocess():
    df = pd.read_csv(path.join(DATA_DIR, 'HELOC/heloc_dataset_v2.csv'))
    data_meta = DataMeta.from_csv(path.join(DATA_DIR, 'HELOC/description.csv'))
    data_meta.target["categories"] = ["Bad", "Good"]

    output_dir = path.join(DATA_OUTPUT_DIR, dataname)
    if not path.isdir(output_dir):
        os.makedirs(output_dir)

    df.to_csv(path.join(output_dir, 'data.csv'), index=False)
    data_meta.to_json(path.join(output_dir, 'data.meta.json'))


if __name__ == '__main__':
    preprocess()