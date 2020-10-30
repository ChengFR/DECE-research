import { FeatureDisc, DataMeta, NumFeatureDisc, DataMetaInput } from './dataset'
import { Dataset } from './dataset'
import DataFrame, { IDataFrame, Row, DataFrameInput, tablePointer } from './data_table'
import { Filter, CFResponse, SubsetCFResponse, CounterFactual } from '../api'
import { Series, IColumn, ColumnSpec, isColumnNumerical, ISeries } from './column'
import { memoize } from 'lodash'
import _ from 'lodash'

export interface CFSubsetProps {
  dataset: Readonly<Dataset>,
  filters: Filter[],
  cfData: CounterFactual[][],
  cfMeta: DataMeta,
}

export class CFSubset {
  private _filters: Filter[];
  private _focusedClass?: number;
  constructor(public CFDataFrames: CFDataFrame[], public dataMeta: Readonly<DataMeta>,
    public CFMeta: Readonly<DataMeta>, filters: Filter[], focusedClass?: number) {
    this._filters = filters;
    this._focusedClass = focusedClass;
  }

  public get prediction() {
    if (this.dataMeta.prediction && this.CFDataFrames.length > 0)
      return this.CFDataFrames[0].columns[this.dataMeta.prediction.index];
    else
      return undefined
  }

  public get target() {
    if (this.dataMeta.target && this.CFDataFrames.length > 0)
      return this.CFDataFrames[0].columns[this.dataMeta.target.index];
    else
      return undefined
  }

  public get filters() {
    return this._filters;
  }

  public get focusedClass() {
    return this._focusedClass;
  }

  public updateFilter(featIndex: number, newFilter: Filter) {
    this._filters[featIndex] = newFilter;
    return this;
  }

  public updateFocusedClass(newClass?: number) {
    this._focusedClass = newClass;
    return this;
  }

  public getCFPrediction(index: number) {
    if (this.CFMeta.prediction)
      return this.CFDataFrames[index].CFColumns[this.CFMeta.prediction.index];
    else
      throw "Prediction of Couterfactuals should not be undefined."
  }

  public getFeatures(index: number) {
    return this.dataMeta.features.map(f => this.CFDataFrames[index].columns[f.index]);
  }

  public getCFFeatures(index: number) {
    return this.CFMeta.features.map(f => this.CFDataFrames[index].CFColumns[f.index])
  }

  // TODO-1 - replace this function with a deep copy
  public copy() {
    return new CFSubset(this.CFDataFrames.map(d => d.copy()),
      this.dataMeta, this.CFMeta, [...this.filters], this.focusedClass);
  }
}

export function buildCFSeries(cfs: (CFResponse | undefined)[], cfMeta: Readonly<DataMeta>, df: Readonly<DataFrame>): (Series | undefined)[] {
  const rowIndex = df.index;
  const columnNames = df.getColumnNames();
  return columnNames.map(c => {
    const col = cfMeta.getColumnDisc(c);
    if (col) {
      const colIndex = col.index;
      const cfData = rowIndex.map(i => {
        const cf = cfs[i];
        if (cf && cf.counterfactuals.length > 0)
          return cf.counterfactuals[0][colIndex];
        else
          return undefined;
      });
      return new Series(cfData.length, j => cfData[j])
    }
    else {
      return undefined;
    }
  })
}

export interface CFDataMetaInput {
  features: FeatureDisc[];
  target: FeatureDisc;
}

export class CFDataMeta extends DataMeta {
  // private name2feature: {[k: string]: Readonly<FeatureDisc>};
  private name2CFfeature: { [k: string]: Readonly<FeatureDisc> };
  public CFFeatures: FeatureDisc[];
  public CFTarget: FeatureDisc;
  constructor(input: DataMetaInput, CFInput: CFDataMetaInput) {
    super(input);
    this.CFFeatures = CFInput.features;
    this.CFTarget = CFInput.target;
    this.name2CFfeature = _.keyBy(this.CFFeatures, (f) => f.name);
  }
}

export class CFDataFrame extends DataFrame {
  private _CFColumns: IColumn[];
  private _CFData: Readonly<Row<string | number>[]>;
  private _name2CFColumn: { [k: string]: IColumn };
  private _validCFSet: number[];

  static fromCFColumns(columns: IColumn[], CFColumns: IColumn[], index?: number[]) {
    const dataT = columns.map(c => c.series.toArray());
    const CFDataT = CFColumns.map(c => c.series.toArray());
    const newCFDF = new CFDataFrame({ dataT, columns, index },
      { dataT: CFDataT, columns: CFColumns, index }, false);

    return newCFDF;
  }

  constructor(input: DataFrameInput, cfInput: DataFrameInput, validate: boolean = true) {
    super(input, validate);

    this.atCF = this.atCF.bind(this);
    this.copy = this.copy.bind(this);
    this.filter = this.filter.bind(this);
    this.filterBy = this.filterBy.bind(this);

    this._CFData = DataFrame.initData(cfInput);

    const validSets = this.filterByBoth(DataFrame.col2filter(input.columns), DataFrame.col2filter(cfInput.columns));
    this._validSet = validSets[0];
    this._validCFSet = validSets[1];
    this._validIndex = this._index.filter(id => (this._validSet.includes(id)) && (this._validCFSet.includes(id)))
    const at = (row: number, col: number) => this.atCF(this._validIndex[row], col);
    this._CFColumns = this._initColumn(cfInput.columns, at);
    this._name2CFColumn = _.keyBy(this._CFColumns, c => c.name);

  }

  public get CFData() {
    return this._CFData;
  }

  // private _initCFColumn(columns: (ColumnSpec | IColumn)[], at: tablePointer) {
  //   const _columns = this._initColumn(columns, at);
  //   return _columns;
  // }

  protected _updateColumn() {
    this._validIndex = this._index.filter(id => (this._validSet.includes(id)) && (this._validCFSet.includes(id)))
    // super._updateColumn();

    
    const at = (row: number, col: number) => this.at(this._validIndex[row], col);
    this._columns = this._columns.map((col, i) => {
      const newSeries = new Series(this.length, j => at(j, i)) as ISeries<number> | ISeries<string>;
      return { ...col, series: newSeries } as IColumn;
    })
    this._name2column = _.keyBy(this._columns, c => c.name);

    const atCF = (row: number, col: number) => this.atCF(this._validIndex[row], col);
    this._CFColumns.forEach((d, i) => d.series = new Series(this.length, j => atCF(j, i)) as ISeries<number> | ISeries<string>)
    this._name2CFColumn = _.keyBy(this._CFColumns, c => c.name);
  }

  public atCF = (row: number, col: number) => {
    try {
      return this._CFData[row][col];
    } catch (err) {
      throw `(${row}, ${col}) not in [${this._CFData.length}, ${this._CFData[0].length}].\n${err}`;
    }
  }

  public sortBy(columnName: string, order: 'descend' | 'ascend', update: boolean = false) {
    const index = super.sortBy(columnName, order, update);
    if (update)
      this._updateColumn();
    return index;
  }

  public filterByCF(filters: Filter[]): number[] {
    let filteredLocs: number[] = _.range(0, this.index.length);
    filters.forEach((filter: Filter) => {
      const columnName = filter.name;
      const columnIndex = this.CFColumns.findIndex(c => c.name === columnName);
      if (columnIndex < 0) throw "No column named " + columnName;
      const column = this.CFColumns[columnIndex];
      if (!isColumnNumerical(column)) {
        // const _filter = filter as CatFilter;
        // const at = column.series.at;
        const at = (row: number) => this._CFData[row][columnIndex] as string;
        const kept = new Set(filter.categories as string[]);
        filteredLocs = filteredLocs.filter(i => (at(i) !== undefined && kept.has(at(i)!)));
      }
      else {
        // const _filter = filter as NumFilter;
        // const at = column.series.at;
        const at = (row: number) => this._CFData[row][columnIndex] as number;
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

  // public filterByCF(CFFilters: Filter[]) {
  //   this._validCFSet = this._index.filter(id => id in this.filterByCF(CFFilters))
  //   this._updateColumn();

  //   // return this;
  // }

  public filterByBoth(filters: Filter[], CFFilters: Filter[], update: boolean = false) {
    const validSet = this._index.filter(id => (super.filterBy(filters).includes(id)));
    const validCFSet = this._index.filter(id => this.filterByCF(CFFilters).includes(id))
    if (update) {
      this._validSet = validSet;
      this._validCFSet = validCFSet;
      this._updateColumn();
    }
    return [validSet, validCFSet];
  }

  public filter() {
    this.filterByBoth(DataFrame.col2filter(this._columns), DataFrame.col2filter(this._CFColumns), true);
  }

  public onChangeCFFilter(columnName: string, filter?: string[] | [number, number]) {
    const index = this.CFColumns.findIndex(c => c.name === columnName);
    this._CFColumns[index].filter = filter;
    this.filter();
  }

  public get CFColumns() {
    return this._CFColumns;
  }

  public getCFColumnByName(name: string) {
    return this._name2CFColumn[name];
  }

  public copy() {
    // return new CFDataFrame({data: this.data, columns: this.columns}, {data: this.CFData, columns: this._CFColumns});
    return CFDataFrame.fromCFColumns(this.columns, this.CFColumns);
  }

  get validIndex() {
    return this._validIndex;
  }

}

export function buildCFDataMeta(dataMeta: DataMeta) {

}

// export function buildCFDataFrame (dataMeta: )