import { TableColumn, CategoricalColumn, NumericalColumn } from '../Table/common';

interface CFColumn {

}

export interface CFCategoricalColumn extends CategoricalColumn {
  cf?: (string | undefined)[];
  allCF?: (string | undefined)[];
  cfFilter?: string[];
  onFilterCF?: (range?: string[]) => any;
};

export interface CFNumericalColumn extends NumericalColumn {
  cf?: (number | undefined)[];
  allCF?: (number | undefined)[];
  cfFilter?: [number, number];
  onFilterCF?: (range?: [number, number]) => any;
};

export type CFTableColumn = CFCategoricalColumn | CFNumericalColumn;