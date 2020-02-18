import memoize from 'fast-memoize';
import { IColumn } from '../../data/column';

export const getFixedGridWidth = memoize((fixedColumns: number, columns: TableColumn[]): number => {
  let width = 0;
  for (let index = 0; index < fixedColumns; index++) {
    width += columns[index].width;
  }
  return width;
});

export const IndexWidth = 25;


export const defaultChartMargin = {
  left: 10,
  right: 10,
  top: 2,
  bottom: 2,
};

export interface CategoricalColumn extends IColumn<string> {
  type: 'categorical';
  width: number;
  xScale: d3.ScaleBand<string>;
}

export interface NumericalColumn extends IColumn<number> {
  type: 'numerical';
  width: number;
  xScale: d3.ScaleLinear<number, number>;
}

export type TableColumn = CategoricalColumn | NumericalColumn;