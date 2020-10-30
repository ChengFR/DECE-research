import memoizeOne from 'memoize-one';
import {notEmpty} from '../common/utils'

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
  precision?: number;
  categories?: Readonly<string[]>;
}

export interface INumColumn extends ColumnSpec {
  series: ISeries<number>;
  type: 'numerical';
  extent: [number, number];
  precision: number;

  sorted?: 'descend' | 'ascend' | null;
  onSort?: (order: "descend" | "ascend") => any;
  filter?: [number, number];
  onFilter?: (filter?: [number, number]) => any;
}

export interface ICatColumn extends ColumnSpec {
  series: ISeries<string>;
  type: 'categorical';
  categories: Readonly<string[]>;

  sorted?: 'descend' | 'ascend' | null;
  onSort?: (order: "descend" | "ascend") => any;
  filter?: string[];
  onFilter?: (filters?: string[]) => any;
}

export type IColumn = INumColumn | ICatColumn

export function isColumnNumerical(column: IColumn): column is INumColumn {
  return column.type === 'numerical';
}

export interface ISeries<T = any> {
  length: number;
  at(n: number): T | undefined;
  toArray(): T[];
  toRawArray(): (T|undefined)[];
  groupBy(labels: number[], uniqLabels?: number[], filter?: (idx: number) => boolean): T[][];
}

export class Series<T = string | number> implements ISeries<T> {
  public length: number;
  private accessor: (n: number) => T | undefined;
  constructor(length: number, accessor: (n: number) => T | undefined) {
    this.length = length;
    this.accessor = accessor;
    this.at = this.at.bind(this);
    this.toArray = this.toArray.bind(this);
  }
  at(n: number) {
    return this.accessor(n);
  }
  filterBy = memoizeOne((valuefn: (value: T, index?: number) => boolean) => this.toArray().filter(valuefn))
  toArray = memoizeOne(() => Array.from({length: this.length}, (v, i) => this.accessor(i)).filter(notEmpty));
  groupBy = memoizeOne((labels: number[], uniqLabels?: number[], filter?: (idx: number) => boolean): Array<T>[] => {
    const ret: Array<T>[] = [];
    if (uniqLabels) uniqLabels.forEach(l => ret[l] = []);
    labels.forEach((label, i) => {
      if (filter === undefined || filter(i)){
        if (ret[label] && this.accessor(i) !== undefined) ret[label].push(this.accessor(i)!);
        else if (this.accessor(i) !== undefined) ret[label] = [this.accessor(i)!];
      }
    })
    return ret
  })
  // a tmp implementation
  toRawArray = memoizeOne(() => Array.from({length: this.length}, (v, i) => this.accessor(i)));
}