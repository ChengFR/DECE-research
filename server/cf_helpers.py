import os
import functools
import json

import pandas as pd

# Temporary function to get cf
# TODO: We need to change cf to realtime computation later.
@functools.lru_cache(maxsize=2)
def load_grouped_cf(data_dir):
    df_cf = pd.read_csv(os.path.join(data_dir, 'cf.csv'))
    # print(df_cf.head())
    grouped = df_cf.groupby('OriginIndex')
    idx2cfs = {idx: group.drop(columns='OriginIndex') for idx, group in grouped}
    return idx2cfs


@functools.lru_cache(maxsize=2)
def load_cf_meta(data_dir):
    with open(os.path.join(data_dir, 'cf.meta.json'), 'r') as f:
        meta_cf = json.load(f)
    return meta_cf


@functools.lru_cache(maxsize=64)
def get_cf_by_index(data_dir, index):
    idx2cfs = load_grouped_cf(data_dir)
    cfs = idx2cfs[index]
    return {
        'index': index,
        'counterfactuals': cfs.values.tolist()
    }

@functools.lru_cache(maxsize=2)
def get_cf_all(data_dir):
    idx2cfs = load_grouped_cf(data_dir)
    n = len(idx2cfs)
    return [{
        'index': idx,
        'counterfactuals': idx2cfs[idx].values.tolist()
    } for idx in range(n)]
