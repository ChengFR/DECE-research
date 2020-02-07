import threading
import multiprocessing as mp
import zmq
import zmq.decorators as zmqd
import pickle

from ..helpers import get_logger

from .model_helpers import load_model
from .protocol import WorkerCmd

class ModelSever(threading.Thread):

    def __init__(self, frontend_addr="tcp://*:5559", backend_addr="tcp://*:5560"):
        super().__init__()
        self.frontend_addr = frontend_addr
        self.backend_addr = backend_addr
        self.workers = []


    def close(self):
        pass

    def run(self):
        self._run()

    @zmqd.context()
    @zmqd.socket(zmq.ROUTER)
    @zmqd.socket(zmq.DEALER)
    def _run(self, ctx, frontend, backend):
        # Socket facing clients
        frontend.bind(self.frontend_addr)

        # Socket facing services
        backend.bind(self.backend_addr)
        
        # Initialize poll set
        poller = zmq.Poller()
        poller.register(frontend, zmq.POLLIN)
        poller.register(backend, zmq.POLLIN)

        # Switch messages between sockets
        while True:
            socks = dict(poller.poll())

            if socks.get(frontend) == zmq.POLLIN:
                message = frontend.recv_multipart()
                backend.send_multipart(message)

            if socks.get(backend) == zmq.POLLIN:
                message = backend.recv_multipart()
                frontend.send_multipart(message)


class ModelWorker(mp.Process):
    """
    A process that recv jobs and performs the computation
    """
    def __init__(self, worker_id, model_path, addr, args):
        super().__init__()
        self.worker_id = worker_id
        self.model_path = model_path
        self._model = None
        self.addr = addr

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
    @zmqd.socket(zmq.REP)
    def _run(self, _, socket):

        # load model
        self._model = load_model(self.model_path)

        # connect sockets
        socket.connect(self.addr)
        self.is_ready.set()

        while not self.should_exit.is_set():
            try:
                job_id, job_args = socket.recv_serialized(self.deserialize)
                result = self.work(job_args)
                socket.send_serialized([job_id, result], self.serialize)
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
