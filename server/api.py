import io
import os
import logging

from flask.json import JSONEncoder
from flask import request, jsonify, Blueprint, current_app, Response

api = Blueprint('api', __name__)

logger = logging.getLogger('api')

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


@api.route('/data', methods=['GET'])
def get_data():
    # temporary test data
    data_name = request.args.get('dataId', default='HELOC', type=str)
    data_path = os.path.join(current_app.config["DATA_DIR"], data_name, 'data.csv')
    with open(data_path, 'r') as f:
        data = f.read()
    return Response(data, mimetype="text/csv")


@api.route('/data_meta', methods=['GET'])
def get_data_meta():
    # temporary test data
    data_name = request.args.get('dataId', default='HELOC', type=str)
    meta_path = os.path.join(current_app.config["DATA_DIR"], data_name, 'data.meta.json')
    with open(meta_path, 'r') as f:
        data = f.read()
    return Response(data, mimetype="text/json")