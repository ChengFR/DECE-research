import memoize from "fast-memoize";
import { IColumn, isColumnNumerical, ISeries, ICatColumn, INumColumn } from 'data';
import { getScaleLinear, getScaleBand } from "../visualization/common";
import { getTextWidth } from '../../common/utils';

export const getFixedGridWidth = memoize(
  (fixedColumns: number, columns: TableColumn[]): number => {
    let width = 0;
    for (let index = 0; index < fixedColumns; index++) {
      width += columns[index].width;
    }
    return width;
  }
);

export const IndexWidth = 25;

export interface VColumn<T> {
  onSort?: (order: "descend" | "ascend") => any;
  sorted?: 'descend' | 'ascend' | null;
  onChangeColumnWidth?: (width: number) => any;
  prevSeries?: ISeries<T>;
}

export interface CategoricalColumn extends VColumn<string>, ICatColumn{
  type: "categorical";
  width: number;
  xScale: d3.ScaleBand<string>;
  filter?: string[];
  onFilter?: (filters?: string[]) => any;
}

export interface NumericalColumn extends VColumn<number>, INumColumn {
  type: "numerical";
  width: number;
  xScale: d3.ScaleLinear<number, number>;
  filter?: [number, number];
  onFilter?: (filter?: [number, number]) => any;
}

export type TableColumn = CategoricalColumn | NumericalColumn;

export const columnMargin = {
  left: 8,
  right: 8,
  top: 0,
  bottom: 0,
};

export function isNumericalVColumn(
  column: CategoricalColumn | NumericalColumn
): column is NumericalColumn {
  return column.type === "numerical";
}

export function changeColumnWidth(column: TableColumn, width: number) {
  if (width === column.width) return column;
  const chartWidth = width - columnMargin.left - columnMargin.right
  if (isNumericalVColumn(column)) {
    return {
      ...column,
      width,
      xScale: getScaleLinear(column.series.toArray(), 0, chartWidth, column.extent)
    };
  }
  else
    return {...column, width, xScale: getScaleBand(column.series.toArray(), 0, chartWidth, column.categories)};
}

export function initColumnWidth(
  column: string,
  padding: number = 10,
  minWidth: number = 40,
  maxWidth: number = 100
) {
  return Math.min(
    Math.max(minWidth, Math.ceil(getTextWidth(column) + 2 * padding)),
    maxWidth
  );
}

const memoizedScaleLinear = memoize(getScaleLinear);
const memoizedScaleBand = memoize(getScaleBand);

export function createColumn(column: IColumn | TableColumn): TableColumn {
  const width = "width" in column ? column.width : initColumnWidth(column.name);
  const chartWidth = width - columnMargin.left - columnMargin.right;
  if (isColumnNumerical(column))
    return {
      ...column,
      width,
      xScale: memoizedScaleLinear(column.series.toArray(), 0, chartWidth, column.extent)
    };
  return {
    ...column,
    width,
    xScale: memoizedScaleBand(column.series.toArray(), 0, chartWidth, column.categories)
  };
}