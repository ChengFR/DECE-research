# counterfactuals

## Development

### Model

Install dependencies:

```bash
pip install -r requirements.txt
```

Add PYTHONPATH:
```
export PYTHONPATH=`pwd`/cf_ml:$PYTHONPATH
```

Train model:

```
python cf_ml/train.py HELOC MLP
```

### Server

Start server:
```bash
python -m server.cli --debug
```

### Client

Setup:

```bash
cd client
yarn install
```

Start client development server:
```
yarn start
```

Visit `localhost:3000/HELOC/linear` for testing.