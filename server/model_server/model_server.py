import threading
import multiprocessing as mp
import zmq
import zmq.decorators as zmqd
import pickle

from .model_helpers import load_model
from ..helpers import get_logger


class ModelSever(threading.Thread):

    def __init__(self, args):
        super().__init__()
        self.args = args

    @zmq.decorators.context()
    def run(self):
        pass


class WorkerCmd:
    counterfactual = b'COUNTERFACTUAL'
    predict = b'PREDICT'


class ModelWorker(mp.Process):
    """
    A process that recv jobs and performs the computation
    """
    def __init__(self, worker_id, model_path, recv_addr, send_addr, args):
        super().__init__()
        self.worker_id = worker_id
        self.model_path = model_path
        self._model = None
        self.recv_addr = recv_addr
        self.send_addr = send_addr

        self.logger = get_logger('WORKER-{}'.format(worker_id), args.verbose)
        self.should_exit = mp.Event()
        self.is_ready = mp.Event()
        self.serialize = pickle.dumps
        self.deserialize = pickle.loads


    def close(self):
        self.logger.info('shutting down...')
        self.should_exit.set()
        self.is_ready.clear()
        self.terminate()
        self.join()
        self.logger.info('terminated!')

    def run(self):
        self._run()

    @zmqd.context()
    @zmqd.socket(zmq.PULL)
    @zmqd.socket(zmq.PUSH)
    def _run(self, _, recv_socket, send_socket):

        # load model
        self._model = load_model(self.model_path)

        # connect sockets
        recv_socket.connect(self.recv_addr)
        send_socket.connect(self.send_addr)
        self.is_ready.set()

        while not self.should_exit.is_set():
            try:
                job_id, job_args = recv_socket.recv_serialized(self.deserialize)
                result = self.work(job_args)
                send_socket.send_serialized([job_id, result], self.serialize)
            except:
                pass
            else:
                pass
        
    def work(self, args):
        if args[0] == WorkerCmd.counterfactual:
            # compute counterfactual
            return self._counterfactual(*args[1:])
        elif args[1] == WorkerCmd.predict:
            return self._predict(*args)
        
    def _counterfactual(self, ):
        pass

    def _predict(self, x):
        return self._model.predict(x)
