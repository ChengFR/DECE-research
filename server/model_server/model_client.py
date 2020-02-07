import zmq
import uuid
from ..helpers import get_logger
from .protocol import ClientCmd


class ModelClient(object):
    def __init__(self, server_addr="tcp://localhost:5559"):
        
        self.context = zmq.Context()
        self.socket = self.context.socket(zmq.REQ)
        self.socket.connect(server_addr)
        self.logger = get_logger('model_client')
        self.request_counter = 0

    def close(self):
        self.socket.close()
        self.context.close()

    def request(self, job_args):
        self.request_counter += 1
        self.logger.info("Sending the request {}".format(self.request_counter))
        self.socket.send_multipart([job_args])

        return self.socket.recv_multipart()

    def counterfactual(self, x):
        result = self.request([ClientCmd.counterfactual, x])
        return result

    def predict(self, x):
        """request the ModelServer instance to predict x
        
        Parameters
        ----------
        x : np.ndarray
            x should be a 2d array with shape (n_instances, n_features)
        """
        result = self.request([ClientCmd.predict, x])
        return result