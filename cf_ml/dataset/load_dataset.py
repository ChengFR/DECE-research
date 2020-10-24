import os

import pandas as pd

from cf_ml.dataset import Dataset

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'sample_data')

def load_german_credit_dataset():
    description = pd.read_csv(os.path.join(DATA_DIR, 'german-credit/description.csv'),
                              index_col='name').to_dict('index')
    data_df = pd.read_csv(os.path.join(DATA_DIR, 'german-credit/refined.csv'))
    description['Job']['category'] = [0, 1, 2, 3]
    description['Housing']['category'] = ['free', 'rent', 'own']
    description['Saving accounts']['category'] = ['unknown', 'little', 'moderate', 'rich', 'quite rich']
    return Dataset('german-credit-simplified', data_df, description, 'Risk')


def load_diabetes_dataset():
    data_df = pd.read_csv(os.path.join(DATA_DIR, 'diabetes/diabetes.csv'))
    description = pd.read_csv(os.path.join(DATA_DIR, 'diabetes/description.csv'), index_col='name').to_dict('index')
    for _, info in description.items():
        if type(info['category']) is str:
            info['category'] = info['category'].split(' ')
    return Dataset('diabetes', data_df, description, 'Outcome')


def load_admission_dataset():
    data_df = pd.read_csv(os.path.join(DATA_DIR, 'admission/admission.csv'))
    description_df = pd.read_csv(os.path.join(DATA_DIR, 'admission/description.csv'), index_col='name')
    description = {name: {k: v for k,v in info.items() if pd.notnull(v)} for name, info in description_df.to_dict('index').items()}
    for name, info in description.items():
        if info['type'] == 'categorical':
            if name == 'Admit':
                info['category'] = info['category'].split(' ')
            else:
                info['category'] = [int(cat) for cat in info['category'].split(' ')]
    return Dataset('admission', data_df[list(description.keys())], description, 'Admit')
