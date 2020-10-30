import logging

from flask import Blueprint, send_from_directory, safe_join, current_app as app

page = Blueprint('page', __name__)

logger = logging.getLogger('page')


@page.route('/')
def hello():
    return 'Hello, World!'


@page.route('/static/js/<path:path>')
def send_js(path):
    return send_from_directory(safe_join(app.config['STATIC_FOLDER'], 'js'), path)


@page.route('/static/css/<path:path>')
def send_css(path):
    return send_from_directory(safe_join(app.config['STATIC_FOLDER'], 'css'), path)


@page.route('/static/fonts/<path:path>')
def send_fonts(path):
    return send_from_directory(safe_join(app.config['STATIC_FOLDER'], 'fonts'), path)


@page.route('/')
@page.route('/<data_id>')
@page.route('/<data_id>/<model_id>')
def index(data_id=None, model_id=None):
    # return send_from_directory(app.config['CLIENT_ROOT'], 'index.html')
    return app.send_static_file('index.html')
