import io
import os
import logging

from flask.json import JSONEncoder
from flask import request, jsonify, Blueprint, current_app, Response

from .cf_helpers import get_cf_by_index

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


@api.route('/data', methods=['GET'])
def get_data():
    # temporary test data
    data_name = request.args.get('dataId', default='HELOC', type=str)
    model_name = request.args.get('modelId', default=None)
    data_path = os.path.join(get_data_dir(data_name, model_name), 'data.csv')
    with open(data_path, 'r') as f:
        data = f.read()
    return Response(data, mimetype="text/csv")


@api.route('/data_meta', methods=['GET'])
def get_data_meta():
    # temporary test data
    data_name = request.args.get('dataId', default='HELOC', type=str)
    model_name = request.args.get('modelId', default=None)
    meta_path = os.path.join(get_data_dir(
        data_name, model_name), 'data.meta.json')
    with open(meta_path, 'r') as f:
        data = f.read()
    return Response(data, mimetype="text/json")


@api.route('/cf', methods=['GET', 'POST'])
def get_cf():

    data_name = request.args.get('dataId', default='HELOC', type=str)
    model_name = request.args.get('modelId', default=None)
    if model_name is None:
        raise ApiError("A modelId parameter should be supplied", 400)

    if request.method == 'POST':
        raise ApiError("POST method handling not implemented", 400)
    else:
        index = request.args.get('index', type=int)
        index_range = request.args.getlist('indexRange', type=int)
        if index is not None:
            return get_cf_by_index(get_data_dir(data_name, model_name), index)

        elif index_range is not None:
            if len(index_range) != 2 or index_range[0] >= index_range[1]:
                raise ApiError(
                    "Get 'indexRange' as {}. "
                    "'indexRange' has to be a list of two integers [a, b] and a < b!".format(index_range))
            return jsonify([
                get_cf_by_index(get_data_dir(data_name, model_name), idx)
                for idx in range(index_range[0], index_range[1])
            ])
        else:
            raise ApiError(
                "A index or indexRange parameter should be supplied if using GET method", 400)
