import * as _ from "lodash";
import {
  TableColumn,
  CatTableColumn,
  NumTableColumn
} from "../Table/common";

import { isArray } from "util";
import { IMargin } from "components/visualization/common";

export function isArrays<T>(a: T[] | T[][]): a is T[][] {
  return a.length > 0 && isArray(a[0]);
}

export function label2nums(labels: string[], categories?: Readonly<string[]>): [number[], number[]] {
  const cat2idx: Map<string, number> = new Map();
  categories?.map((c, i) => cat2idx.set(c, i));
  const nums = labels.map(v => {
    if (!(cat2idx.has(v))) cat2idx.set(v, cat2idx.size);
    return cat2idx.get(v) as number;
  });
  const uniqNums: number[] = [];
  cat2idx.forEach((v, k) => uniqNums.push(v));
  return [nums, uniqNums];
}

// export const getRowLabels = memoize((c: TableColumn) => {
//   assert(!isColumnNumerical(c));
//   return label2nums(c.series.toArray(), c.categories);
// }, {
//   serializer: (args: any) => {
//     const c = args as TableColumn;
//     return `${c.name}${JSON.stringify(c.filter)}${c.series.length}`;
//   }
// });

export function getRowLabels(c: CatTableColumn){
  return label2nums(c.series.toArray(), c.categories);
}

export function filterUndefined<T>(series: (T | undefined)[]): T[] {
  return series.filter(c => c !== undefined) as T[];
}

export interface FeatureColumnProps {
  width: number;
  // height: number;
  histHeight: number;
  margin: IMargin;
  style?: React.CSSProperties;
  className?: string;
  k: string;

  column: TableColumn;
  CFColumn: TableColumn;
  validFilter: (id: number) => boolean;
  protoColumn?: TableColumn;
  labelColumn: Readonly<CatTableColumn>;

  focusedCategory?: number;
  color?: (x: number) => string;
}

export interface SankeyBins<T> {
  x00: T,
  x01: T,
  x10: T,
  x11: T,
  count: number,
  topTotalCounts?: number,
  bottomTotalCounts?: number,
  topPrevCounts?: number,
  bottomPrevCounts?: number,
  catTopTotalCount?: number,
  catBottomTotalCount?: number,
  value?: T[]
}

