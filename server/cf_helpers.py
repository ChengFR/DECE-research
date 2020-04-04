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

def data_meta_translate(des, target, mode="data"):
    data_meta = {'features': [], 'target': None, 'prediction': None}
    for col in des.keys():
        if col == target:
            if mode == 'data':
                data_meta['target'] = {
                    'name': col,
                    # 'description': des[col]['description'],
                    'type': des[col]['type'],
                    'index': des[col]['index']
                }
                if des[col]['type'] == 'categorical':
                    data_meta['target']['categories'] = [str(cat) for cat in des[col]['category']]
                elif des[col]['type'] == 'numerical':
                    # attr['min'] = des[col]['min']
                    # attr['max'] = des[col]['max']
                    attr['extent'] = [des[col]['min'], des[col]['max']+10**-des[col]['decile']]
                    attr['precision'] = des[col]['decile']
        else:
            attr = ({
                'name': col,
                # 'description': des[col]['description'],
                'type': des[col]['type'],
                'index': des[col]['index']
            })
            if des[col]['type'] == 'categorical':
                attr['categories'] = [str(cat) for cat in des[col]['category']]
            elif des[col]['type'] == 'numerical':
                # attr['min'] = des[col]['min']
                # attr['max'] = des[col]['max']
                attr['extent'] = [des[col]['min'], des[col]['max']+10**-des[col]['decile']]
                attr['precision'] = des[col]['decile']
            data_meta['features'].append(attr)
            
    # data_meta['prediction'] = {
    #     'name': 'Score',
    #     'type': 'numerical',
    #     'index': len(des.keys()) if mode == 'data' else len(des.keys())-1,
    #     'extend': [0.0, 1.0]
    # }
    data_meta['prediction'] = {
        'name': '{}_pred'.format(target),
        'type': 'categorical',
        'index': len(des.keys()) if mode == 'data' else len(des.keys())-1,
        'categories': [str(cat) for cat in des[col]['category']]
    }
    if mode == 'data':
        data_meta['index'] = {
            'name': 'index',
            'type': 'numerical',
            'index': len(des.keys())+1,
        }
    return data_meta

def group_cf(cf_df):
    grouped = cf_df.groupby('OriginIndex')
    idx2cfs = [{
            'index': idx,
            'counterfactuals': group.drop(columns='OriginIndex').values.tolist()
        }
        for idx, group in grouped]
    return idx2cfs