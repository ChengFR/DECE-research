import * as React from 'react';
import * as _ from "lodash";
import memoizeOne from "memoize-one";


import { shallowCompare, number2string, decile2precision, assert } from '../../common/utils';
import { IMargin, defaultCategoricalColor } from '../visualization/common';
import Histogram, {  } from '../visualization/histogram';
import { CFNumericalColumn, CFCategoricalColumn, getRowLabels, getAllRowLabels, filterUndefined, CFTableColumn, isNumericalCFColumn } from './common';
import BarChart from '../visualization/barchart';
import { TableColumn, isNumericalVColumn } from '../Table/common';
import { ColumnSizer } from 'react-virtualized';

