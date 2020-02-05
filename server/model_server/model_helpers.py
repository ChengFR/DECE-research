def load_model(model_path):
    from tensorflow import keras

    return keras.models.load_model(model_path)