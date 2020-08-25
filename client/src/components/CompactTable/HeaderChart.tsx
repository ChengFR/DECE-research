import * as React from 'react';
import * as _ from "lodash";
import memoizeOne from "memoize-one";

import { shallowCompare, number2string, assert } from '../../common/utils';
import { IMargin } from '../visualization/common';
import Histogram from '../visualization/histogram';
import { getRowLabels, filterUndefined } from './common';
import BarChart from '../visualization/barchart';
import { TableColumn, isNumericalVColumn, CatTableColumn } from '../Table/common';
import SubsetCFHist, {ISubsetCFHistProps} from './SubsetCFHist'
import { ColumnSizer } from 'react-virtualized';

export interface IHeaderChartProps {
  width: number;
  height: number;
  margin: IMargin;
  column: TableColumn;
  allColumn: TableColumn;
  protoColumn?: TableColumn;
  groupByColumn?: Readonly<CatTableColumn>;
  protoColumnGroupBy?: Readonly<TableColumn>;
  cfFilter?: [number, number];
  style?: React.CSSProperties;
  className?: string;
  extent?: [number, number];
  onUpdateFilter?: (extent?: [number, number], categories?: string[]) => void;
  // displayMode?: 'by-class' | 'origin-cf';
  histogramType: 'side-by-side' | 'stacked';
  onSelect?: () => void;
}

export interface IHeaderChartState {
  hoveredBin: [number, number] | null;
}

export default class HeaderChart extends React.PureComponent<IHeaderChartProps, IHeaderChartState> {
  static defaultProps = { 
    width: 300,
    height: 200,
    margin: 0,
    innerPadding: 1,
    drawAxis: false,
    drawRange: true
  };

  constructor(props: IHeaderChartProps) {
    super(props);

    this.state = { hoveredBin: null };
    this.onHoverRange = this.onHoverRange.bind(this);
  }

  public render() {
    const { column, allColumn, className, style, width, height, margin} = this.props;
    const {hoveredBin} = this.state;


    if (isNumericalVColumn(column)) {
      return <SubsetCFHist 
        {...this.props as ISubsetCFHistProps}
      />
    }
    return (
      <BarChart
        data={column.series.toArray()}
        width={width}
        height={height}
        margin={margin}
        xScale={column.xScale}
        onSelectCategories={column.onFilter}
        selectedCategories={column.filter}
        allData={allColumn.series.toArray() as string[]}
      />
    );
  }

  validateCFs = memoizeOne(filterUndefined);
  validateAllCFs = memoizeOne(filterUndefined);

  _groupByArgs(): undefined | [number[], number[]] {
    const {groupByColumn} = this.props;
    return groupByColumn && getRowLabels(groupByColumn);
  }

  onHoverRange(hoveredBin?: [number, number]) {
    this.setState({hoveredBin: hoveredBin || null});
  };

}
