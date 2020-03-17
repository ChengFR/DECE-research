import * as _ from "lodash";
import {
  TableColumn,
  CategoricalColumn,
  NumericalColumn
} from "../Table/common";
import DataFrame from "../../data/data_table";
import { assert } from "../../common/utils";
import { isColumnNumerical } from '../../data/column';
import { isNumericalVColumn } from '../Table/common';

interface CFColumn {}

export interface CFCategoricalColumn extends CategoricalColumn {
  cf?: (string | undefined)[];
  allCF?: (string | undefined)[];
  cfFilter?: string[];
  onFilterCF?: (range?: string[]) => any;
}

export interface CFNumericalColumn extends NumericalColumn {
  cf?: (number | undefined)[];
  allCF?: (number | undefined)[];
  cfFilter?: [number, number];
  onFilterCF?: (range?: [number, number]) => any;
}

export type CFTableColumn = CFCategoricalColumn | CFNumericalColumn;

export function filterByColumnStates(
  dataFrame: DataFrame,
  columns: CFTableColumn[]
) {
  let filteredLocs = _.range(0, dataFrame.length);
  columns.forEach((column, c) => {
    const dfColumn = dataFrame.columns[c];
    assert(
      column.name === dfColumn.name,
      `The ${c}th column "${column.name}" does not match the ${c}th column "${dfColumn.name}" in the dataFrame!`
    );
    console.log()
    if (!isColumnNumerical(dfColumn)) {
      assert(!isNumericalVColumn(column), "column type mismatch");
      const {filter, cfFilter, allCF, prevSeries} = column;
      if (filter) {
        const at = dfColumn.series.at;
        const kept = new Set(filter as string[]);
        filteredLocs = filteredLocs.filter(i => kept.has(at(i)));
      }
      if (cfFilter && allCF) {
        if (prevSeries)
          assert(prevSeries.length === dfColumn.series.length, "this should not happen");
        const kept = new Set(cfFilter as string[]);
        filteredLocs = filteredLocs.filter(i => allCF[i] !== undefined && kept.has(allCF[i]!));
      }
    } else {
      assert(isNumericalVColumn(column), "column type mismatch");
      const {filter, cfFilter, allCF, prevSeries} = column;
      if (filter) {
        const at = dfColumn.series.at;
        filteredLocs = filteredLocs.filter(
          i => filter[0] <= at(i) && at(i) < filter[1]
        );
      }
      if (cfFilter && allCF) {
        if (prevSeries)
          assert(prevSeries.length === dfColumn.series.length, "this should not happen");
        filteredLocs = filteredLocs.filter(
          i => {
            const v = allCF[i];
            return v !== undefined && cfFilter[0] <= v && v < cfFilter[1];
          }
        );
      }
    }
  });

  return dataFrame.filterByLoc(filteredLocs);
}
