import memoize from "fast-memoize";
import { IColumn, isColumnNumerical, ISeries, ICatColumn, INumColumn } from 'data';
import { getScaleLinear, getScaleBand } from "../visualization/common";
import { getTextWidth } from '../../common/utils';

export const getFixedGridWidth = memoize(
  (fixedColumns: number, columns: VColumn[]): number => {
    let width = 0;
    for (let index = 0; index < fixedColumns; index++) {
      width += columns[index].width;
    }
    return width;
  }
);

export const IndexWidth = 25;

// export interface VColumn<T> {
//   onChangeColumnWidth?: (width: number) => any;
//   prevSeries?: ISeries<T>;
// }

export interface VNumColumn {
  type: "numerical"
  width: number;
  onChangeColumnWidth?: (width: number) => any;
  xScale: d3.ScaleLinear<number, number>;
  // prevSeries?: ISeries<number>;
}

export interface VCatColumn {
  type: "categorical"
  width: number;
  onChangeColumnWidth?: (width: number) => any;
  xScale: d3.ScaleBand<string>;
  // prevSeries?: ISeries<string>;
}

export interface NumTableColumn extends VNumColumn, INumColumn {}

export interface CatTableColumn extends VCatColumn, ICatColumn {}

export type VColumn = VNumColumn | VCatColumn;

export type TableColumn = CatTableColumn | NumTableColumn;

export const columnMargin = {
  left: 8,
  right: 8,
  top: 0,
  bottom: 0,
};

export function isNumericalVColumn(
  column: VCatColumn | VNumColumn
): column is VNumColumn {
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