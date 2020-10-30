import logging


def get_logger(name, verbose=False):
    logger = logging.getLogger(name)
    logger.setLevel(logging.DEBUG if verbose else logging.INFO)
    formatter = logging.Formatter(
        '%(levelname)-.1s:' + name + ':[%(filename).3s:%(funcName).3s:%(lineno)3d]:%(message)s',
        datefmt='%m-%d %H:%M:%S')
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.DEBUG if verbose else logging.INFO)
    console_handler.setFormatter(formatter)
    logger.handlers = []
    logger.addHandler(console_handler)
    return logger


def trans_data_meta(data_meta):
    features = data_meta["features"]
    target = data_meta["target"]
    prediction = data_meta["prediction"]
    desc = data_meta["description"]

    return {
        "features": [
            {**desc[f], 
             "name": f, 
             "extent": [desc[f].get("min", 0), desc[f].get("max", 0) + desc[f].get("scale", 0)],
             "precision": desc[f].get("decile", 0)} for f in features],
        "target": {**desc[target], "name": target},
        "prediction": {**desc[target], "name": prediction,
                       "index": desc[target]["index"] + 1}
    }
