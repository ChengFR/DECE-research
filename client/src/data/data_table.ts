// TODO: Maybe consider existing wheels like:
// data-forge (with similar api as pandas, written in ts): https://github.com/data-forge/data-forge-ts

import memoizeOne from 'memoize-one';
import * as d3 from 'd3';
import * as _ from 'lodash';
import { IColumn, Series, FeatureType, ColumnSpec, isColumnNumerical } from './column';
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

export type DataFrameInput = {
  data?: (string | number)[][];
  dataT?: (string | number)[][];
  columns: (ColumnSpec | IColumn)[];
  index?: number[];
};

export type tablePointer = (row: number, col: number) => (number | string);

export default class DataFrame implements IDataFrame {
  private _columns: IColumn[];
  private _data: Readonly<Row<string | number>[]>;
  // private _validData: Row<string | number>[];
  private _name2column: { [k: string]: IColumn };
  private _filters: (Filter | undefined)[];
  protected _index: number[];
  protected _validSet: ArrayLike<number>;
  protected _validIndex: ArrayLike<number>;

  static validateData(data: (string | number)[][], columnSpecs: ColumnSpec[], transposed: boolean = false): Row<string | number>[] {
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
    const newDF = new DataFrame({ dataT, columns, index }, false);
    // newDF._columns = columns;
    return newDF;
  }

  static updateData(input: DataFrameInput): Row<number | string>[] {
    const { data, dataT, columns } = input;
    let _data = data;
    if (data) {
      _data = validate ? DataFrame.validateData(data, columns) : data;
    } else if (dataT) {
      const _dataT = validate ? DataFrame.validateData(dataT, columns, true) : dataT;
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

    this._data = DataFrame.updateData(input);
    // this._index = input.index ? input.index : _.range(0, this.length);
    this._index = _.range(0, this.length);
    this._validSet = [...this._index];
    this._validIndex = [...this._index];
    // this._validData = this.updateValidData(this._validIndex);

    this._columns = this._updateColumn(columns);
    this._name2column = _.keyBy(this._columns, c => c.name);
    this._filters = this._columns.map(() => undefined);
  }

  protected updateColumn(columns: (ColumnSpec | IColumn)[], at: tablePointer): IColumn[] {
    const _columns = columns.map((c, i) => {
      const column = {
        description: "",
        ...c,
        series: new Series(this.length, j => at(j, i)),
      } as IColumn;
      if (isColumnNumerical(column)) {
        if (!column.extent) column.extent = d3.extent(column.series.toArray()) as [number, number];
        column.onFilter = (filter: [number, number] | undefined) => {
          column.filter = filter;
          this._updateFilter(column.name, filter ? { name: column.name, extent: filter } : undefined);
          this.filter();
        }
      } else {
        if (!column.categories) {
          const counter = _.countBy(column.series.toArray());
          column.categories = _.keys(counter).sort();
        }
        column.onFilter = (filter: string[] | undefined) => {
          column.filter = filter;
          this._updateFilter(column.name, filter ? { name: column.name, categories: filter } : undefined);
          this.filter();
        }
      }
      column.onSort = this.sortBy.bind(this, c.name);
      return column;
    });
    return _columns;
  }

  protected _updateColumn(columns: (ColumnSpec | IColumn)[]) {
    const at = (row: number, col: number) => this.at(this._validIndex[row], col);
    return this.updateColumn(columns, at);
  }

  protected _updateFilter(colName: string, filter: Filter | undefined) {
    const colIndex = this._columns.findIndex(d => d.name === colName);
    this._filters[colIndex] = filter;
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

  public get filters() {
    return this._filters;
  }
  // Note that row is the loc in the array rather than the this.index which could be discontinued.
  public at = (row: number, col: number) => {
    return this._data[row][col];
  }
  public get length() {
    return this._data.length;
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

  protected sortIndex(columnName: string, order: 'descend' | 'ascend'): number[] {
    const columnIndex = this.columns.findIndex(c => c.name === columnName);
    if (columnIndex < 0) throw "No column named " + columnName;
    const column = this.columns[columnIndex];
    column.sorted = order;
    let comp: (a: number, b: number) => number;
    if (isColumnNumerical(column)) {
      // const at = column.series.at;
      const at = (row: number) => this._data[this.index[row]][columnIndex] as number;
      comp = (a: number, b: number) => {
        const va = at(a), vb = at(b);
        if (va === undefined) return -1;
        else if (vb === undefined) return 1;
        else return va - vb
      };
    } else {
      // const at = column.series.at;
      const at = (row: number) => this._data[this.index[row]][columnIndex] as string;
      comp = (a: number, b: number) => {
        const xa = at(a), xb = at(b);
        if (xa === undefined) return -1;
        else if (xb === undefined) return 1;
        else
          return xa == xb ? 0 : (xa < xb ? -1 : 1);
      };
    }

    let sortedIndex = _.range(0, this.length).sort(comp);
    if (order === 'descend') sortedIndex = sortedIndex.reverse();
    return sortedIndex;
  }

  public sortBy(columnName: string, order: 'descend' | 'ascend'): DataFrame {
    this._index = this.sortIndex(columnName, order);
    this._validIndex = this._index.filter(id => id in this._validSet);

    this._updateColumn(this.columns);

    return this;
  }

  protected filterIndex(filters: Filter[]): ArrayLike<number> {
    let filteredLocs: number[] = _.range(0, this.length);
    filters.forEach((filter: Filter) => {
      const columnName = filter.name;
      const columnIndex = this.columns.findIndex(c => c.name === columnName);
      if (columnIndex < 0) throw "No column named " + columnName;
      const column = this.columns[columnIndex];
      if (!isColumnNumerical(column)) {
        // const _filter = filter as CatFilter;
        // const at = column.series.at;
        const at = (row: number) => this._data[row][columnIndex] as string;
        const kept = new Set(filter.categories as string[]);
        filteredLocs = filteredLocs.filter(i => (at(i) !== undefined && kept.has(at(i)!)));
      }
      else {
        // const _filter = filter as NumFilter;
        // const at = column.series.at;
        const at = (row: number) => this._data[row][columnIndex] as number;
        const min = filter.extent && filter.extent[0];
        const max = filter.extent && filter.extent[1];
        if (min)
          filteredLocs = filteredLocs.filter(i => (at(i) !== undefined && (min <= at(i)!)));
        if (max)
          filteredLocs = filteredLocs.filter(i => (at(i) !== undefined && (max > at(i)!)));
      }
    })
    return filteredLocs;
  }

  public filterBy(filters: Filter[]): DataFrame {
    this._validSet = this.filterIndex(filters);
    this._validIndex = this._index.filter(id => id in this._validSet);
    this._updateColumn(this._columns);
    return this;
  }

  public filter(): DataFrame {
    return this.filterBy(this._filters.filter(notEmpty));
  }

  // public filterByLoc(validIndex: number[]) {
  //   // this._validData = this.updateValidData(validIndex);
  //   return this;
  // }

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
  return new DataFrame({ data, columns, index });
}