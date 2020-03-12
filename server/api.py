import io
import os
import logging
import json

from flask.json import JSONEncoder
from flask import request, jsonify, Blueprint, current_app, Response

# from .cf_helpers import get_cf_by_index, get_cf_all
from .cf_helpers import data_meta_translate, group_cf

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
    # response = jsonify(error.to_dict())
    # response.status_code = error.status_code
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


def send_csv(df):
    output = io.StringIO()
    df.to_csv(output)
    return Response(output.getvalue(), mimetype="text/csv")


def get_data_dir(data_name, model_name):
    name = data_name if model_name is None else '{}/{}'.format(
        data_name, model_name)
    return os.path.join(current_app.config["DATA_DIR"], name)


# @api.route('/data', methods=['GET'])
# def get_data():
#     # temporary test data
#     data_name = request.args.get('dataId', default='HELOC', type=str)
#     model_name = request.args.get('modelId', default=None)
#     data_path = os.path.join(get_data_dir(data_name, model_name), 'data.csv')
#     with open(data_path, 'r') as f:
#         data = f.read()
#     return Response(data, mimetype="text/csv")

# @api.route('/data', methods=['GET'])
# def get_data():
#     return Response()

@api.route('/data_meta', methods=['GET'])
def get_data_meta():
    data_meta = current_app.dir_manager.get_dataset_meta()
    des = data_meta['description']
    target_name = data_meta['target_name']
    # return Response(data_meta, mimetype="text/json")
    return jsonify(data_meta_translate(des, target_name))
    # return Response(jsonify(data_meta), mimetype="text/json")

@api.route('/cf_meta', methods=['GET'])
def get_cf_meta():
    data_meta = current_app.dir_manager.get_dataset_meta()
    des = data_meta['description']
    target_name = data_meta['target_name']
    # return Response(data_meta, mimetype="text/json")
    return jsonify(data_meta_translate(des, target_name))

@api.route('/data', methods=['GET'])
def get_data():
    data_df = current_app.dir_manager.load_prediction('dataset', only_valid=True)
    cols = current_app.dataset.get_columns(preprocess=False) + ['Score', 'index']
    data_df.reset_index(inplace=True)
    return Response(data_df[cols].to_csv(index=False), mimetype="text/csv")

@api.route('/cf', methods=['GET', 'POST'])
def get_cf():
    changeable_attr = request.args.get('changeable_attr', default='all', type=str)
    cf_num = request.args.get('cf_num', default=1, type=int)
    filters = []
    desired_class = 'opposite'
    setting = {'changeable_attribute': changeable_attr, 'filters': filters, 'cf_num': cf_num, 'desired_class': desired_class}
    subset_cf = current_app.cf_engine.generate_cfs_from_setting(setting)

    index = None
    if request.method == 'GET':
        index = request.args.get('index', type=int)
    elif request.method == 'POST':
        index = request.json.get('index', None)
    # print(index)
    if index is not None:
        cf_df = subset_cf.get_cf_by_origin_index(index)
    else:
        cf_df = subset_cf.get_cf()
    cols = current_app.dataset.get_columns(preprocess=False) + ['Score', 'OriginIndex']
    cf_dict = group_cf(cf_df[cols])
    return jsonify(cf_dict)

@api.route('/cf_instance', methods=['GET', 'POST'])
def get_cf_instance():

    # try:
    #     query_instance = json.loads(request.args.get('instance', type=None, default=None))
    # except:
    #     query_instance = None
    # try:
    #     prototype_cf = json.loads(request.args.get('prototype', type=None, default=None))
    # except:
    #     prototype_cf = None
    # k = request.args.get('k', default=-1, type=int)
    # cf_num = request.args.get('cf_num', default=1, type=int)
    # try:
    #     filters = json.loads(request.args.get('filters', type=None, default=None))
    # except:
    #     filters = None

    setting = {'index': 0, 'changeable_attribute': 'all', 'filters': [], 'cf_num': 12, 'desired_class': 'opposite'}
    subset_cf = current_app.cf_engine.generate_cfs_from_setting(setting)
    cf_df = subset_cf.get_cf()
    cols = current_app.dataset.get_columns(preprocess=False) + ['Score']
    return jsonify(cf_df[cols].to_dict('record'))
    
