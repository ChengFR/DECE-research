import os
import functools
import json

import pandas as pd

# Temporary function to get cf
# TODO: We need to change cf to realtime computation later.
# @functools.lru_cache(maxsize=2)
# def load_grouped_cf(data_dir):
#     df_cf = pd.read_csv(os.path.join(data_dir, 'cf.csv'))
#     # with open(os.path.join(data_dir, 'cf.meta.json'), 'r') as f:
#     #     meta_cf = json.load(f)
#     # # print(df_cf.head())
#     # prediction_name = meta_cf['prediction']['name']
#     grouped = df_cf.groupby('OriginIndex')
#     idx2cfs = {
#         idx: {
#             'index': idx,
#             'counterfactuals': group.drop(columns='OriginIndex').values.T.tolist()
#         }
#         for idx, group in grouped}
#     return idx2cfs


# @functools.lru_cache(maxsize=2)
# def load_cf_meta(data_dir):
#     with open(os.path.join(data_dir, 'cf.meta.json'), 'r') as f:
#         meta_cf = json.load(f)
#     return meta_cf


# @functools.lru_cache(maxsize=64)
# def get_cf_by_index(data_dir, index):
#     idx2cfs = load_grouped_cf(data_dir)
#     cfs = idx2cfs[index]
#     return cfs


# @functools.lru_cache(maxsize=2)
# def get_cf_all(data_dir):
#     idx2cfs = load_grouped_cf(data_dir)
#     n = len(idx2cfs)
#     return [idx2cfs[idx] for idx in range(n)]

# export interface FeatureDisc {
#   name: string;
#   description?: string;
#   type: FeatureType;
#   index: number;
#   categories?: string[];
#   extent?: [number, number];
# }

def data_meta_translate(des, target):
    data_meta = {'features': [], 'target': None, 'prediction': None}
    for col in des.keys():
        if col == target:
            data_meta['target'] = {
                'name': col,
                'description': des[col]['description'],
                'type': des[col]['type'],
                'index': des[col]['index']
            }
            if des[col]['type'] == 'categorical':
                data_meta['target']['categories'] = des[col]['category']
        else:
            attr = ({
                'name': col,
                'description': des[col]['description'],
                'type': des[col]['type'],
                'index': des[col]['index']
            })
            if des[col]['type'] == 'categorical':
                attr['categories'] = des[col]['category']
            data_meta['features'].append(attr)
            
    data_meta['prediction'] = {
        'name': 'Score',
        'type': 'numerical',
        'index': len(des.keys()),
        'extend': [0.0, 1.0]
    }
    return data_meta

def group_cfs(cf_df):
    grouped = cf_df.groupby('OriginIndex')
    idx2cfs = {
        idx: {
            'index': idx,
            'counterfactuals': group.drop(columns='OriginIndex').values.T.tolist()
        }
        for idx, group in grouped}
    return idx2cfs