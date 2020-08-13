import { FeatureDisc, DataMeta, NumFeatureDisc, DataMetaInput } from './dataset'
import { Dataset } from './dataset'
import DataFrame, { IDataFrame, Row, DataFrameInput, tablePointer } from './data_table'
import { Filter, CFResponse, SubsetCFResponse, CounterFactual } from '../api'
import { Series, IColumn, ColumnSpec, isColumnNumerical } from './column'
import { memoize } from 'lodash'
import _ from 'lodash'
import { timeHours } from 'd3'
import { notEmpty } from 'common/utils'

// export type CounterFactual = (string | number)[];

// export interface CFAttrPolicy {
//   feature
//   filter: [number, number]
// }

// export interface cfCatFeatureDisc extends NumFeatureDisc {
//   filter: string[]
// }

// export type cfFeatureDisc = cfNumFeatureDisc | cfCatFeatureDisc;

// export type CFSubsetPolicy = cfFeatureDisc[]

export interface CFSubsetProps {
  dataset: Readonly<Dataset>,
  filters: Filter[],
  cfData: CounterFactual[][],
  cfMeta: DataMeta,
}

export class CFSubset extends Dataset {
  private _dataset: Readonly<Dataset>;
  private _cfFrames: DataFrame[];
  private _filters: (Filter | undefined)[];
  private _cfMeta: DataMeta;
  constructor(props: CFSubsetProps) {
    super(props.dataset.dataFrame.filterBy(props.filters), props.dataset.dataMeta);
    const { dataset, filters, cfData, cfMeta } = props;
    const { dataMeta, dataFrame } = dataset;

    this._cfFrames = cfData.map(d => buildCFDataFrame(d, cfMeta));
    this._filters = this.features.map(col => {
      const filter = filters.find(f => f.name === col.name);
      return filter ? filter : undefined
    });
    this._dataset = dataset;
    this._cfMeta = cfMeta;
  }

  // public get dataFrame() {
  //   return this.dataFrame;
  // }

  public get dataset() {
    return this._dataset;
  }

  public get cfFrames() {
    return this._cfFrames;
  }

  public get filters() {
    return this._filters;
  }

  public getCFPrediction(index: number) {
    return this.dataMeta.prediction && this._cfFrames[index].columns[this.dataMeta.prediction.index];
  }

  public getCFFeatures(index: number) {
    return this.dataMeta.features.map(f => this.dataFrame.columns[f.index]);
  }

  public reorderedSubsetColumns(index: number): (IColumn | undefined)[] | undefined {
    const order = this.order;
    const columnName = order[index];
    const columnIndex = this._cfMeta.getColumnDisc(columnName)?.index;
    if (columnIndex !== undefined && this.cfFrames[columnIndex]) {
      const df: DataFrame = this.cfFrames[columnIndex];
      const columns: (IColumn | undefined)[] = order.map(name => df.getColumnByName(name));
      return columns;
    }
    else return undefined
  }

  public reorderedSubsetColMat(): ((IColumn | undefined)[] | undefined)[] {
    return _.range(this.order.length).map((d, i) => this.reorderedSubsetColumns(i));
  }

  public reorderedFilters(): (undefined | Filter)[] {
    return [undefined, undefined, ...this._filters];
  }

}



export function buildCFDataFrame(cfs: CounterFactual[], dataMeta: Readonly<DataMeta>): DataFrame {
  // a tmp implementation
  const columns = [...dataMeta.features];
  if (dataMeta.prediction) {
    columns.push(dataMeta.prediction);
  }
  return new DataFrame({ data: cfs, columns: columns });
}

export class _CFSubset {
  constructor(public CFDataFrames: CFDataFrame[], public filters: Filter[],
    public dataMeta: Readonly<DataMeta>, public CFMeta: Readonly<DataMeta>) {

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
  // private _CFColumnSpecs: ColumnSpec[];
  // private _name2CFColumn: {[k: string]: IColumn};
  private _CFData: Readonly<Row<string | number>[]>;
  private _name2CFColumn: { [k: string]: IColumn };
  private _validCFSet: ArrayLike<number>;
  private _CFFilters: (Filter | undefined)[];

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
    this._CFData = DataFrame.updateData(cfInput);

    this._CFColumns = this.updateColumn(cfInput.columns, this.atCF);
    this._name2CFColumn = _.keyBy(this._CFColumns, c => c.name);

    this._CFFilters = this._CFColumns.map(() => undefined);
    this._validCFSet = [...this.index];
  }

  // private updateCFColumn(columns: (ColumnSpec | IColumn)[], at: tablePointer): IColumn[] {
  //   const _columns = super.updateColumn(columns, at);
  // }

  private _updateCFColumn(columns: (ColumnSpec | IColumn)[]) {
    const at = (row: number, col: number) => this.atCF(this._validIndex[row], col);
    const _columns = this.updateColumn(columns, at);
    _columns.forEach(column => {
      if (isColumnNumerical(column))
        column.onFilter = (filter: [number, number] | undefined) => {
          column.filter = filter;
          this._updateCFFilter(column.name, filter ? { name: column.name, extent: filter } : undefined);
          this.filter();
        }
      else
        column.onFilter = (filter: string[] | undefined) => {
          column.filter = filter;
          this._updateCFFilter(column.name, filter ? { name: column.name, categories: filter } : undefined);
          this.filter();
        }
    });
    return _columns;
  }

  public atCF = (row: number, col: number) => {
    return this._CFData[row][col];
  }

  public sortBy(columnName: string, order: 'descend' | 'ascend'): DataFrame {
    this._index = this.sortIndex(columnName, order);
    this._validIndex = this._index.filter(id => (id in this._validSet) && (id in this._validCFSet));

    this._updateColumn(this.columns);
    this._updateCFColumn(this.CFColumns)

    return this;
  }

  public filterBy(filters: Filter[]): DataFrame {
    this._validSet = this.filterIndex(filters);
    this._validIndex = this._index.filter(id => id in this._validSet);

    this._updateColumn(this.columns);
    this._updateCFColumn(this.CFColumns);

    return this;
  }

  public filterCFIndex(filters: Filter[]): ArrayLike<number> {
    let filteredLocs: number[] = _.range(0, this.length);
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

  public filterByCF(CFFilters: Filter[]): DataFrame {
    this._validCFSet = this._index.filter(id => id in this.filterCFIndex(CFFilters))
    this._validIndex = this._index.filter(id => (id in this._validSet) && (id in this._validCFSet));

    this._updateColumn(this.columns);
    this._updateCFColumn(this.CFColumns);

    return this;
  }

  public filterByBoth(filters: Filter[], CFFilters: Filter[]): DataFrame {
    this._validSet = this._index.filter(id => (id in this.filterIndex(filters)));
    this._validCFSet = this._index.filter(id => id in this.filterCFIndex(CFFilters))
    this._validIndex = this._index.filter(id => (id in this._validSet) && (id in this._validCFSet));

    this._updateColumn(this.columns);
    this._updateCFColumn(this.CFColumns);

    return this;
  }

  protected _updateCFFilter(colName: string, filter: Filter | undefined) {
    const colIndex = this.CFColumns.findIndex(d => d.name === colName);
    this._CFFilters[colIndex] = filter;
  }

  public filter(): DataFrame {
    return this.filterByBoth(this.filters.filter(notEmpty), this.CFFilters.filter(notEmpty));
  }

  public get CFColumns() {
    return this._CFColumns;
  }

  public get CFFilters() {
    return this._CFFilters;
  }

  public getCFColumnByName(name: string) {
    return this._name2CFColumn[name];
  }
}

export function buildCFDataMeta(dataMeta: DataMeta) {

}

// export function buildCFDataFrame (dataMeta: )