import io
import os
import logging

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
    data_df = current_app.dir_manager.load_prediction('dataset')
    cols = current_app.dataset.get_columns(preprocess=False) + ['Score']
    return Response(data_df[cols].to_csv(index=False), mimetype="text/csv")

@api.route('/cf', methods=['GET'])
def get_cf():
    changeable_attr = request.args.get('changeable_attr', default='all', type=str)
    cf_num = request.args.get('cf_num', default=4, type=int)
    index = request.args.get('index', type=int)
    # start_index = request.args.get('startIndex', type=int)
    # end_index = request.args.get('endIndex', type=int)
    
    # build filters
    filters = []
    desired_class = 'opposite'
    setting = {'changeable_attribute': changeable_attr, 'filters': filters, 'cf_num': cf_num, 'desired_class': desired_class}
    subset_cf = current_app.cf_engine.generate_cfs_from_setting(setting)
    if index is not None:
        cf_df = subset_cf.get_cf_by_origin_index(index)
    else:
        cf_df = subset_cf.get_cf()
    cols = current_app.dataset.get_columns(preprocess=False) + ['Score', 'OriginIndex']
    cf_dict = group_cf(cf_df[cols])[index]
    return jsonify(cf_dict)
# @api.route('/cf_meta', methods=['GET'])
# def get_cf_meta():
#     # temporary test data
#     data_name = request.args.get('dataId', default='HELOC', type=str)
#     model_name = request.args.get('modelId', default='linear', type=str)
#     meta_path = os.path.join(get_data_dir(
#         data_name, model_name), 'cf.meta.json')
#     with open(meta_path, 'r') as f:
#         data = f.read()
#     return Response(data, mimetype="text/json")


# @api.route('/cf', methods=['GET', 'POST'])
# def get_cf():

#     data_name = request.args.get('dataId', default='HELOC', type=str)
#     model_name = request.args.get('modelId', default=None)
#     if model_name is None:
#         raise ApiError("A modelId parameter should be supplied", 400)
    
#     data_dir = get_data_dir(data_name, model_name)
#     if request.method == 'POST':
#         raise ApiError("POST method handling not implemented", 400)
#     else:
#         index = request.args.get('index', type=int)
#         start_index = request.args.get('startIndex', type=int)
#         stop_index = request.args.get('stopIndex', type=int)

#         if index is not None:
#             return get_cf_by_index(data_dir, index)

#         elif start_index is not None and stop_index is not None:
#             return jsonify([
#                 get_cf_by_index(data_dir, idx)
#                 for idx in range(start_index, stop_index)
#             ])
#         else:
#             # return jsonify(get_cf_all(data_dir))
#             raise ApiError(
#                 "A index or indexRange parameter should be supplied if using GET method", 400)

# @api.route('/cf', methods=['GET', 'POST'])
# def get_cf():

#     if request.method == 'POST':
#         raise ApiError("POST method handling not implemented", 400)
#     else:
#         index = request.args.get('index', type=int)
#         start_index = request.args.get('startIndex', type=int)
#         stop_index = request.args.get('stopIndex', type=int)

#         if index is not None:
#             return current_app.dataset.get_instance(index).data

#         elif start_index is not None and stop_index is not None:
#             return jsonify([
#                 get_cf_by_index(data_dir, idx)
#                 for idx in range(start_index, stop_index)
#             ])
#         else:
#             # return jsonify(get_cf_all(data_dir))
#             raise ApiError(
#                 "A index or indexRange parameter should be supplied if using GET method", 400)
