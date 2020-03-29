// TODO: Maybe consider existing wheels like:
// data-forge (with similar api as pandas, written in ts): https://github.com/data-forge/data-forge-ts

import memoizeOne from 'memoize-one';
import * as d3 from 'd3';
import * as _ from 'lodash';
import { IColumn, Series, FeatureType, ColumnSpec, isColumnNumerical } from './column';
import {Filter, NumFilter, CatFilter} from '../api'
import {notEmpty} from '../common/utils'
import { DataMeta } from './dataset';

export type Row<T> = T[];


export interface IDataFrame {
  length: number;
  shape: [number, number];
  columns: IColumn[];
  data: Row<string | number>[];
  at (row: number, col: number): string | number;
  getColumnNames(): string[];
  toColumns(): (string[] | number[] | (string | number)[])[];
}


function validate(value: string | number, type: FeatureType) {
  if (type === 'numerical') return Number(value);
  if (type === 'categorical') return String(value);
  return value;
}

export type DataFrameInput = {  
  data?: (string | number)[][];
  dataT?: (string | number)[][];
  columns: (ColumnSpec | IColumn)[];
  index?: number[];
};

export default class DataFrame implements IDataFrame {
  private _columns?: IColumn[];
  private _columnSpecs: ColumnSpec[];
  private _data?: Row<string | number>[];
  private _dataT?: Array<(string | number)[]>;
  private _name2column: {[k: string]: IColumn};
  private _index: number[];

  static validateData(data: (string | number)[][], columnSpecs: ColumnSpec[], transposed: boolean=false): Row<string | number>[] {
    const featureTypes = columnSpecs.map(spec => spec.type);
    if (transposed) {
      data.forEach((c, i) => {
        c.forEach((e, j) => {
          c[j] = validate(e, featureTypes[i]);
        })
      });
    } else {
      data.forEach(r => {
        r.forEach((e, i) => {
          r[i] = validate(e, featureTypes[i]);
        })
      });
    }
    return data;
  }

  static fromColumns(columns: IColumn[], index?: number[]) {
    // console.debug(columns);
    const dataT = columns.map(c => c.series.toArray());
    const newDF = new DataFrame({dataT, columns, index}, false);
    newDF._columns = columns;
    return newDF;
  }

  constructor (input: DataFrameInput, validate: boolean = true) {
    const {data, dataT, columns} = input;
    // console.log(data?.slice(0, 2));
    // console.log(dataT?.slice(0, 2));
    if (data) {
      this._data = validate ? DataFrame.validateData(data, columns) : data;
    } else if (dataT) {
      this._dataT = validate ? DataFrame.validateData(dataT, columns, true) : dataT;
    } else {
      throw "Should have either data or dataT in the input!";
    }
    this.at = this.at.bind(this);
    this._columnSpecs = columns;
    this._name2column = _.keyBy(this.columns, c => c.name);
    this._index = input.index ? input.index : _.range(0, this.length);
  }

  public get index() {
    return this._index;
  }

  public get columns() {
    if (!this._columns) {
      const at = this.at;
      this._columns = this._columnSpecs.map((c, i) => {
        const column = {
          description: "",
          ...c,
          series: new Series(this.length, j => at(j, i))
        } as IColumn;
        if (isColumnNumerical(column)) {
          if (column.extent) column.extent = d3.extent(column.series.toArray()) as [number, number];
        } else {
          if (column.categories) {
            const counter = _.countBy(column.series.toArray());
            column.categories = _.keys(counter).sort();
          }
        }
        return column;
      });
    }
    return this._columns;
  }
  public get data() {
    if (!this._data) {
      if (!this._dataT) throw "Should not happen";
      this._data = this._dataT[0].map((_, r) => this._dataT!.map(col => col[r]));
    }
    return this._data;
  }
  // Note that row is the loc in the array rather than the this.index which could be discontinued.
  public at = (row: number, col: number) => {
    if (this._data)
      return this._data[row][col];
    return this._dataT![col][row];
  }

  public get length() {
    if (this._data)
      return this._data.length;
    return this._dataT![0].length;
  }
  public get shape(): [number, number] {
    return [this.length, this.columns.length];
  }
  public getColumnNames() {
    return this.columns.map(c => c.name);
  }

  public getColumnByName(name: string) {
    return this._name2column[name];
  }

  toColumns = memoizeOne(() => this.columns.map(c => c.series.toArray()));

  public reorderColumns(columnNames: string[]): DataFrame {
    const columns = columnNames.map((n, index) => {
      const c = this.getColumnByName(n);
      if (!c) throw `Column name ${n} not exists in the DataFrame`;
      return {...c};
    });
    return DataFrame.fromColumns(columns);
  }

  public sortBy(columnName: string, order: 'descend' | 'ascend'): DataFrame {
    const columnIndex = this.columns.findIndex(c => c.name === columnName);
    if (columnIndex < 0) throw "No column named " + columnName;
    const column = this.columns[columnIndex];
    let comp: (a: number, b: number) => number;
    if (isColumnNumerical(column)) {
      const at = column.series.at;
      comp = (a: number, b: number) => {
        if (!at(a)) return -1;
        else if (!at(b)) return 1;
        else return at(a)! - at(b)!
      };
    } else {
      const at = column.series.at;
      comp = (a: number, b: number) => {
        const xa = at(a), xb = at(b);
        if (!xa) return -1;
        else if (!xb) return 1;
        else
        return xa == xb ? 0 : (xa < xb ? -1 : 1);
      };
    }
   
    let sortedIndex = _.range(0, this.length).sort(comp);
    if (order === 'descend') sortedIndex = sortedIndex.reverse();

    const data = sortedIndex.map(idx => this.data[idx]);
    const index = sortedIndex.map(i => this._index[i]);
    const columns = this.columns.map(c => {
      const {series, ...rest} = c;
      return rest;
    })
    return new DataFrame({data, index, columns}, false);
  }

  // public filterBy(filters: {columnName: string; filter: string[] | [number, number]}[]): DataFrame {

  //   let filteredLocs: number[] = _.range(0, this.length);
  //   filters.forEach(({columnName, filter}) => {
  //     const columnIndex = this.columns.findIndex(c => c.name === columnName);
  //     if (columnIndex < 0) throw "No column named " + columnName;
  //     const column = this.columns[columnIndex];

  //     if (!isColumnNumerical(column)) {
  //       if (filter.length > 0 && typeof filter[0] !== 'string') 
  //         throw `Column type ${column.type} does not match filter ${filter}`;
  //       const at = column.series.at;
  //       const kept = new Set(filter as string[]);
  //       filteredLocs = filteredLocs.filter(i => kept.has(at(i)));
  //     } else {
  //       if (filter.length !== 2) throw `Column type ${column.type} does not match filter: ${filter}`;
  //       const at = column.series.at;
  //       filteredLocs = filteredLocs.filter(i => filter[0] <= at(i) && at(i) < filter[1]);
  //     }

  //   });
    
  //   return this.filterByLoc(filteredLocs);
  // }
  public filterBy(filters: Filter[]): DataFrame {
    let filteredLocs: number[] = _.range(0, this.length);
    filters.forEach((filter: Filter) => {
      const columnIndex = filter.id;
      const column = this.columns[columnIndex];
      if (!isColumnNumerical(column)) {
        const _filter = filter as CatFilter;
        const at = column.series.at;
        const kept = new Set(_filter.categories as string[]);
        filteredLocs = filteredLocs.filter(i => (at(i) && kept.has(at(i)!)));
      }
      else {
        const _filter = filter as NumFilter;
        const at = column.series.at;
        _filter.min && filteredLocs.filter(i => (at(i) && (_filter.min! <= at(i)!)));
        _filter.max && filteredLocs.filter(i => (at(i) && (_filter.max! >= at(i)!)));
      }
    })
    return this.filterByLoc(filteredLocs);
  }

  public filterByLoc(locs: number[]) {
    const index = locs.map(i => this.index[i]);
    const data = locs.map(i => this.data[i]);
    const columns = this.columns.map(c => {
      const {series, ...rest} = c;
      return rest;
    })
    return new DataFrame({data, index, columns}, false);
  }

  // public filterByIndex(index: number[]) {
  //   const validSet = new Set(index);
  //   const newIndex = this.index.filter((idx => validSet.has(idx)));
  //   const data = index.map(idx => this.data[idx]);
  //   const columns = this.columns.map(c => {
  //     const {series, ...rest} = c;
  //     return rest;
  //   })
  //   return new DataFrame({data, index, columns}, false);
  // }
}

export function buildDataFrame (dataMeta: DataMeta, data: (string | number)[][]) : DataFrame {
  const columnNames = data[0] as string[];
  data = data.slice(1);
  
  const columns = columnNames.map((name, i) => {
    const columnDisc = dataMeta.getColumnDisc(name);
    return {
      name,
      description: columnDisc?.description,
      type: columnDisc?.type || "unknown",
      ...columnDisc
    };
  });

  const index = data.map((row, i) =>
    dataMeta.index ? Number(row[dataMeta.index.index]) : i
  );
  return new DataFrame({ data, columns, index });
}