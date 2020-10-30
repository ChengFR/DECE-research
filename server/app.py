import os
from flask import Flask
from flask_cors import CORS

from .api import api
from .page import page

from cf_ml.dataset import load_diabetes_dataset, load_german_credit_dataset
from cf_ml.model import PytorchModelManager
from cf_ml.cf_engine.engine import CFEnginePytorch

SERVER_ROOT = os.path.dirname(os.path.abspath(os.path.join(__file__, '..')))
OUTPUT_DIR = os.path.join(SERVER_ROOT, 'client/output')
CLIENT_ROOT = os.path.join(SERVER_ROOT, 'client/build')
STATIC_FOLDER = os.path.join(CLIENT_ROOT, 'static')


def create_app(config=None):
    """Create and configure an instance of the Flask application."""
    app = Flask(__name__, static_folder=CLIENT_ROOT)

    if config is not None:
        for key, val in config.items():
            app.config[key] = val

    # load dataset
    if app.config['DATASET'] == 'diabetes':
        app.dataset = load_diabetes_dataset()
    elif app.config['DATASET'] == 'german-credit':
        app.dataset = load_german_credit_dataset()
    else:
        raise NotImplementedError

    # load model
    app.model = PytorchModelManager(app.dataset, model_name=app.config['MODEL'])
    app.dir_manager = app.model.dir_manager
    try:
        app.model.load_model()
    except FileNotFoundError:
        app.model.train()
        app.model.save_model()

    app.model.save_reports()
    app.dir_manager.clean_subset_cache()

    # init engine
    app.cf_engine = CFEnginePytorch(app.dataset, app.model)

    app.register_blueprint(page)
    app.register_blueprint(api, url_prefix='/api')
    CORS(app, resources={r"/api/*": {"origins": "*"}})
    return app


def add_arguments_server(parser):
    # Dataset and target model
    parser.add_argument('--dataset', default='diabetes', type=str, help="The name of the dataset")
    parser.add_argument('--model', default='MLP', type=str, help="The name of the model")

    # API flag
    parser.add_argument('--host', default='0.0.0.0', help='The host to run the server')
    parser.add_argument('--port', default=7777, help='The port to run the server')
    parser.add_argument('--debug', action="store_true", help='Run Flask in debug mode')


def start_server(args):
    app = create_app(dict(DATASET=args.dataset, MODEL=args.model, OUTPUT_DIR=OUTPUT_DIR,
                          STATIC_FOLDER=STATIC_FOLDER))

    app.run(
        debug=args.debug,
        host=args.host,
        port=args.port
    )
