import memoizeOne from 'memoize-one';

export interface FeatureTypeMap {
  'categorical': string;
  'numerical': number; 
  'unknown': any;
}

export const featureTypeMapper = {
  'categorical': String,
  'numerical': Number,
}

export type FeatureType = keyof FeatureTypeMap;

export interface ColumnSpec {
  name: string;
  description?: string;
  type: FeatureType;
  extent?: [number, number];
  categories?: string[];
}

export interface IColumn<T = any> extends ColumnSpec {
  series: ISeries<T>;
  type: T extends string ? 'categorical' : (T extends number ? 'numerical' : 'unknown');
}

export function isColumnNumerical(column: IColumn<string> | IColumn<number>): column is IColumn<number> {
  return column.type === 'numerical';
}

export interface ISeries<T = any> {
  length: number;
  at(n: number): T;
  toArray(): T[];
  groupBy(labels: number[], uniqLabels?: number[]): T[][];
}

export class Series<T = string | number> implements ISeries<T> {
  public length: number;
  private accessor: (n: number) => T;
  constructor(length: number, accessor: (n: number) => T) {
    this.length = length;
    this.accessor = accessor;
    this.at = this.at.bind(this);
  }
  at(n: number) {
    return this.accessor(n);
  }
  toArray = memoizeOne(() => Array.from({length: this.length}, (v, i) => this.accessor(i)));
  groupBy = memoizeOne((labels: number[], uniqLabels?: number[]): Array<T>[] => {
    const ret: Array<T>[] = [];
    if (uniqLabels) uniqLabels.forEach(l => ret[l] = []);
    labels.forEach((label, i) => {
      if (ret[label]) ret[label].push(this.accessor(i));
      else ret[label] = [this.accessor(i)];
    })
    return ret;
  })
}