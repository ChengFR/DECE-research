import * as React from 'react';
import * as _ from "lodash";
import memoizeOne from "memoize-one";
import { isArray } from "util";

import { IHistogramOptions, IGHistogramOptions, drawGroupedHistogram, drawHistogram } from '../visualization/histogram';
import { shallowCompare, number2string } from '../../common/utils';
import { getScaleLinear, getMargin, IMargin } from '../visualization/common';
import Histogram from '../visualization/histogram';
import { TableColumn } from './common';
import BarChart from '../visualization/barchart';

function isArrays<T>(a:T[] | T[][]): a is T[][] {
  return a.length > 0 && isArray(a[0]);
}

export interface IHeaderChartProps {
  width: number;
  height: number;
  margin: IMargin;
  column: TableColumn;
  groupByArgs?: [number[], number[]];
  cf?: number[] | number[][];
  allCF?: number[] | number[][];
  cfFilter?: [number, number];
  style?: React.CSSProperties;
  className?: string;
  extent?: [number, number];
}

export interface IHeaderChartState {
  hoveredBin: [number, number] | null;
}

const defaultProps = {
  width: 300,
  height: 200,
  margin: 0,
  innerPadding: 1,
  drawAxis: false,
  drawRange: true
}

export default class HeaderChart extends React.PureComponent<IHeaderChartProps, IHeaderChartState> {
  static defaultProps = { ...defaultProps };
  private svgRef: React.RefObject<SVGSVGElement> = React.createRef();
  private shouldPaint: boolean = false;

  constructor(props: IHeaderChartProps) {
    super(props);

    this.state = { hoveredBin: null };
    this.onMouseOverBin = this.onMouseOverBin.bind(this);
    this.onMouseOverBins = this.onMouseOverBins.bind(this);
    this.onMouseLeaveBin = this.onMouseLeaveBin.bind(this);
    this.onMouseLeaveBins = this.onMouseLeaveBins.bind(this);
  }

  public render() {
    const { column, groupByArgs, cf, allCF, className, style, width, height, margin} = this.props;
    
    if (column.type === 'numerical') {
      let data = groupByArgs ? column.series.groupBy(...groupByArgs) : column.series.toArray();
      const allData = column.prevSeries && (groupByArgs ? column.prevSeries.groupBy(...groupByArgs) : column.prevSeries.toArray());
      if (cf) {
        return (
          <div className={className} style={style}>
            <Histogram 
              data={data}
              allData={allData}
              onSelectRange={column.onFilter}
              selectedRange={column.filter}
              xScale={column.xScale}
              width={width}
              height={height/2}
              margin={margin}
              extent={column.extent}
            />
    
          </div>
        );
      }
      return (
        <Histogram 
          data={data}
          allData={allData}
          onSelectRange={column.onFilter}
          selectedRange={column.filter}
          xScale={column.xScale}
          width={width}
          height={height}
          margin={margin}
          extent={column.extent}
          drawRange
        />
      );
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
        allData={column.prevSeries?.toArray()}
      />
    );
  }

  onMouseOverBin: d3.ValueFn<any, d3.Bin<number, number>, void> = (
    data,
    index
  ) => {
    const { x0, x1 } = data;
    this.setState({
      hoveredBin: [
        x0 === undefined ? -Infinity : x0,
        x1 === undefined ? Infinity : x1
      ]
    });
  };

  onMouseOverBins: d3.ValueFn<any, d3.Bin<number, number>[], void> = (
    data,
    index
  ) => {
    // console.log(data);
    const { x0, x1 } = data[0];
    this.setState({
      hoveredBin: [
        x0 === undefined ? -Infinity : x0,
        x1 === undefined ? Infinity : x1
      ]
    });
  };

  onMouseLeaveBin: d3.ValueFn<any, d3.Bin<number, number>, void> = (
    data,
    index
  ) => {
    this.setState({ hoveredBin: null });
  };

  onMouseLeaveBins: d3.ValueFn<any, d3.Bin<number, number>[], void> = (
    data,
    index
  ) => {
    this.setState({ hoveredBin: null });
  };
}
