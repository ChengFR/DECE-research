export enum FeatureType {
  Unknown = 'unknown',
  String = 'string',
  Int = 'int',
  Float = 'float',
}

export interface BaseColumn {
  name: string;
  type: FeatureType;
}

export interface StringColumn extends BaseColumn {
  featureType: FeatureType.String,
  categories: string[];
}

export interface IntColumn extends BaseColumn {
  featureType: FeatureType.Int,
  min?: number;
  max?: number;
}

export interface FloatColumn extends BaseColumn {
  featureType: FeatureType.Float,
  min?: number;
  max?: number;
}

export type Column = StringColumn | FloatColumn | IntColumn;