from load_dataset import load_HELOC_dataset
from model_manager import PytorchModelManager
import argparse

parser = argparse.ArgumentParser()
parser.add_argument("dataset", help="Name of the dataset, e.g. HELOC", type=str)
parser.add_argument("model", help="Type of the model, e.g. MLP", type=str)
parser.add_argument("--retrain", help="Whether to retrain the model", default=False)

args = parser.parse_args()

if args.dataset == 'HELOC':
    dataset = load_HELOC_dataset()
else:
    raise NotImplementedError

if args.model == 'MLP':
    mm = PytorchModelManager(dataset)
else:
    raise NotImplementedError

if args.retrain:
    mm.train()
    mm.save_model()
    mm.save_prediction()
else:
    try:
        mm.load_model()
        print("A trained model has already exists. You may set --retrain as True to train the model.")
    except FileNotFoundError:
        mm.train()
        mm.save_model()
        mm.save_prediction()