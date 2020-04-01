import * as _ from "lodash";
import {
  TableColumn,
  CategoricalColumn,
  NumericalColumn
} from "../Table/common";
import DataFrame from "../../data/data_table";
import { assert } from "../../common/utils";
import { isColumnNumerical, Series } from '../../data/column';
import { isNumericalVColumn } from '../Table/common';

import { isArray } from "util";
import memoize from 'fast-memoize';
import { DataMeta } from "data";
import { Filter } from "api";

interface CFColumn {}

// export interface SubsetCFCategoricalColum extends CFCategoricalColumn {
//   valid?: boolean[];
// }

// export interface SubsetCFNumericalColumn extends CFNumericalColumn {
//   valid?: boolean[];
// }

// export type SubsetCFTableColumn = SubsetCFCategoricalColum | SubsetCFNumericalColumn;

export class SubsetCFTable {
  private _columns: CFTableColumn[];
  private _keyFeatureIndex: number;
  private _dataMeta: DataMeta;
  private _filters: Filter[];
  constructor(columns: CFTableColumn[], keyFeatureIndex: number, dataMeta: DataMeta, filters: Filter[]){
    this._columns = columns;
    this._keyFeatureIndex=keyFeatureIndex;
    this._dataMeta = dataMeta;
    this._filters = filters;
  }

  public get columns() {
    return this._columns;
  }

  public get keyFeatureIndex() {
    return this._keyFeatureIndex;
  }

  public get keyColumns() {
    return this._columns[this._keyFeatureIndex];
  }
}

// export class SubsetTableGroup {
//   private _tables: SubsetCFTable[];
//   private _deletable: boolean;
// }

export interface CFCategoricalColumn extends CategoricalColumn {
  cf?: Series;
  allCF?: Series;
  cfFilter?: string[];
  onFilterCF?: (range?: string[]) => any;
}

export interface CFNumericalColumn extends NumericalColumn {
  cf?: Series;
  allCF?: Series;
  cfFilter?: [number, number];
  onFilterCF?: (range?: [number, number]) => any;
}

export type CFTableColumn = CFCategoricalColumn | CFNumericalColumn;

export function filterByColumnStates(
  dataFrame: DataFrame,
  columns: CFTableColumn[]
) {
  let filteredLocs = _.range(0, dataFrame.length);
  columns.forEach((column, c) => {
    const dfColumn = dataFrame.columns[c];
    assert(
      column.name === dfColumn.name,
      `The ${c}th column "${column.name}" does not match the ${c}th column "${dfColumn.name}" in the dataFrame!`
    );
    console.log()
    if (!isColumnNumerical(dfColumn)) {
      assert(!isNumericalVColumn(column), "column type mismatch");
      const {filter, cfFilter, allCF, prevSeries} = column;
      if (filter) {
        const at = dfColumn.series.at;
        const kept = new Set(filter as string[]);
        filteredLocs = filteredLocs.filter(i => at(i) && kept.has(at(i)!));
      }
      if (cfFilter && allCF) {
        if (prevSeries)
          assert(prevSeries.length === dfColumn.series.length, "this should not happen");
        const kept = new Set(cfFilter as string[]);
        filteredLocs = filteredLocs.filter(i => allCF.at(i) !== undefined && kept.has(allCF.at(i)! as string));
      }
    } else {
      assert(isNumericalVColumn(column), "column type mismatch");
      const {filter, cfFilter, allCF, prevSeries} = column;
      if (filter) {
        const at = dfColumn.series.at;
        filteredLocs = filteredLocs.filter(
          i => at(i) ? (filter[0] <= at(i)! && at(i)! < filter[1]): false
        );
      }
      if (cfFilter && allCF) {
        if (prevSeries)
          assert(prevSeries.length === dfColumn.series.length, "this should not happen");
        filteredLocs = filteredLocs.filter(
          i => {
            const v = allCF.at(i);
            return v !== undefined && cfFilter[0] <= v && v < cfFilter[1];
          }
        );
      }
    }
  });

  return dataFrame.filterByLoc(filteredLocs);
}

export function isArrays<T>(a:T[] | T[][]): a is T[][] {
  return a.length > 0 && isArray(a[0]);
}

export function label2nums(labels: string[], categories?: string[]): [number[], number[]] {
  const cat2idx: Map<string, number> = new Map();
  categories?.map((c, i) => cat2idx.set(c, i));
  const nums = labels.map(v => {
    if (!(cat2idx.has(v))) cat2idx.set(v, cat2idx.size);
    return cat2idx.get(v) as number;
  });
  const uniqNums: number[] = [];
  cat2idx.forEach((v, k) => uniqNums.push(v));
  return [nums, uniqNums];
}

export const getRowLabels = memoize((c: TableColumn) => {
  assert(!isColumnNumerical(c));
  return label2nums(c.series.toArray(), c.categories);
}, {serializer: (args: any) => {
  const c = args as TableColumn;
  return `${c.name}${JSON.stringify(c.filter)}${c.series.length}`;
}});

export const getAllRowLabels = memoize((c: TableColumn) => {
  assert(!isColumnNumerical(c));
  const prevSeries = c.prevSeries;
  return prevSeries && label2nums(prevSeries.toArray(), c.categories);
}, {serializer: (args: any) => {
  const c = args as TableColumn;
  return `${c.name}${JSON.stringify(c.filter)}${c.prevSeries?.length}`;
}});

export function filterUndefined<T>(series: (T | undefined)[]): T[] {
  return series.filter(c => c !== undefined) as T[];
}
