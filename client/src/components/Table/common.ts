import memoize from "fast-memoize";
import { IColumn, isColumnNumerical, ISeries, ICatColumn, INumColumn, FeatureDisc, isNumericalFeature } from 'data';
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

export interface VNumColumn {
  type: "numerical"
  width: number;
  onChangeColumnWidth?: (width: number) => any;
  extent: [number, number];
  xScale: d3.ScaleLinear<number, number>;
  // prevSeries?: ISeries<number>;
}

export interface VCatColumn {
  type: "categorical"
  width: number;
  onChangeColumnWidth?: (width: number) => any;
  categories: Readonly<string[]>;
  xScale: d3.ScaleBand<string>;
  // prevSeries?: ISeries<string>;
}

export interface NumTableColumn extends VNumColumn, INumColumn { }

export interface CatTableColumn extends VCatColumn, ICatColumn { }

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

export function infuseCol(vcol: VColumn, icol: IColumn): TableColumn {
  if (isNumericalVColumn(vcol) && isColumnNumerical(icol)) {
    const { type, width, onChangeColumnWidth, extent, xScale } = vcol;
    const { name, description, series, precision, sorted, onSort, filter, onFilter } = icol;

    return {
      name, description, type, width, onChangeColumnWidth, extent,
      xScale, series, precision, sorted, onSort, filter, onFilter
    };
  }
  else if (!isNumericalVColumn(vcol) && !isColumnNumerical(icol)) {
    const { type, width, onChangeColumnWidth, categories, xScale } = vcol;
    const { name, description, series, precision, sorted, onSort, filter, onFilter } = icol;

    return {
      name, description, type, width, onChangeColumnWidth, categories,
      xScale, series, precision, sorted, onSort, filter, onFilter
    };
  }
  else {
    throw "The type of the column and the column style should be consistent.";
  }
}

export function changeColumnWidth(column: VColumn, width: number) {
  if (width === column.width) return column;
  const chartWidth = width - columnMargin.left - columnMargin.right;
  if (isNumericalVColumn(column)) {
    return {
      ...column,
      width,
      xScale: getScaleLinear(0, chartWidth, undefined, column.extent)
    };
  }
  else
    return { 
      ...column, 
      width, 
      xScale: getScaleBand(0, chartWidth, undefined, column.categories) 
    };
}

export function initColumnWidth(
  column: string,
  padding: number = 10,
  minWidth: number = 40,
  maxWidth: number = 120
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
      xScale: memoizedScaleLinear(0, chartWidth, column.series.toArray(), column.extent)
    };
  return {
    ...column,
    width,
    xScale: memoizedScaleBand(0, chartWidth, column.series.toArray(), column.categories)
  };
}

export function createVColumn(feat: FeatureDisc): VColumn {
  const width = initColumnWidth(feat.name);
  const chartWidth = width - columnMargin.left - columnMargin.right;
  if (isNumericalFeature(feat)) {
    const col = {
      ...feat, width, type: "numerical",
      xScale: memoizedScaleLinear(0, chartWidth, undefined, feat.extent)
    } as VNumColumn;
    return col;
  }
  else {
    const col = {
      ...feat, width, type: "categorical",
      xScale: memoizedScaleBand(0, chartWidth, undefined, feat.categories)
    } as VCatColumn;
    return col;
  }
}