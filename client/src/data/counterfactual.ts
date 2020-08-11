import { FeatureDisc, DataMeta, NumFeatureDisc, DataMetaInput } from './dataset'
import { Dataset } from './dataset'
import DataFrame, { IDataFrame } from './data_table'
import { Filter, CFResponse, SubsetCFResponse, CounterFactual } from '../api'
import {Series, IColumn} from './column'
import { memoize } from 'lodash'
import _ from 'lodash'

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
    private _filters: (Filter|undefined)[];
    private _cfMeta: DataMeta;
    constructor(props: CFSubsetProps) {
      super(props.dataset.dataFrame.filterBy(props.filters), props.dataset.dataMeta);
        const { dataset, filters, cfData, cfMeta } = props;
        const { dataMeta, dataFrame} = dataset;
        
        this._cfFrames = cfData.map(d => buildCFDataFrame(d, cfMeta));
        this._filters = this.features.map(col => {
          const filter = filters.find(f => f.name === col.name);
          return filter?filter:undefined
        });
        this._dataset = dataset;
        this._cfMeta = cfMeta;
    }

    // public get dataFrame() {
    //   return this.dataFrame;
    // }

    public get dataset(){
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

    public reorderedSubsetColumns(index: number):(IColumn|undefined)[] | undefined {
      const order = this.order;
      const columnName = order[index];
      const columnIndex = this._cfMeta.getColumnDisc(columnName)?.index;
      if (columnIndex !== undefined && this.cfFrames[columnIndex]) {
        const df: DataFrame = this.cfFrames[columnIndex];
        const columns: (IColumn|undefined)[] = order.map(name => df.getColumnByName(name));
        return columns;
      }
      else return undefined
    }

    public reorderedSubsetColMat():((IColumn|undefined)[] | undefined)[] {
      return _.range(this.order.length).map((d, i) => this.reorderedSubsetColumns(i));
    }

    public reorderedFilters(): (undefined|Filter)[] {
      return [undefined, undefined, ...this._filters];
    }

}

// export class CFSeries<T = number|string> {

// }

export function buildCFDataFrame(cfs: CounterFactual[], dataMeta: Readonly<DataMeta>): DataFrame {
// a tmp implementation
  const columns = [...dataMeta.features];
  if (dataMeta.prediction) {
    columns.push(dataMeta.prediction);
  }
  return new DataFrame({data: cfs, columns: columns});
}

export function buildCFSeries(cfs: (CFResponse | undefined)[], cfMeta: Readonly<DataMeta>, df: Readonly<DataFrame>): (Series|undefined)[] {
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
  private name2CFfeature: {[k: string]: Readonly<FeatureDisc>};
  public CFFeatures: FeatureDisc[];
  public CFTarget: FeatureDisc;
  constructor(input: DataMetaInput, CFInput: CFDataMetaInput){
    super(input);
    this.CFFeatures = CFInput.features;
    this.CFTarget = CFInput.target;
    this.name2CFfeature = _.keyBy(this.CFFeatures, (f) => f.name);
  }
}

export class CFDataFrame extends DataFrame {
  private _CFColumns?: IColumn[];
  // private _CFColumnSpecs: ColumnSpec[];
  // private _name2CFColumn: {[k: string]: IColumn};

  
}

export function buildCFDataMeta(dataMeta: DataMeta){

}

// export function buildCFDataFrame (dataMeta: )