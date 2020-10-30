import * as _ from 'lodash';
import IDataFrame from './data_table';
import { FeatureType } from './column';
import memoize from 'fast-memoize';
import DataFrame from './data_table';
import { max } from 'd3';

// export interface FeatureDisc {
//   name: string;
//   description?: string;
//   type: FeatureType;
//   index: number;
//   categories?: string[];
//   extent?: [number, number];
//   min?: number,
//   max?: number,
//   precision?: number
// }

export interface BasicFeatureDisc {
  name: string;
  description?: string;
  type: FeatureType;
  index: number;
}

export interface NumFeatureDisc extends BasicFeatureDisc{
  extent: [number, number];
  precision: number;
}

export interface CatFeatureDisc extends BasicFeatureDisc{
  categories: string[];
}

export type FeatureDisc = NumFeatureDisc | CatFeatureDisc;

export function isNumericalFeature(featureDisc: FeatureDisc): featureDisc is NumFeatureDisc{
  return featureDisc.type === 'numerical';
}

function validateFeatureDisc(disc: FeatureDisc): FeatureDisc {
  if (!isNumericalFeature(disc)) {
    disc.categories = disc.categories.map(c => String(c));
  }
  return disc;
}

export interface DataMetaInput {
    features: FeatureDisc[];
    target: FeatureDisc;
    prediction?: FeatureDisc;
    index?: FeatureDisc;
}

export class DataMeta {
  private name2feature: {[k: string]: Readonly<FeatureDisc>};
  public features: FeatureDisc[];
  public target?: FeatureDisc;
  public prediction?: FeatureDisc;
  // add index attribute
  public index?: FeatureDisc;
  constructor(input: DataMetaInput) {
    this.features = input.features.map(f => validateFeatureDisc(f));
    this.target = input.target?validateFeatureDisc(input.target):undefined;
    this.prediction = input.prediction?validateFeatureDisc(input.prediction):undefined;;
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

  public get maxIndex(): number{
    const index =[...this.features.map(d => d.index), this.target?this.target.index:0, 
      this.prediction?this.prediction.index:0, this.index?this.index.index:0];
    return max(index) || 0;
  }
}

export class Dataset {
  constructor(public dataFrame: IDataFrame, public dataMeta: DataMeta) {

  }
  public get target() {
    return this.dataMeta.target && this.dataFrame.columns[this.dataMeta.target.index];
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
    const order = this.order;
    const columns = order.map(name => this.dataFrame.getColumnByName(name));
    const df = DataFrame.fromColumns([...columns], this.index);
    return df
  })

  public get reorderedDataFrame() {
    return this._reorderedDataFrame();
  }

  public get order() {
    const order: string[] = [];
    if (this.target) order.push(this.target.name);
    if (this.prediction) order.push(this.prediction.name);
    this.features.forEach(d => order.push(d.name))
    return order;
  }

}

export default Dataset;