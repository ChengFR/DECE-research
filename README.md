# counterfactuals

## Development


### Server

Install dependencies:

```bash
pip install -r requirements.txt
```

Preprocess dataset
```
python -m data_processing.heloc
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

Visit `localhost:3000/HELOC/linear` for testing.