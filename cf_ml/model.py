import os
import numpy as np
import pandas as pd 

from tensorflow import keras
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import Dense, Dropout

class MLPConfig():
    """A class of MLP configuration"""

    def __init__(self, shape=[23, 64, 32, 1], loss="binary_crossentropy", optimizer="rmsprop", metrics=['accuracy']):
        self._shape = shape
        self._loss = loss
        self._metrics = metrics
        self._optimizer = optimizer

    @property
    def shape(self):
        return self._shape

    @property
    def loss(self):
        return self._loss

    @property
    def optimizer(self):
        return self._optimizer

    @property
    def metrics(self):
        return self._metrics

    def __str__(self):
        return '_'.join(['_'.join([str(d) for d in self.shape]), self.optimizer, self.loss])


class TensorflowModel():
    """A class of keras (tensorflow) MLP model."""
    
    def __init__(self, config=MLPConfig()):
        self._config = config
        self._model = Sequential()
        shape = self._config.shape
        loss = self._config.loss
        optimizer = self._config.optimizer
        metrics = self._config.metrics
        if len(shape) < 2:
            raise ValueError("The MLP model should have at least one layer")
        elif len(shape) == 2:
            self._model.add(Dense(shape[1], input_dim=shape[0], activation='sigmoid'))
        elif len(shape) > 2:
            self._model.add(Dense(shape[1], input_dim=shape[0], activation='relu'))
            self._model.add(Dropout(0.5))
            for dim in shape[2:-1]:
                self._model.add(Dense(dim, activation='relu'))
                self._model.add(Dropout(0.5))
            self._model.add(Dense(shape[-1], activation='sigmoid'))
        self._model.compile(loss=loss, optimizer=optimizer, metrics=metrics)
        
    def load_model(self, path):
        self._model = keras.models.load_model(path)

    def save_model(self, path=''):
        keras.models.save_model(self._model, path)

    def train(self, x_train, y_train, epochs=40, batch_size=16):
        self._model.fit(x_train, y_train, epochs=epochs, batch_size=batch_size)

    def evaluate(self, x_test, y_test, batch_size=128):
        return self._model.evaluate(x_test, y_test, batch_size=batch_size)

    def get_output(self, input_tensor):
        return self._model(input_tensor)


if __name__ == '__main__':
    pass