import * as _ from "lodash";
import {
  TableColumn,
  CatTableColumn,
  NumTableColumn
} from "../Table/common";
import DataFrame from "../../data/data_table";
import { assert } from "../../common/utils";
import { isColumnNumerical, Series } from '../../data/column';
import { isNumericalVColumn } from '../Table/common';

import { isArray } from "util";
import memoize from 'fast-memoize';
import { DataMeta, FeatureDisc } from "data";
import { Filter } from "api";

// export class SubsetCFTable {
//   private _columns: CFTableColumn[];
//   private _keyFeatureIndex: number;
//   private _dataMeta: DataMeta;
//   // private _filters: (Filter|undefined)[];
//   constructor(columns: CFTableColumn[], keyFeatureIndex: number, dataMeta: DataMeta, filters?: (Filter | undefined)[]) {
//     this._columns = columns;
//     this._keyFeatureIndex = keyFeatureIndex;
//     this._dataMeta = dataMeta;
//     // this._filters = filters;
//     if (filters) {
//       assert(columns.length === filters.length);
//       _.range(columns.length).forEach((d, i) => {
//         const column = this._columns[i]
//         if (isNumericalCFColumn(column)) {
//           const filter = filters[i];
//           if (filter)
//             column.dataRange = filter.extent ? filter.extent : column.extent;
//           else
//             column.dataRange = column.extent;
//           column.newDataRange = column.dataRange;
//         }
//         else {
//           const filter = filters[i];
//           if (filter)
//             column.dataRange = filter.categories ? [...filter.categories] : [...column.categories];
//           else
//             column.dataRange = [...column.categories];
//           column.newDataRange = column.dataRange;
//         }
//       })
//     }
//   }

//   private _validData() {
//     const predCol = this._columns.find(col => this._dataMeta.prediction && col.name === this._dataMeta.prediction.name);
//     if (predCol === undefined) throw Error("No prediction column");
//     const validMask: boolean[] = _.range(predCol.series.length).map((d, i) => predCol.cf ? predCol.series.at(i) !== predCol.cf.at(i) : false);
//   }

//   public get columns() {
//     return this._columns;
//   }

//   public get keyFeatureIndex() {
//     return this._keyFeatureIndex;
//   }

//   public get keyColumn() {
//     return this._columns[this._keyFeatureIndex];
//   }

//   public copy() {
//     const columns: CFTableColumn[] = this._columns.map(col => ({ ...col }));
//     return new SubsetCFTable(columns, this._keyFeatureIndex, this._dataMeta);
//   }
// }

// export class SubsetTableGroup {
//   private _tables: SubsetCFTable[];
//   private _dataMeta: DataMeta;
//   private _deletable: boolean;
//   private _filters: Filter[];
//   private _stashedFilters: Filter[];
//   private _focusedClass?: number;

//   constructor(columnMat: CFTableColumn[][], dataMeta: DataMeta, filters: (Filter | undefined)[], deleteable: boolean) {
//     // this._filters = filters.map((d, i) => d?d: {...dataMeta.getColumnDisc(columnMat[0][i].name) as FeatureDisc});
//     this._filters = filters.map((d, i) => {
//       if (d) return d
//       else {
//         const disc = dataMeta.getColumnDisc(columnMat[0][i].name);
//         if (disc)
//           return disc
//         else
//           throw Error(`cannot find discription of: ${columnMat[0][i].name}`)
//       }
//     })
//     this._stashedFilters = this._filters;
//     this._deletable = deleteable;
//     this._tables = columnMat.map((cols, i) => {
//       return new SubsetCFTable(cols, i, dataMeta, this._filters)
//     })
//     this._dataMeta = dataMeta;
//   }

//   public get tables() {
//     return this._tables;
//   }

//   public get keyColumns(): CFTableColumn[] {
//     return this.tables.map((table, i) => table.keyColumn);
//   }

//   public updateFilter(idx: number, extent?: [number, number], categories?: string[]) {
//     if (this._stashedFilters[idx]) {
//       this._stashedFilters[idx].extent = extent;
//       this._stashedFilters[idx].categories = categories;
//     }
//     // console.debug(idx, extent, categories);
//   }

//   public get stashedFilters() {
//     return this._stashedFilters;
//   }

//   public get filters() {
//     return this._filters;
//   }

//   public _focuseOn(newClass?: number) {
//     this._focusedClass = newClass;
//   }

//   public get focusedClass() {
//     return this._focusedClass;
//   }


//   public copy() {
//     const columnMat: CFTableColumn[][] = this._tables.map(table => table.copy().columns);
//     const filters: Filter[] = this._filters.map(f => ({ ...f }));
//     return new SubsetTableGroup(columnMat, this._dataMeta, filters, this._deletable);
//   }
// }

// export interface CFCatColumn extends CatTableColumn {
//   cf?: Series<string>;
//   allCF?: Series<string>;
//   cfFilter?: string[];
//   onFilterCF?: (range?: string[]) => any;
//   dataRange?: string[];
//   newDataRange?: string[];
//   valid?: boolean[];
//   selectedValid?: boolean[];
// }

// export interface CFNumColumn extends NumTableColumn {
//   cf?: Series<number>;
//   allCF?: Series<number>;
//   cfFilter?: [number, number];
//   onFilterCF?: (range?: [number, number]) => any;
//   dataRange?: [number, number];
//   newDataRange?: [number, number];
//   valid?: boolean[];
//   selectedValid?: boolean[];
// }

// export type CFTableColumn = CFCatColumn | CFNumColumn;

// export function isNumericalCFColumn(
//   column: CFTableColumn
// ): column is CFNumColumn {
//   return column.type === "numerical";
// }

// export function filterByColumnStates(
//   dataFrame: DataFrame,
//   columns: CFTableColumn[]
// ) {
//   let filteredLocs = _.range(0, dataFrame.length);
//   columns.forEach((column, c) => {
//     const dfColumn = dataFrame.columns[c];
//     assert(
//       column.name === dfColumn.name,
//       `The ${c}th column "${column.name}" does not match the ${c}th column "${dfColumn.name}" in the dataFrame!`
//     );
//     console.log()

//     if (!isNumericalCFColumn(column)) {
//       assert(!isColumnNumerical(dfColumn), "column type mismatch");
//       const { filter, cfFilter, allCF, cf, prevSeries, series } = column;
//       if (filter) {
//         const at = dfColumn.series.at;
//         const kept = new Set(filter as string[]);
//         filteredLocs = filteredLocs.filter(i => at(i) !== undefined && kept.has(at(i)!));
//       }
//       if (cfFilter && allCF) {
//         if (prevSeries)
//           assert(prevSeries.length === dfColumn.series.length, "this should not happen");
//         const kept = new Set(cfFilter as string[]);
//         filteredLocs = filteredLocs.filter(i => allCF.at(i) !== undefined && kept.has(allCF.at(i)! as string));
//       }

//     } else {
//       assert(isNumericalCFColumn(column), "column type mismatch");
//       const { filter, cfFilter, allCF, cf, prevSeries, series } = column;
//       if (filter) {
//         const at = dfColumn.series.at;
//         filteredLocs = filteredLocs.filter(
//           i => at(i) !== undefined ? (filter[0] <= at(i)! && at(i)! < filter[1]) : false
//         );
//       }
//       if (cfFilter && allCF) {
//         if (prevSeries)
//           assert(prevSeries.length === dfColumn.series.length, "this should not happen");
//         filteredLocs = filteredLocs.filter(
//           i => {
//             const v = allCF.at(i);
//             return v !== undefined && cfFilter[0] <= v && v < cfFilter[1];
//           }
//         );
//       }
//     }
//     columns.forEach((column, c) => {

//       if (!isNumericalCFColumn(column)) {
//         const { filter, cfFilter, allCF, cf, prevSeries, series } = column;
//         const prevArray = prevSeries ? prevSeries.toArray() : series.toArray();
//         const prevCfArray = allCF?.toArray() || cf?.toArray();
//         const newArray = prevArray.filter((d, i) => filteredLocs.includes(i));
//         column.series = new Series(newArray.length, i => newArray[i]);
//         if (prevCfArray) {
//           const newCfArray = prevCfArray.filter((d, i) => filteredLocs.includes(i));
//           column.cf = new Series(prevCfArray.length, i => newCfArray[i])
//         }
//       }
//       else {
//         const { filter, cfFilter, allCF, cf, prevSeries, series } = column;
//         const prevArray = prevSeries ? prevSeries.toArray() : series.toArray();
//         const prevCfArray = allCF?.toArray() || cf?.toArray();
//         const newArray = prevArray.filter((d, i) => filteredLocs.includes(i));
//         column.series = new Series(newArray.length, i => newArray[i]);
//         if (prevCfArray) {
//           const newCfArray = prevCfArray.filter((d, i) => filteredLocs.includes(i));
//           column.cf = new Series(prevCfArray.length, i => newCfArray[i])
//         }
//       }
//       column.selectedValid = column.valid?.filter((d, i) => filteredLocs.includes(i));
//     })

//     // const prevSeries = (column.series.toArray()).filter((d, i) => filteredLocs.includes(i))
//   });


//   // return dataFrame.filterByLoc(filteredLocs);
//   return DataFrame.fromColumns(columns);
// }

export function isArrays<T>(a: T[] | T[][]): a is T[][] {
  return a.length > 0 && isArray(a[0]);
}

export function label2nums(labels: string[], categories?: Readonly<string[]>): [number[], number[]] {
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
}, {
  serializer: (args: any) => {
    const c = args as TableColumn;
    return `${c.name}${JSON.stringify(c.filter)}${c.series.length}`;
  }
});

// export const getAllRowLabels = memoize((c: TableColumn) => {
//   assert(!isColumnNumerical(c));
//   const prevSeries = c.prevSeries;
//   return prevSeries && label2nums(prevSeries.toArray(), c.categories);
// }, {
//   serializer: (args: any) => {
//     const c = args as TableColumn;
//     return `${c.name}${JSON.stringify(c.filter)}${c.prevSeries?.length}`;
//   }
// });

export function filterUndefined<T>(series: (T | undefined)[]): T[] {
  return series.filter(c => c !== undefined) as T[];
}

// export function getValidData(column: CFTableColumn): number[] | string[] {
//   let data: number[] | string[] = [];
//   if (isNumericalCFColumn(column)) {
//     data = column.series.toArray();
//     // data = data.filter((d, i) => column.valid ? column.valid[i] : false);
//   }
//   else {
//     data = column.series.toArray();
//     // data = data.filter((d, i) => column.valid ? column.valid[i] : false);
//   }
//   return data
// }
// export function getValidCfData(column: CFTableColumn): number[] | string[] | undefined {
//   let cfData: number[] | string[] | undefined = undefined;
//   if (isNumericalCFColumn(column)) {
//     cfData = column.cf?.toArray();
//     // cfData = cfData && cfData.filter((d, i) => column.valid ? column.valid[i] : false);
//   }
//   else {
//     cfData = column.cf?.toArray();
//     // cfData = cfData && cfData.filter((d, i) => column.valid ? column.valid[i] : false);
//   }
//   return cfData
// }

// export function getValidData(column: CFTableColumn): number[] | string[] {
//   let data: number[] | string[] = [];
//   let cfData: number[] | string[] | undefined = undefined;
//   if (isNumericalCFColumn(column)) {
//     data = column.series.toArray();
//     cfData = column.cf?.toArray();
//     data = data.filter((d, i) => cfData ? cfData[i] !== data[i] : false);
//   }
//   else {
//     data = column.series.toArray();
//     cfData = column.cf?.toArray();
//     data = data.filter((d, i) => cfData ? cfData[i] !== data[i] : false);
//   }
//   return data
// }
// export function getValidCfData(column: CFTableColumn): number[] | string[] | undefined {
//   let data: number[] | string[] = [];
//   let cfData: number[] | string[] | undefined = undefined;
//   if (isNumericalCFColumn(column)) {
//     data = column.series.toArray();
//     cfData = column.cf?.toArray();
//     cfData = cfData && cfData.filter((d, i) => d !== data[i]);
//   }
//   else {
//     data = column.series.toArray();
//     cfData = column.cf?.toArray();
//     cfData = cfData && cfData.filter((d, i) => d !== data[i]);
//   }
//   return cfData
// }
