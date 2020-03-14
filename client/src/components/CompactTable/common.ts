import { TableColumn, CategoricalColumn, NumericalColumn } from '../Table/common';


interface CFColumn {

}

export interface CFCategoricalColumn extends CategoricalColumn {

};

export interface CFNumericalColumn extends NumericalColumn {

};

export type CFTableColumn = CFCategoricalColumn | CFNumericalColumn;