import memoizeOne from 'memoize-one';

export interface FeatureTypeMap {
  'mixed': string | number;
  'categorical': string;
  'numerical': number; 
  'unknown': any;
}

export const featureTypeMapper = {
  'categorical': String,
  'numerical': Number,
  'mixed': (x: string | number) => x,
}

export type FeatureType = keyof FeatureTypeMap;

export interface ColumnSpec {
  name: string;
  description?: string;
  type: FeatureType;
  extent?: [number, number];
}

export interface IColumn<T = any> extends ColumnSpec {
  series: ISeries<T>;
}

export interface ISeries<T = any> {
  length: number;
  at(n: number): T;
  toArray(): T[];
}

export class Series<T = string | number> implements ISeries<T> {
  public length: number;
  private accessor: (n: number) => T;
  constructor(length: number, accessor: (n: number) => T) {
    this.length = length;
    this.accessor = accessor;
  }
  at(n: number) {
    return this.accessor(n);
  }
  toArray = memoizeOne(() => Array.from({length: this.length}, (v, i) => this.accessor(i)));
}