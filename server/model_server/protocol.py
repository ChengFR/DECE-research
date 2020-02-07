

class WorkerCmd:
    counterfactual = b'COUNTERFACTUAL'
    predict = b'PREDICT'


class ClientCmd:
    counterfactual = WorkerCmd.counterfactual
    predict = WorkerCmd.predict