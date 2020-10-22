import io
import os
import logging
import json

from flask.json import JSONEncoder
from flask import request, jsonify, Blueprint, current_app, Response

# from .cf_helpers import get_cf_by_index, get_cf_all
# from .cf_helpers import data_meta_translate, group_cf
from .helpers import trans_data_meta

api = Blueprint('api', __name__)

logger = logging.getLogger('api')


class ApiError(Exception):
    """
    API error handler Exception
    See: http://flask.pocoo.org/docs/0.12/patterns/apierrors/
    """
    status_code = 400

    def __init__(self, message, status_code=None, payload=None):
        Exception.__init__(self)
        self.message = message
        if status_code is not None:
            self.status_code = status_code
        self.payload = payload

    def to_dict(self):
        rv = dict(self.payload or ())
        rv['message'] = self.message
        return rv


@api.errorhandler(ApiError)
def handle_invalid_usage(error):
    logging.exception(error)
    response = jsonify(error.to_dict())
    response.status_code = error.status_code
    return response


class BetterJSONEncoder(JSONEncoder):
    """
    JSONEncoder subclass that knows how to encode numpy.ndarray.
    """

    def default(self, o):
        if hasattr(o, 'tolist'):
            return o.tolist()
        return super().default(o)


# inject a more powerful jsonEncoder
api.json_encoder = BetterJSONEncoder


# def send_csv(df):
#     output = io.StringIO()
#     df.to_csv(output)
#     return Response(output.getvalue(), mimetype="text/csv")


# def get_data_dir(data_name, model_name):
#     name = data_name if model_name is None else '{}/{}'.format(
#         data_name, model_name)
#     return os.path.join(current_app.config["DATA_DIR"], name)


@api.route('/data_meta', methods=['GET'])
def get_data_meta():
    data_meta = trans_data_meta(current_app.dir_manager.dataset_meta)
    return jsonify(data_meta)

@api.route('/cf_meta', methods=['GET'])
def get_cf_meta():
    data_meta = trans_data_meta(current_app.dir_manager.dataset_meta)
    return jsonify(data_meta)

@api.route('/data', methods=['GET'])
def get_data():
    data_df = current_app.dir_manager.load_prediction('dataset')
    return Response(data_df.to_csv(index=False), mimetype="text/csv")

# will be soon deprecated
@api.route('/cf', methods=['GET', 'POST'])
def get_cf():
    # changeable_attr = request.args.get('changeable_attr', default='all', type=str)
    # cf_num = request.args.get('cf_num', default=1, type=int)
    # data_range = {}
    # desired_class = 'opposite'
    # setting = {'changeable_attribute': changeable_attr, 'data_range': data_range, 'cf_num': cf_num, 'desired_class': desired_class}
    setting = {'data_range': {}, 'cf_range': {}}
    subset_cf = current_app.cf_engine.generate_cfs_from_setting(setting, batch_size=512)

    index = None
    if request.method == 'GET':
        index = request.args.get('index', type=int)
    elif request.method == 'POST':
        index = request.json.get('index', None)
    if index is not None:
        cf_df = subset_cf.get_cf_by_origin_index(index)
    else:
        cf_df = subset_cf.get_cf()
    data_meta = current_app.dir_manager.get_dataset_meta()
    target_name = data_meta['target_name']
    cols = current_app.dataset.get_columns(preprocess=False) + ['{}_pred'.format(target_name), 'OriginIndex']
    cf_dict = group_cf(cf_df[cols])
    return jsonify(cf_dict)

@api.route('/r_counterfactuals', methods=['GET', 'POST'])
def get_cf_subset():
    request_params = request.get_json()
    filters = request_params["filters"]
    filters = {f["name"]: {**f, "min": f.get("extent", [0, 0])[0], 
        "max": f.get("extent", [0, 0])[1]} for f in filters}
    index = current_app.dataset.get_subset(filters=filters).index.tolist()
    r_counterfactuals = current_app.cf_engine.generate_r_counterfactuals(filters, True, True, verbose=True)
    r_counterfactuals_data = [r_counterfactuals.subsets[f].all.values.tolist() for f in current_app.dataset.features]
    return jsonify({'index': index, 'counterfactuals': r_counterfactuals_data})

@api.route('/predict', methods=['POST'])
def predict_instance():
    request_params = request.get_json()
    query_instance_inlist = request_params['queryInstance']
    features = current_app.dataset.get_feature_names(preprocess=False)
    disc = current_app.dataset.get_description()
    for i, name in enumerate(features):
        if disc[name]['type'] == 'categorical':
            if query_instance_inlist[i] not in disc[name]['category']:
                query_instance_inlist[i] = int(query_instance_inlist[i])
    query_instance = current_app.dataset.preprocess(query_instance_inlist, mode='x')
    result = current_app.model.predict(query_instance_inlist)
    print(result['{}_pred'.format(current_app.dataset.get_target_names(False))].values.tolist())
    return str(result['{}_pred'.format(current_app.dataset.get_target_names(False))].values[0])

@api.route('/cf_instance', methods=['GET', 'POST'])
def get_cf_instance():
    # print(request.get_json())
    features = current_app.dataset.get_feature_names(preprocess=False)
    request_params = request.get_json()
    query_instance_inlist = request_params['queryInstance']
    target_label = request_params.get('target', 'opposite')
    k = request_params.get('k', -1)
    cf_num = request_params.get('cfNum', 1)
    attr_flex = request_params.get('attrFlex', None)
    disc = current_app.dataset.get_description()
    if attr_flex:
        changeable_attr = [features[i] for i in range(len(attr_flex)) if attr_flex[i]]
    else:
        changeable_attr = 'all'
    attr_range = {}
    for filter in request_params['attrRange']:
        name = filter["name"]
        if name in features:
            s = {}
            if disc[name]['type'] == 'numerical':
                _min = filter["extent"][0]
                _max = filter["extent"][1]
                # if _min > disc[name]["min"]:
                s['min'] = _min
                # if _max < disc[name]["max"]:
                s['max'] = _max
                attr_range[name] = s
            else: 
                # a tmp implementation
                cats = []
                for cat in filter['categories']:
                    if cat not in disc[name]['category']:
                        cats.append(int(cat))
                    else:
                        cats.append(cat)
                s['category'] = cats
                attr_range[name] = s
    
    for i, name in enumerate(current_app.dataset.get_feature_names(preprocess=False)):
        if disc[name]['type'] == 'categorical':
            if query_instance_inlist[i] not in disc[name]['category']:
                query_instance_inlist[i] = int(query_instance_inlist[i])

    setting = {'changeable_attribute': changeable_attr, 'cf_range': attr_range, 
        'data_range': {}, 'cf_num': cf_num, 'desired_class': 'opposite', 'k': k}
    print(query_instance_inlist, setting)
    
    subset_cf = current_app.cf_engine.generate_cfs_from_setting(setting, query_instance_inlist, 
        diversity_weight=0.01, post_step=10)
    cf_df = subset_cf.get_cf()
    origin_df = subset_cf.get_instance()
    pred_name = '{}_pred'.format(current_app.dataset.get_target_names(False))
    pred_label = origin_df.loc[0, pred_name]
    print(pred_label)
    # cf_df = cf_df[cf_df[pred_name] != pred_label]
    cols = current_app.dataset.get_feature_names(preprocess=False) + [pred_name]
    return jsonify(cf_df[cols].values.tolist())
