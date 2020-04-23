import os
import argparse
from flask import Flask, send_from_directory, safe_join
from flask_cors import CORS, cross_origin

from .api import api
from .page import page

from cf_ml.load_dataset import load_HELOC_dataset, load_diabetes_dataset, load_simplified_german_credit_dataset, load_admission_dataset
from cf_ml.model_manager import PytorchModelManager
from cf_ml.cf_engine.engine import CFEnginePytorch

SERVER_ROOT = os.path.dirname(os.path.abspath(os.path.join(__file__, '..')))
CLIENT_ROOT = os.path.join(SERVER_ROOT, 'client/build')
STATIC_FOLDER = os.path.join(CLIENT_ROOT, 'static')


def create_app(config=None):
    """Create and configure an instance of the Flask application."""
    app = Flask(__name__, static_folder=CLIENT_ROOT)

    if config is not None:
        for key, val in config.items():
            app.config[key] = val

    # load dataset -- a tmp implementation
    if app.config['DATASET'] == 'HELOC':
        app.dataset = load_HELOC_dataset()
    elif app.config['DATASET'] == 'diabetes':
        app.dataset = load_diabetes_dataset()
    elif app.config['DATASET'] == 'german-credit':
        app.dataset = load_simplified_german_credit_dataset()
    elif app.config['DATASET'] == 'admission':
        app.dataset = load_admission_dataset()
    

    # load model -- a tmp implemenation
    # if app.config['MODEL'] == 'MLP':
    app.model = PytorchModelManager(app.dataset, model_name=app.config['MODEL'])
    app.dir_manager = app.model.get_dir_manager()
    try:
        app.model.load_model()
    except FileNotFoundError:
        app.model.train()
        app.model.save_model()
    # else:
    #     raise NotImplementedError
    app.model.save_prediction()

    # init engine
    app.cf_engine = CFEnginePytorch(app.model, app.dataset)

    app.register_blueprint(page)
    app.register_blueprint(api, url_prefix='/api')
    CORS(app, resources={r"/api/*": {"origins": "*"}})
    return app


def add_arguments_server(parser):

    # parser.add_argument('--model_dir', default='.', type=str, help="The path of the model")
    # parser.add_argument('--data_dir', default='data/processed', type=str, help="The path of available datasets")
    # parser.add_argument('--data_dir', default='data/processed', type=str, help="The path of the raw data")
    parser.add_argument('--output_dir', default='./output', type=str, help="The path of the model")
    parser.add_argument('--dataset', default='HELOC', type=str, help="The name of the dataset")
    parser.add_argument('--model', default='MLP', type=str, help="The name of the model")
    # API flag
    parser.add_argument('--host', default='0.0.0.0', help='The host to run the server')
    parser.add_argument('--port', default=7777, help='The port to run the server')
    parser.add_argument('--debug', action="store_true", help='Run Flask in debug mode')


def start_server(args):

    app = create_app(dict(DATASET=args.dataset, MODEL=args.model, OUTPUT_DIR=args.output_dir, STATIC_FOLDER=STATIC_FOLDER))

    app.run(
        debug=args.debug,
        host=args.host,
        port=args.port
    )
