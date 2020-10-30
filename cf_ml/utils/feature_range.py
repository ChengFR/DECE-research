import copy
import json


def unique_range(range, universal_range):
    new_range = copy.deepcopy(universal_range)
    range = copy.deepcopy(range)
    for k, v in range.items():
        concrete_v = {}
        if 'min' in v:
            scale = 0.1 ** new_range[k]['decile']
            concrete_v['min'] = max(round(v['min'] / scale), new_range[k]['min'])
        if 'max' in v:
            scale = 0.1 ** new_range[k]['decile']
            concrete_v['max'] = min(round(v['max'] / scale), new_range[k]['max'])
        if 'categories' in v:
            concrete_v['categories'] = v['categories']
        new_range[k] = {**new_range[k], **concrete_v}
    return new_range


def tokenize(data_range, feature_range, universal_range):
    unique_data_range = unique_range(data_range, universal_range)
    unique_feature_range = unique_range(feature_range, universal_range)
    data_range_token = hash(json.dumps(unique_data_range, sort_keys=True))
    feature_range_token = hash(json.dumps(unique_feature_range, sort_keys=True))
    token = (data_range_token << 1) + feature_range_token
    return token
