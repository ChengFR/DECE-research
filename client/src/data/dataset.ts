import * as _ from 'lodash';
import IDataFrame from './data_table';
import { FeatureType } from './column';
import memoize from 'fast-memoize';
import DataFrame from './data_table';

export interface FeatureDisc {
  name: string;
  description?: string;
  type: FeatureType;
  index: number;
  categories?: string[];
  extent?: [number, number];
  min?: number,
  max?: number,
  precision?: number
}

export class DataMeta {
  private name2feature: {[k: string]: FeatureDisc};
  public features: FeatureDisc[];
  public target: FeatureDisc;
  public prediction?: FeatureDisc;
  // add index attribute
  public index?: FeatureDisc;
  constructor(input: {features: FeatureDisc[], target: FeatureDisc, prediction?: FeatureDisc, index?: FeatureDisc}) {
    this.features = input.features;
    this.target = input.target;
    this.prediction = input.prediction;
    this.index = input.index;
    this.name2feature = _.keyBy(this.features, (f) => f.name);
  }

  public getFeatureDisc(name: string): Readonly<FeatureDisc> | undefined {
    return this.name2feature[name];
  }

  public getColumnDisc(name: string): Readonly<FeatureDisc> | undefined {
    if (this.target && name === this.target.name) return this.target;
    if (this.prediction && name === this.prediction.name) return this.prediction;
    return this.getFeatureDisc(name);
  }
}

export class Dataset {
  constructor(public dataFrame: IDataFrame, public dataMeta: DataMeta) {

  }
  public get target() {
    return this.dataFrame.columns[this.dataMeta.target.index];
  }

  public get prediction() {
    return this.dataMeta.prediction && this.dataFrame.columns[this.dataMeta.prediction.index];
  }

  public get features() {
    return this.dataMeta.features.map(f => this.dataFrame.columns[f.index]);
  }

  public get index(){
    return this.dataFrame.index;
  }

  public _reorderedDataFrame = memoize(() => {
    const columns = [this.target];
    if (this.prediction) columns.push(this.prediction);
    const df = DataFrame.fromColumns([...columns, ...this.features], this.index);
    console.debug(df);
    return df;
  })

  public get reorderedDataFrame() {
    return this._reorderedDataFrame();
  }

}

export default Dataset;