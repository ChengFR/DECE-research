# counterfactuals

## Development


### Server

Install dependencies:

```bash
pip install -r requirements.txt
pip install -r server-requirements.txt
```

Preprocess dataset
```
python data_processing/heloc.py
```

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

Visit `localhost:3000/HELOC` for testing.