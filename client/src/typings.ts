

export enum FeatureType {
  NUMERICAL = 'numerical',
  CATEGORICAL = 'categorical'
}

export interface FeatureDisc {
  name: string;
  description?: string;
  type: FeatureType;
}

export interface DataMeta {
  features: FeatureDisc[];
  target: FeatureDisc;
}