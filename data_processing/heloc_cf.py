import os
import os.path as path
import pandas as pd
from cf_ml.data import Dataset, DataMeta

DATA_DIR = './output_data/'

DATA_OUTPUT_DIR = './data/processed'

dataname = 'HELOC/linear'


def process():

    descriptions = pd.read_csv(path.join('./data', 'HELOC/description_v2.csv')).to_dict('records')
    descriptions.append({'name': 'Score', 'type': 'numerical', 'description': 'Prediction Score'})
    descriptions[0]['categories'] = ["Bad", "Good"]

    output_dir = path.join(DATA_OUTPUT_DIR, dataname)
    if not path.isdir(output_dir):
        os.makedirs(output_dir)
    
    df = pd.read_csv(path.join(DATA_DIR, 'HELOC/pred_linear_0.052_HELOC.csv'))
    df.to_csv(path.join(output_dir, 'data.csv'), index=False)
    data_meta = DataMeta.from_records(descriptions, target_index=0, prediction_index=-1)
    data_meta.to_json(path.join(output_dir, 'data.meta.json'))


    df_cf = pd.read_csv(path.join(DATA_DIR, 'HELOC/cf_linear_HELOC.csv'))
    df_cf = df_cf.astype({'OriginIndex': int})
    df_cf.to_csv(path.join(output_dir, 'cf.csv'), index=False)

    cf_descriptions = descriptions[1:] + [{'name':'OriginIndex', 'type': 'index', 'description': "The index of the original data"}]
    cf_meta = DataMeta.from_records(cf_descriptions, prediction_index=-2)
    cf_meta.to_json(path.join(output_dir, 'cf.meta.json'))


if __name__ == '__main__':
    process()