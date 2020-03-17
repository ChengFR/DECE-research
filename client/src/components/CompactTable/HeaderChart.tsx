import * as React from 'react';
import * as _ from "lodash";
import memoizeOne from "memoize-one";
import { isArray } from "util";

import { shallowCompare, number2string, assert } from '../../common/utils';
import { IMargin } from '../visualization/common';
import Histogram from '../visualization/histogram';
import { CFTableColumn, CFNumericalColumn, CFCategoricalColumn } from './common';
import BarChart from '../visualization/barchart';
import { isColumnNumerical } from '../../data/column';
import memoize from 'fast-memoize';
import { TableColumn, isNumericalVColumn } from '../Table/common';

function isArrays<T>(a:T[] | T[][]): a is T[][] {
  return a.length > 0 && isArray(a[0]);
}

function label2nums(labels: string[], categories?: string[]): [number[], number[]] {
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

const getRowLabels = memoize((c: TableColumn) => {
  assert(!isColumnNumerical(c));
  return label2nums(c.series.toArray(), c.categories);
});

const getAllRowLabels = memoize((c: TableColumn) => {
  assert(!isColumnNumerical(c));
  const prevSeries = c.prevSeries;
  return prevSeries && label2nums(prevSeries.toArray(), c.categories);
});

function filterUndefined<T>(series: (T | undefined)[]): T[] {
  return series.filter(c => c !== undefined) as T[];
}


export interface IHeaderChartProps {
  width: number;
  height: number;
  margin: IMargin;
  column: CFTableColumn;
  groupByColumn?: Readonly<CFTableColumn>;
  cfFilter?: [number, number];
  style?: React.CSSProperties;
  className?: string;
  extent?: [number, number];
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
    this.onMouseOverBin = this.onMouseOverBin.bind(this);
    this.onMouseOverBins = this.onMouseOverBins.bind(this);
    this.onMouseLeaveBin = this.onMouseLeaveBin.bind(this);
    this.onMouseLeaveBins = this.onMouseLeaveBins.bind(this);
  }

  public render() {
    const { column, groupByColumn, className, style, width, height, margin} = this.props;
    const {hoveredBin} = this.state;

    if (isNumericalVColumn(column)) {
      const groupArgs = groupByColumn && getRowLabels(groupByColumn);
      let data = groupArgs ? column.series.groupBy(...groupArgs) : column.series.toArray();
      const allGroupArgs = groupByColumn && getAllRowLabels(groupByColumn);
      const allData = column.prevSeries && (allGroupArgs ? column.prevSeries.groupBy(...allGroupArgs) : column.prevSeries.toArray());
      // console.log(column);
      if (column.cf) {
        const chartHeight = (height - 24)/2;
        return (
          <div className={className} style={style}>
            <Histogram 
              data={data}
              allData={allData}
              onSelectRange={column.onFilter}
              selectedRange={column.filter}
              xScale={column.xScale}
              width={width}
              height={chartHeight}
              margin={margin}
              extent={column.extent}
            />
            <Histogram 
              data={this.validateCFs(column.cf)}
              allData={column.allCF && this.validateCFs(column.allCF)}
              onSelectRange={column.onFilterCF}
              selectedRange={column.cfFilter}
              xScale={column.xScale}
              width={width}
              height={chartHeight}
              margin={margin}
              extent={column.extent}
            />
            <div className="info">
              {hoveredBin
                ? `${hoveredBin[0]} - ${hoveredBin[1]}`
                : (column.extent && `${number2string(column.extent[0],3)} - ${number2string(column.extent[1],3)}`)
              }
            </div>
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
          drawRange={true}
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

  validateCFs = memoizeOne(filterUndefined);
  validateAllCFs = memoizeOne(filterUndefined);

  _groupByArgs(): undefined | [number[], number[]] {
    const {groupByColumn} = this.props;
    return groupByColumn && getRowLabels(groupByColumn);
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
