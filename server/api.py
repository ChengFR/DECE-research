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

@api.route('/data', methods=['GET'])
def get_data():
    return