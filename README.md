# DECE: decision explorer with counterfactual explanations for machine learning models

![teaser](./doc/teaser.png)



---

# Installation

## Development
**STEP-0: Clone the repository.**

    git clone https://github.com/ChengFR/DECE.git

**STEP-1: Prepare for the environment.**

Prepare for the python enviroment:

    virtualenv $(python3.7) venv/
    source venv/bin/activate
    pip install -r requirements.txt

Prepare for the node.js enviroment:

    cd client/
    npm install

**STEP-2: Add the current path to PYTHONPATH.**

    export PYTHONPATH=`pwd`:$PYTHONPATH

# Usage

## Generate counterfactual explanations 

Please check the tutorial notebooks

## Visualization

### Server

Start server:
```bash
python -m server.cli
```

### Client

Start client development server:
```
cd client/
npm start
```

Visit `localhost:3000/` for testing.

# Cite this work
    @ARTICLE{cheng20dece,
    author={F. {Cheng} and Y. {Ming} and H. {Qu}},
    journal={IEEE Transactions on Visualization and Computer Graphics}, 
    title={DECE: Decision Explorer with Counterfactual Explanations for Machine Learning Models}, 
    year={2020},
    volume={},
    number={},
    pages={1-1},
    doi={10.1109/TVCG.2020.3030342}}