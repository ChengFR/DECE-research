import math
import os
import numpy as np
import pandas as pd
from sklearn.model_selection import ShuffleSplit

from counterfactual import linear_explanation, plot_coefficients


dataset = ['HELOC', 'adult'][0]
data_dir = './data/'
cf_data_dir = './output_data/'

if dataset == 'HELOC':
    # FICO case
    # load dataset
    frame = pd.read_csv(os.path.join(data_dir, "HELOC", "heloc_dataset_v1.csv"))
    # partition into train and test
    train = np.arange(frame.shape[0]) % 10 != 0
    test = np.bitwise_not(train)
    # create target binary i.e. {0,1} variable to predict
    target = np.asarray(frame['RiskPerformance'] == 'Good')
    # extract input variables used to make prediction
    inputs = frame[frame.columns[1:]]

elif dataset == 'adult':
    # Adult dataset
    # load dataset
    frame = pd.read_csv(os.path.join(data_dir, 'adult', 'adult_frame.csv'))
    # partition into train and test
    
    train, test = next(ShuffleSplit(
        test_size=0.20, random_state=17).split(frame))
    # create target binary i.e. {0,1} variable to predict
    target = np.asarray(frame['income'] == '>=50k')
    # extract input variables used to make prediction
    inputs = frame[frame.columns[0:8]]

# Create the object and initialise it
exp = linear_explanation()
exp.encode_pandas(inputs)
# train the logistic regression classifier
exp.train_logistic(target[train], train)
# if all the data is to be used for training use
# the following line instead
# exp.train_logistic(target)

if dataset == 'adult':  # Modify the pretty printer for special values.
    exp.special_val = {'workclass': {0: 'Government', -3: 'Other/Unknown', -2: 'Private', -1: 'Self-Employed'},
                       'education': {0: 'Assoc', -7: 'Bachelors', -6: 'Doctorate', -5: 'HS-grad', -4: 'Masters', -3: 'Prof-school', -2: 'School', -1: 'Some-college'},
                       'marital_status': {0: 'Divorced', -4: 'Married', -3: 'Separated', -2: 'Single', -1: 'Widowed'},
                       'occupation': {0: 'Blue-Collar', -5: 'Other/Unknown', -4: 'Professional', -3: 'Sales', -2: 'Service', -1: 'White-Collar'},
                       'race': {0: 'Non-White', -1: 'White'},
                       'gender': {0: 'Female', -1: 'Male'}}
# If dataset is 'Fico' exp.special_value is already correctly set up.
# Note that special values can either be handled differently for each named feature as in the above example or set generically.
# For example, FICO uses
elif dataset == 'HELOC':
    exp.special_val = {-9.0: ",i.e. No Bureau Record or No Investigation,",
                       -8.0: ",i.e. No Usable/Valid Accounts Trades or Inquiries,",
                       -7.0: ",i.e. Condition not Met ,"}
# As the same special values are consistent across all features


i = 409  # Explain 410th test entry
text = exp.explain_entry(inputs.iloc[i].values, 10)
# The explanation is an ordered list of text strings
# print them
for t in text:
    print(t)

# generate a full set of explanations for all data
# explain_all=False
# if explain_all:
#     explanations=exp.explain_set(inputs.values,12)
#     exp2=pd.DataFrame(explanations)
#     exp2.to_csv('test.csv')
# visualise the set of linear weights ordered by their median contribution over the dataset.
# plot_coefficients(exp,med_weight=True)

test_score = exp.output_subset(test)
test_accuracy = np.logical_xor(test_score, target[test]).sum() / len(test)
scores = exp.output_subset([i for i in range(frame.shape[0])])
normed_scores = [1/(math.exp(s)+1) for s in scores]
frame['Score'] = normed_scores
frame.to_csv(os.path.join(cf_data_dir, dataset, 'pred_linear_{:.3f}_{}.csv'.format(test_accuracy, dataset)), index=False)

# explanations = exp.explain_set(inputs.values, 12)
# exp2 = pd.DataFrame(explanations, columns=[
#                     cl.name for cl in exp.cox]+['Score', 'OriginIndex'])
# exp2.to_csv(os.path.join(cf_data_dir, dataset, 'cf_linear_{}.csv'.format(dataset)), index=False)

exit()
