import * as _ from 'lodash';
import IDataFrame from './data_table';
import { FeatureType } from './column';

export interface FeatureDisc {
  name: string;
  description?: string;
  type: FeatureType;
}

export class DataMeta {
  private name2feature: {[k: string]: FeatureDisc};
  constructor(public features: FeatureDisc[], public target: FeatureDisc ) {
    this.name2feature = _.keyBy(features, (f) => f.name);
  }

  public getFeatureDisc(name: string): Readonly<FeatureDisc> | undefined {
    return this.name2feature[name];
  }

  public getColumnDisc(name: string): Readonly<FeatureDisc> | undefined {
    if (name === this.target.name) return this.target;
    return this.getFeatureDisc(name);
  }
}

export class Dataset {
  constructor(public dataFrame: IDataFrame, public dataMeta: DataMeta) {

  }
}

export default Dataset;