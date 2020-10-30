// TODO: Maybe consider existing wheels like:
// data-forge (with similar api as pandas, written in ts): https://github.com/data-forge/data-forge-ts

import memoizeOne from 'memoize-one';
import * as d3 from 'd3';
import * as _ from 'lodash';
import { IColumn, Series, FeatureType, ColumnSpec, isColumnNumerical, ISeries } from './column';
import { Filter } from '../api'
import { notEmpty } from '../common/utils'
import { DataMeta } from './dataset';

export type Row<T> = T[];


export interface IDataFrame {
  length: number;
  shape: [number, number];
  columns: IColumn[];
  data: Readonly<Row<string | number>[]>;
  at(row: number, col: number): string | number;
  getColumnNames(): string[];
  toColumns(): (string[] | number[] | (string | number)[])[];
}


function validate(value: string | number, type: FeatureType) {
  if (type === 'numerical') return Number(value);
  if (type === 'categorical') return String(value);
  return value;
}

export function validateData(data: (string | number)[][], columnSpecs: ColumnSpec[], transposed: boolean = false): Row<string | number>[] {
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

export type DataFrameInput = {
  data?: Readonly<(string | number)[][]>;
  dataT?: (string | number)[][];
  columns: (ColumnSpec | IColumn)[];
  index?: number[];
};

export type tablePointer = (row: number, col: number) => (number | string);

export default class DataFrame implements IDataFrame {
  private _data: Readonly<Row<string | number>[]>;

  protected _columns: IColumn[];
  protected _name2column: { [k: string]: IColumn };
  protected _index: number[];
  protected _validSet: number[];
  protected _validIndex: number[];

  static fromColumns(columns: IColumn[], index?: number[]) {
    // console.debug(columns);
    const dataT = columns.map(c => c.series.toArray());
    const newDF = new DataFrame({ dataT, columns, index }, false);
    // newDF._columns = columns;
    return newDF;
  }

  static col2filter(columns: (IColumn | ColumnSpec)[]): Filter[] {
    const filters: (Filter | undefined)[] = columns.map(col => {
      if ("filter" in col && col.filter) {
        if (isColumnNumerical(col)) {
          return { name: col.name, extent: col.filter }
        }
        else {
          return { name: col.name, categories: col.filter }
        }
      }
    })
    return filters.filter(notEmpty);
  }

  static initData(input: DataFrameInput): Readonly<Row<number | string>[]> {
    const { data, dataT, columns } = input;
    let _data = data;
    if (data) {
      _data = data;
    } else if (dataT) {
      const _dataT = dataT;
      _data = _dataT[0].map((_, r) => _dataT!.map(col => col[r]));
    } else {
      throw "Should have either data or dataT in the input!";
    }
    return _data;
  }

  constructor(input: DataFrameInput, validate: boolean = true) {
    const { columns } = input;

    this.at = this.at.bind(this);
    this.sortBy = this.sortBy.bind(this);
    this.filterBy = this.filterBy.bind(this);
    this.filter = this.filter.bind(this);
    this.copy = this.copy.bind(this);

    this._initColumn = this._initColumn.bind(this);

    this._data = DataFrame.initData(input);
    this._index = _.range(0, this._data.length);
    this._validSet = this.filterBy(DataFrame.col2filter(columns));
    this._validIndex = this._index.filter(id => this._validSet.includes(id));
    const at = (row: number, col: number) => this.at(this._validIndex[row], col);
    this._columns = this._initColumn(columns, at);
    this._name2column = _.keyBy(this._columns, c => c.name);
  }

  protected _initColumn(columns: (ColumnSpec | IColumn)[], at: tablePointer): IColumn[] {
    const _columns = columns.map((c, i) => {
      const column = {
        description: "",
        ...c,
        series: new Series(this.length, j => at(j, i)),
      } as IColumn;
      if (isColumnNumerical(column)) {
        if (!column.extent)
          column.extent = d3.extent(column.series.toArray()) as [number, number];
      } else {
        if (!column.categories) {
          const counter = _.countBy(column.series.toArray());
          column.categories = _.keys(counter).sort();
        }
      }
      return column;
    });
    return _columns;
  }

  protected _updateColumn() {
    this._validIndex = this._index.filter(id => this._validSet.includes(id));
    const at = (row: number, col: number) => this.at(this._validIndex[row], col);
    if (this._columns === undefined) {
      this._initColumn(this._columns, at);
    }
    this._columns = this._columns.map((col, i) => {
      const newSeries = new Series(this.length, j => at(j, i)) as ISeries<number> | ISeries<string>;
      return { ...col, series: newSeries } as IColumn;
    })
    this._name2column = _.keyBy(this._columns, c => c.name);
  }

  public get index() {
    return this._index;
  }

  public get columns() {
    return this._columns;
  }

  public get data() {
    return this._data;
  }

  public at = (row: number, col: number) => {
    return this._data[row][col];
  }

  public get length() {
    return this._validIndex.length;
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
      return { ...c };
    });
    return DataFrame.fromColumns(columns);
  }

  protected sortBy(columnName: string, order: 'descend' | 'ascend', update: boolean = false): number[] {
    const columnIndex = this.columns.findIndex(c => c.name === columnName);
    if (columnIndex < 0) throw "No column named " + columnName;
    const column = this.columns[columnIndex];
    column.sorted = order;
    let comp: (a: number, b: number) => number;
    if (isColumnNumerical(column)) {
      const at = (row: number) => this._data[row][columnIndex] as number;
      comp = (a: number, b: number) => {
        const va = at(a), vb = at(b);
        if (va === undefined) return -1;
        else if (vb === undefined) return 1;
        else return va - vb
      };
    } else {
      const at = (row: number) => this._data[row][columnIndex] as string;
      comp = (a: number, b: number) => {
        const xa = at(a), xb = at(b);
        if (xa === undefined) return -1;
        else if (xb === undefined) return 1;
        else
          return xa == xb ? 0 : (xa < xb ? -1 : 1);
      };
    }

    let sortedIndex = this.index.sort(comp);
    if (order === 'descend') sortedIndex = sortedIndex.reverse();

    if (update) {
      this._index = sortedIndex;
      this._updateColumn();
    }
    return sortedIndex;
  }


  public filterBy(filters: Filter[], update: boolean = false): number[] {
    let filteredLocs: number[] = _.range(0, this.index.length);
    filters.forEach((filter: Filter) => {
      const columnName = filter.name;
      const columnIndex = this.columns.findIndex(c => c.name === columnName);
      if (columnIndex < 0) throw "No column named " + columnName;
      const column = this.columns[columnIndex];
      if (!isColumnNumerical(column)) {
        const at = (row: number) => this._data[row][columnIndex] as string;
        const kept = new Set(filter.categories as string[]);
        filteredLocs = filteredLocs.filter(i => (at(i) !== undefined && kept.has(at(i))));
      }
      else {
        const at = (row: number) => this._data[row][columnIndex] as number;
        const min = filter.extent && filter.extent[0];
        const max = filter.extent && filter.extent[1];
        if (min !== undefined)
          filteredLocs = filteredLocs.filter(i => (at(i) !== undefined && (at(i) >= min)));
        if (max !== undefined){
          filteredLocs = filteredLocs.filter(i => (at(i) !== undefined && (at(i) < max - 0.0001)));
        }
      }
    })
    if (update) {
      this._validSet = filteredLocs;
      this._updateColumn();
    }
    return filteredLocs;
  }

  public filter() {
    this.filterBy(DataFrame.col2filter(this._columns), true);
  }

  public onChangeFilter(columnName: string, filter?: string[] | [number, number]) {
    const index = this.columns.findIndex(c => c.name === columnName);
    this._columns[index].filter = filter;
    this.filter();
  }

  public copy() {
    return DataFrame.fromColumns(this.columns);
  }
}

export function buildDataFrame(dataMeta: DataMeta, data: (string | number)[][]): DataFrame {
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
  return new DataFrame({ data: validateData(data, columns), columns, index });
}