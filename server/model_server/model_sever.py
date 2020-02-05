import threading
import multiprocessing as mp
import zmq


class ModelSever(threading.Thread):

    def __init__(self, args):
        super().__init__()
        self.args = args

    @zmq.decorators.context()
    def run(self):
        pass



class ModelWorker(mp.Process):
    """
    A process that recv jobs and performs the computation
    """
    def __init__(self, model_path):
        super().__init__()
        self.model_path = model_path
        self._model = None

    def run(self):
        from tensorflow import keras
        self._model = keras.models.load_model(self.model_path)

    
