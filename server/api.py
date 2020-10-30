import logging

from flask.json import JSONEncoder
from flask import request, jsonify, Blueprint, current_app, Response

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


@api.route('/r_counterfactuals', methods=['POST'])
def get_cf_subset():
    request_params = request.get_json()
    filters = request_params["filters"]
    num_filters = {f["name"]: {"min": f.get("extent", [0, 0])[0],
                               "max": f.get("extent", [0, 0])[1]} for f in filters if
                   current_app.dataset.is_num(f["name"])}
    cat_filters = {f["name"]: {"categories": [str(cat) for cat in f['categories']] if f[
                                                                                          'categories'] is not None else 'all'}
                   for f in filters
                   if not current_app.dataset.is_num(f["name"])}
    filters = {**num_filters, **cat_filters}
    index = current_app.dataset.get_subset(filters=filters).index.tolist()
    r_counterfactuals = current_app.cf_engine.generate_r_counterfactuals(filters, True, True,
                                                                         verbose=True)
    r_counterfactuals_data = [r_counterfactuals.subsets[f].all.values.tolist() for f in
                              current_app.dataset.features]
    return jsonify({'index': index, 'counterfactuals': r_counterfactuals_data})


@api.route('/predict', methods=['POST'])
def predict_instance():
    request_params = request.get_json()
    query_instance = request_params['queryInstance']
    pred = current_app.model.report(x=[query_instance])[current_app.dataset.prediction]
    return str(pred.values[0])


@api.route('/counterfactuals', methods=['GET', 'POST'])
def get_cf_instance():
    request_params = request.get_json()
    X = request_params['queryInstance']
    k = request_params.get('k', -1)
    num = request_params.get('cfNum', 1)
    attr_mask = request_params.get('attrFlex', None)
    if attr_mask is not None:
        changeable_attr = [current_app.dataset.features[i] for i, t in enumerate(attr_mask) if t]
    else:
        changeable_attr = 'all'
    range_list = request_params.get('attrRange', [])
    for r in range_list:
        if 'extent' in r:
            r['min'], r['max'] = r['extent'][0], r['extent'][1]
    cf_range = {r["name"]: {**r} for r in range_list}

    setting = {'changeable_attr': changeable_attr, 'cf_range': cf_range,
               'num': num, 'k': k}

    cfs = current_app.cf_engine.generate_counterfactual_examples([X], setting).all[
        current_app.dataset.features + [current_app.dataset.prediction]]
    return jsonify(cfs.values.tolist())
