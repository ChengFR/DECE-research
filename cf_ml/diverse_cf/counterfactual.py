#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Created on Tue Aug 28 14:24:01 2018

@author: chrisr
"""
import numpy as np
import math
from types import SimpleNamespace
import sklearn.linear_model as skl
import gurobipy as gb
gb.setParam('OutputFlag', 0)


class linear_explanation:
    def __init__(self):
        return None

    def encode_pandas(self, inputs):
        """Build a training set of dummy encoded variables from existing input data"""
        self.cox = np.empty(inputs.columns.size, dtype=np.object)
        self.constraints = np.empty_like(self.cox)
        for i in range(inputs.columns.shape[0]):
            col = inputs[inputs.columns[i]]
            vals = np.minimum(col, 0)
            normal = col[(col >= 0)]
            scale = normal.max()
            if scale == 0 or np.isnan(scale):
                scale = 1
            normal /= scale
            un = np.unique(vals)
            un = un[un != 0]
            tab = np.zeros((un.shape[0]+1, vals.shape[0]))
            tab[0] = np.maximum(col/scale, 0)
            med = np.empty(un.shape[0]+1)
            MAD = np.empty_like(med)
            med[0] = np.median(normal)
            if np.isnan(med[0]):
                med[0] = 1
            MAD[0] = np.median(np.abs(normal-med[0]))
            if MAD[0] == 0:
                MAD[0] = 1.48 * np.std(normal)
            if not(MAD[0] > 0):
                MAD[0] == 1
            if np.isnan(MAD[0]):
                MAD[0] = 1
            tab[0, np.isnan(tab[0])] = 1
            MAD[0] = max(1e-4, MAD[0])
            #print (MAD[0])
            j = 1
            for u in un:
                tab[j] = (col == u)
                med[j] = np.mean(tab[j])
                MAD[j] = 1.48*np.std(tab[j])  # Should be median
                if not(MAD[j] > 0):
                    MAD[j] == 1e-4
                j += 1
            self.cox[i] = SimpleNamespace(name=inputs.columns[i], total=tab,  # normal=normal,
                                          med=med, MAD=1.0/MAD, unique=un, scale=scale)
        self.encoded = np.vstack(map(lambda x: x.total, self.cox)).T

    def train_logistic(self, target, subset=False):
        """Use optional subset vector to indicate which values correspond to
        the target labels"""
        lr = skl.logistic.LogisticRegressionCV(solver='sag')
        if subset is not False:
            self.model = lr.fit(self.encoded[subset], target)
        else:
            self.model = lr.fit(self.encoded, target)

    def output(self, datum):
        """Provides a model prediction for a provided datum"""
        # datum=self.recover_all_stack(datum.values)
        datum = datum.reshape(1, -1)
        return self.model.decision_function(datum)

    def output_subset(self, subset):
        """provides a model prediction for a subset of the existing data"""
        return self.model.decision_function(self.encoded[subset])

    def build_structure(self):
        """build the Core programme of the model that induces
        counterfactuals for the datapoint test_entry"""
        test_entry = self.short_factual
        self.counterfactual = gb.Model()
        self.direction = np.sign(self.output(self.long_factual)) * -1
        # constant=0
        # Build  polytope
        # Normalise test_entry
        test_entry = np.asarray(test_entry, dtype=np.float).copy()
        # for i in range(self.cox.shape[0]):
        #   if test_entry[i]>=0:
        #       test_entry[i]/=self.cox[i].scale

        decision = self.model.intercept_[0]
        # entries
        stack = self.model.coef_[0]

        self.var = np.empty(self.cox.shape[0], dtype=np.object)
        for i in range(self.cox.shape[0]):
            v = test_entry[i]
            c = self.cox[i]
            d_count = c.med.shape[0]
            sign = np.ones(d_count)
            if v < 0:
                index = (c.unique == v).argmax()
                sign[index+1] = -1
                v = c.med[0]
            sign[0] = 0
            dc = np.asarray((v, 1-v))
            cvar = self.counterfactual.addVars(2, lb=0, ub=dc, obj=c.MAD[0])
            cvar = np.asarray(cvar.values())
            dvar = self.counterfactual.addVars(d_count, lb=0, ub=1, obj=sign*c.MAD,
                                               vtype=gb.GRB.BINARY)
            dvar = np.asarray(dvar.values())
            self.counterfactual.addConstr(dvar.sum() == 1)
            if v == 0:
                self.counterfactual.addConstr(cvar[1] <= dvar[0])
            elif v == 1:
                self.counterfactual.addConstr(cvar[0] <= dvar[0])
            else:
                self.counterfactual.addConstr(
                    cvar[0]/dc[0]+cvar[1]/dc[1] <= dvar[0])

            self.counterfactual.update()

            decision += stack[0]*(v*dvar[0]-cvar[0]+cvar[1])
            if d_count > 1:
                decision += (stack[1:d_count]).dot(dvar[1:])
            stack = stack[c.MAD.shape[0]:]
            self.var[i] = SimpleNamespace(
                cvar=cvar, dvar=dvar, val=v, unique=c.unique)

        # D=self.counterfactual.addVar(-10,10,0,vtype=gb.GRB.CONTINUOUS)
        self.counterfactual.addConstr(decision*self.direction >= 0)
        self.counterfactual.setObjective(
            self.counterfactual.getObjective(), gb.GRB.MINIMIZE)
        self.counterfactual.optimize()

    def add_fico_constraints(self):
        # TODO:
        """It turns out that there are implicit constraints hidden in the fico
        variable names
        in particular if 'NumTrades60Ever2DerogPubRec' and 'NumTrades90Ever2DerogPubRec'
        are both non-negative the first term is always smaller than or equal to
        the second similarly:
        'NumInqLast6M' > 'NumInqLast6Mexcl7days'
        and MSinceMostRecentTradeOpen > AverageMInFile
        Although 
        'MaxDelq2PublicRecLast12M' < 'MaxDelqEver'
        there are 7 points that violate this.
        2 MSinceMostRecentTradeOpen (True, False, False)
        5 NumTrades60Ever2DerogPubRec (False, False, True)

        9 MaxDelq2PublicRecLast12M (False, False, False)

        15 NumInqLast6M (False, False, True)

        21 NumBank2NatlTradesWHighUtilization (True, False, False)
        """

    def set_factual(self, factual):
        self.long_factual = self.mixed_encode(factual)
        self.short_factual = factual.copy().astype(np.float)
        for i in range(factual.size):
            if factual[i] > 0:
                self.short_factual[i] /= self.cox[i].scale

    "Helper functions"

    def mixed_encode(self, test_eg):
        out = np.zeros(self.encoded.shape[1])
        index = 0
        for i in range(self.cox.shape[0]):
            c = self.cox[i]
            if test_eg[i] < 0:
                ind = (c.unique == test_eg[i]).argmax()
                out[ind+index+1] = 1
            else:
                out[index] = test_eg[i]/c.scale
            index += c.unique.size+1
        return out

    def recover_val(self, element):
        #print (np.asarray(list(map(lambda x:x.X, element.dvar))))
        dval = np.asarray(list(map(lambda x: x.X, element.dvar)))
        #print (dval)
        dvar = np.argmax(dval)
        assert(np.abs(1-dval.sum()) < 10**-4)
        cvar = element.cvar
        if dvar == 0:
            return element.val-cvar[0].X+cvar[1].X
        assert(np.abs(cvar[0].X+cvar[1].X) < 10**-4)

        return element.unique[dvar-1]

    def recover_all_val(self, var):
        return np.asarray(list(map(self.recover_val, var)))

    def recover_stack(self, element):
        dval = np.asarray(list(map(lambda x: x.X, element.dvar)))
        out = dval.copy()
        dvar = np.argmax(dval)
        assert(np.abs(1-dval.sum()) < 10**-4)
        cvar = element.cvar
        if dvar == 0:
            out[0] = element.val-cvar[0].X+cvar[1].X
        return out

    def recover_all_stack(self, var):
        return np.hstack(list(map(self.recover_stack, var)))

    "Textual output helpers"

    special_val = {-9.0: ",i.e. No Bureau Record or No Investigation,",
                   -8.0: ",i.e. No Usable/Valid Accounts Trades or Inquiries,",
                   -7.0: ",i.e. Condition not Met ,"}

    def denorm(self, x, other, i):
        spec = self.special_val
        if x < 1e-5:
            return x
        # out="%1.1f"%(x*self.cox[i].scale)
        # Todo implement rounding up/down  correctly
        if (x-other < 0):
            return np.floor(x*self.cox[i].scale)
        else:
            return np.ceil(x*self.cox[i].scale)

    def pp(self, x, other, i):
        """pretty printer helper, returns string of negative integer if x<0
            string of floating point value otherwise."""
        spec = self.special_val
        if x < 1e-5:
            return (" %d " % x)+spec.get(self.cox[i].name, spec).get(x, '')
        # out="%1.1f"%(x*self.cox[i].scale)
        # Todo implement rounding up/down  correctly
        if (x-other < 0):
            return "%d" % (np.floor(x*self.cox[i].scale))
        return "%d" % (np.ceil(x*self.cox[i].scale))

    def explain(self, header, cf, labels=("'good'", "'bad'"), in_text=False):
        test_entry = self.short_factual
        #direction=np.sign(self.evaluate(self.long_factual)) *-1
        actual_score = labels[int(self.direction > 0)]
        cf_score = labels[int(not(self.direction > 0))]
        out = cf
        mask = np.abs(out - test_entry) > 0.001
        if in_text:
            if header:
                explain = ("You got score " + actual_score
                        + ".\n One way you could have got score "
                        + cf_score+" instead is if:\n")
            else:
                explain = ("Another way you could have got score "
                        + cf_score+" instead is if:\n")
            e = ""
            for i in range(mask.size):
                if mask[i]:
                    e += ("  "+self.cox[i].name + " had taken value "
                        + self.pp(out[i], test_entry[i], i)+" rather than "
                        + self.pp(test_entry[i], out[i], i) + ";\n")
            explain += e[:-2]
        else:
            denormed_out = [self.denorm(feature, test_entry[i], i) for i, feature in enumerate(out)]
            score = self.output(self.mixed_encode(np.array(denormed_out)))[0]
            explain = denormed_out + [1/(math.exp(score)+1)]
        return explain

    def fix_values(self, cf):
        """Clamp new values and rewind if unsatisfiable"""
        out = cf
        test_entry = self.short_factual
        mask = np.abs(out - test_entry) > 0.001
        #print (mask)
        for i in range(mask.size):
            new_const = list()
            if mask[i]:
                #print (i)
                if out[i] < 0:
                    v = self.var[i].dvar
                    index = (self.cox[i].unique == out[i]).argmax()+1
                    new_const.append(
                        self.counterfactual.addConstr(v[index] == 0))
                else:
                    if test_entry[i] < 0:
                        index = 0
                        v = self.var[i].dvar
                        new_const.append(
                            self.counterfactual.addConstr(v[index] == 1))
                    else:
                        v = self.var[i].cvar
                        new_const.append(
                            self.counterfactual.addConstr(v[0] == 0))
                        new_const.append(
                            self.counterfactual.addConstr(v[1] == 0))
                self.counterfactual.update()
                self.counterfactual.optimize()
                if self.counterfactual.Status == 3:
                    for v in new_const:
                        self.counterfactual.remove(v)
                    self.counterfactual.update()
                    self.counterfactual.optimize()

    def give_explanation(self, upto=10, labels=("'good'", "'bad'"), in_text=False):
        """Warning destructive operation. Has different output if rerun without
        rebuilding build_structure.

        However, it can be called repeatedly without rebuilding to generate new
        explanations each time.
        Returns a text string containing upto *upto* different counterfactuals"""
        assert(upto >= 1)

        full_exp = list()
        # full_exp+='\n-----\n'
        for i in range(upto):
            out = self.recover_all_val(self.var)
            if i > 0 and np.all(out == old_out):
                break
            full_exp.append(self.explain(i==0, out, labels, in_text=in_text))
            old_out = out
            self.fix_values(out)
        return full_exp

    def explain_entry(self, entry, upto=10, labels=("'good'", "'bad'"), in_text=False):
        self.set_factual(entry)
        self.build_structure()
        explain = self.give_explanation(upto, labels, in_text=in_text)
        return explain

    def explain_set(self, entries, upto=10, in_text=False):
        if in_text:
            out = np.empty((entries.shape[0], upto), dtype=np.object)
            for i in range(entries.shape[0]):
                tmp = np.hstack(self.explain_entry(entries[i], upto))
                out[i, :tmp.shape[0]] = tmp
        else:
            # out = np.array(self.explain_entry(entries[0], upto), dtype=np.int32)
            out = np.array(self.explain_entry(entries[0], upto))
            out = np.concatenate((out, np.full((out.shape[0], 1), 0)), axis=1)
            for i in range(1, entries.shape[0]):
                # tmp = np.array(self.explain_entry(entries[i], upto), dtype=np.int32)
                tmp = np.array(self.explain_entry(entries[i], upto))
                tmp = np.concatenate((tmp, np.full((tmp.shape[0], 1), i)), axis=1)
                out = np.concatenate((out, tmp), axis=0)
        return out


def check_internal(a, b):
    gt = (frame[a] >= 0) & (frame[b] >= 0)
    return np.vstack((frame[a], frame[b])).T[gt]


def check(a, b):
    out = check_internal(a, b)
    return (np.all(out[:, 0] <= out[:, 1]),
            np.all(out[:, 0] == out[:, 1]),
            np.all(out[:, 0] >= out[:, 1]))


def array_of_coefficient_names(self):
    out = list()
    for i in range(self.cox.shape[0]):
        out.append(self.cox[i].name)
        for j in (self.cox[i].unique):
            out.append(self.cox[i].name+' '+str(j))

    medians = np.median(self.encoded, 0)
    recalc = (medians == 0)
    medians[recalc] = np.mean(self.encoded, 0)[recalc]
    return np.asarray(out), np.asarray(medians)


def plot_coefficients(exp, filename='out.png', med_weight=False):
    import matplotlib.pyplot as plt
    bias = exp.model.intercept_[0]
    coef = exp.model.coef_[0]
    names, med = array_of_coefficient_names(exp)
    if med_weight:
        order = np.argsort(np.abs(coef*med))[::-1]
    else:
        order = np.argsort(np.abs(coef))[::-1]
    y_pos = np.arange(1+coef.shape[0])
    plt.rcdefaults()
    width = 8
    height = 12

    fig, ax = plt.subplots(figsize=(width, height))
    ax.barh(y_pos, np.hstack((bias, coef[order])), align='center',
            color='green')
    ax.set_yticks(y_pos)
    ax.set_yticklabels(np.hstack(('Bias', names[order])))
    ax.invert_yaxis()  # labels read top-to-bottom
    ax.set_xlabel('Magnitude ')
    # ax.set_xscale('symlog')
    ax.set_title('Variable Weights')
    plt.savefig(filename)
    plt.show()
