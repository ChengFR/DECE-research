// TODO: Maybe consider existing wheels like:
// data-forge (with similar api as pandas, written in ts): https://github.com/data-forge/data-forge-ts

import memoizeOne from 'memoize-one';
import * as _ from 'lodash';
import { IColumn, Series, FeatureType, ColumnSpec } from './column';

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
  columns: (ColumnSpec | IColumn<string> | IColumn<number>)[];
};

export default class DataFrame implements IDataFrame {
  private _columns?: (IColumn<string> | IColumn<number>)[];
  private _columnSpecs: ColumnSpec[];
  private _data?: Row<string | number>[];
  private _dataT?: Array<(string | number)[]>;
  private _name2column: {[k: string]: IColumn<string> | IColumn<number>};

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

  static fromColumns(columns: (IColumn<string> | IColumn<number>)[]) {
    // console.debug(columns);
    const dataT = columns.map(c => c.series.toArray());
    const newDF = new DataFrame({dataT, columns}, false);
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
    this._columnSpecs = columns;
    this._name2column = _.keyBy(this.columns, c => c.name);
    this.at = this.at.bind(this);
  }

  public get columns() {
    if (!this._columns) {
      const at = this.at;
      this._columns = this._columnSpecs.map((c, i) => {
        return {
          description: "",
          ...c,
          series: new Series(this.length, j => at(j, i))
        } as IColumn<number> | IColumn<string>;
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
    const columns = columnNames.map(n => {
      const c = this.getColumnByName(n);
      if (!c) throw `Column name ${n} not exists in the DataFrame`;
      return c;
    });
    return DataFrame.fromColumns(columns);
  }
}