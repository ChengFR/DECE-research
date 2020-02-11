// TODO: Maybe consider existing wheels like:
// data-forge (with similar api as pandas, written in ts): https://github.com/data-forge/data-forge-ts

import { IColumn, Series, FeatureType, FeatureTypeMap, ColumnSpec, featureTypeMapper } from './column';
import memoizeOne from 'memoize-one';

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

export default class DataFrame implements IDataFrame {
  public columns: (IColumn<string> | IColumn<number> | IColumn<string | number>)[] = [];
  public data: Row<string | number>[] = [];
  static validateData(data: (string | number)[][], columnSpecs: ColumnSpec[]): Row<string | number>[] {
    const featureTypes = columnSpecs.map(spec => spec.type);
    data.forEach(r => {
      r.forEach((e, i) => {
        r[i] = validate(e, featureTypes[i]);
      })
    })
    return data;
  }
  constructor ({data, columnSpecs}: {data: string[][], columnSpecs: ColumnSpec[]}) {
    this.data = data;
    this.columns = columnSpecs.map((c, i) => {
      return {
        description: "",
        ...c,
        series: new Series(data.length, j => this.data[j][i])
      };
    });
  }
  public at(row: number, col: number) {
    return this.data[row][col];
  }

  public get length() {
    return this.data.length;
  }
  public get shape(): [number, number] {
    return [this.data.length, this.columns.length];
  }
  public getColumnNames() {
    return this.columns.map(c => c.name);
  }

  toColumns = memoizeOne(() => this.columns.map(c => c.series.toArray()));
}