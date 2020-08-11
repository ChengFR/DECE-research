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
  data: Row<string | number>[];
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

export default class DataFrame implements IDataFrame {
  private _columns: IColumn[];
  private _columnSpecs: ColumnSpec[];
  private _data: Row<string | number>[];
  // private _dataT?: Array<(string | number)[]>;
  private _validData: Row<string | number>[];
  private _name2column: { [k: string]: IColumn };
  private _index: number[];
  private _validIndex?: ArrayLike<number>;

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
    newDF._columns = columns;
    return newDF;
  }

  constructor(input: DataFrameInput, validate: boolean = true) {
    const { columns } = input;

    this.at = this.at.bind(this);
    this._data = this.updateData(input);

    this._index = input.index ? input.index : _.range(0, this.length);
    this._validData = this.updateValidData([...this._index]);
    
    this._columnSpecs = columns;
    this._columns = this.updateColumn(columns);
    
    this._name2column = _.keyBy(this.columns, c => c.name);
  }

  private updateData(input: DataFrameInput): Row<number|string>[] {
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

  private updateColumn(columns: (ColumnSpec | IColumn)[]): IColumn[] {
    this._columnSpecs = columns;

    const at = this.at;
    const _columns = this._columnSpecs.map((c, i) => {
      const column = {
        description: "",
        ...c,
        series: new Series(this.length, j => at(j, i))
      } as IColumn;
      if (isColumnNumerical(column)) {
        if (!column.extent) column.extent = d3.extent(column.series.toArray()) as [number, number];
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

  private updateValidData(validIndex: ArrayLike<number>): Row<string | number>[] {
    this._validIndex = validIndex;
    const validData = this._data.filter((row, _pseudoIndex) => this._index[_pseudoIndex] in validIndex);
    return validData;
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
  // Note that row is the loc in the array rather than the this.index which could be discontinued.
  public at = (row: number, col: number) => {
    return this._validData[row][col];
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

  public sortBy(columnName: string, order: 'descend' | 'ascend'): DataFrame {
    const columnIndex = this.columns.findIndex(c => c.name === columnName);
    if (columnIndex < 0) throw "No column named " + columnName;
    const column = this.columns[columnIndex];
    let comp: (a: number, b: number) => number;
    if (isColumnNumerical(column)) {
      const at = column.series.at;
      comp = (a: number, b: number) => {
        const va = at(a), vb = at(b);
        if (va === undefined) return -1;
        else if (vb === undefined) return 1;
        else return va - vb
      };
    } else {
      const at = column.series.at;
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

    const data = sortedIndex.map(idx => this.data[idx]);
    const index = sortedIndex.map(i => this._index[i]);
    const columns = this.columns.map(c => {
      const { series, ...rest } = c;
      return rest;
    })
    // return new DataFrame({ data, index, columns }, false);
    this.updateData({data, columns});
    this.updateColumn(columns);
    this._index = index;

    return this;
  }

  public filterBy(filters: Filter[]): DataFrame {
    let filteredLocs: number[] = _.range(0, this.length);
    filters.forEach((filter: Filter) => {
      const columnName = filter.name;
      const columnIndex = this.columns.findIndex(c => c.name === columnName);
      if (columnIndex < 0) throw "No column named " + columnName;
      const column = this.columns[columnIndex];
      if (!isColumnNumerical(column)) {
        // const _filter = filter as CatFilter;
        const at = column.series.at;
        const kept = new Set(filter.categories as string[]);
        filteredLocs = filteredLocs.filter(i => (at(i) !== undefined && kept.has(at(i)!)));
      }
      else {
        // const _filter = filter as NumFilter;
        const at = column.series.at;
        const min = filter.extent && filter.extent[0];
        const max = filter.extent && filter.extent[1];
        if (min)
          filteredLocs = filteredLocs.filter(i => (at(i) !== undefined && (min <= at(i)!)));
        if (max)
          filteredLocs = filteredLocs.filter(i => (at(i) !== undefined && (max > at(i)!)));
      }
    })
    return this.filterByLoc(filteredLocs.map(pseudoIndex => this._index[pseudoIndex]));
  }

  public filterByLoc(validIndex: number[]) {
    // const index = locs.map(i => this.index[i]);
    // const data = locs.map(i => this.data[i]);
    // const columns = this.columns.map(c => {
    //   const { series, ...rest } = c;
    //   return rest;
    // })
    // this._columns = this.updateColumn(columns);
    // return new DataFrame({ data, index, columns }, false);
    this._validData = this.updateValidData(validIndex);
    return this;
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