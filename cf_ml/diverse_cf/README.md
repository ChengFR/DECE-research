# Diverse Coherent Explanations

This code is an implementation of the paper "Efficient Search for Diverse
Coherent Explanations". 
https://arxiv.org/pdf/1901.04909.pdf 

By default it makes use of the adult dataset (included). 
To run the FICO experiments in the paper, it requires a copy of the
FICO data taken from:
https://community.fico.com/s/explainable-machine-learning-challenge?&tabset-3158a=2

It also uses the gurobi solver http://www.gurobi.com/ for the MIP solver. 

The code explicitly targets the FICO dataset and has made a couple of simple
assumptions as to the form the dataset takes. Each variable is assumed to take a
range of continuous values and a set of discrete values; as simplifying
assumptions we assume that all strictly negative values are the discrete values,
while the continuous values are the non-negative ones.

If you wish to add an entirely discrete variable i.e. without a continious range
included, these variables should be indexed from zero. For example,
in the adult dataset the 'workclass' variable takes the following values.
{0: 'Government', -3: 'Other/Unknown', -2: 'Private', -1: 'Self-Employed'}

If this is not the case for your dataset, the code can be adapted to match
assumptions, but it probably easier to manipulate the data so that it follows
these assumptions -- this manipulation has already been done for the adult 
dataset.

The code counterfactual.py is a library that implements an object based
interface at over the code. 

example.py is a commented demo that learns a logistic regression classifier 
over datasets using the encoding described in the original paper, and then 
generates counterfactual explanations.

Thanks to Ramaravind Mothilal for helping with the adult demo.



