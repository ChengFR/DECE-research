import os
import argparse
from flask import Flask
from flask_cors import CORS, cross_origin

from .api import api


def create_app(config=None):
    """Create and configure an instance of the Flask application."""
    app = Flask(__name__)

    if config is not None:
        for key, val in config.items():
            app.config[key] = val

    @app.route('/')
    def hello():
        return 'Hello, World!'

    app.register_blueprint(api, url_prefix='/api')
    CORS(app, resources={r"/api/*": {"origins": "*"}})
    return app


def add_arguments_server(parser):

    parser.add_argument('--model_dir', default='.', type=str, help="The path of the model")
    parser.add_argument('--data_dir', default='data/processed', type=str, help="The path of available datasets")
    # API flag
    parser.add_argument('--host', default='0.0.0.0', help='The host to run the server')
    parser.add_argument('--port', default=7777, help='The port to run the server')
    parser.add_argument('--debug', action="store_true", help='Run Flask in debug mode')


def start_server(args):

    app = create_app(dict(DATA_DIR=args.data_dir, MODEL_DIR=args.model_dir))

    app.run(
        debug=args.debug,
        host=args.host,
        port=args.port
    )
