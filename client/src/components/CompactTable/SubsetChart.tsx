import * as React from 'react';
import * as _ from "lodash";
import memoizeOne from "memoize-one";


import { shallowCompare, number2string, assert } from '../../common/utils';
import { IMargin } from '../visualization/common';
import Histogram, { HistogramLayout } from '../visualization/histogram';
import { CFNumericalColumn, CFCategoricalColumn, getRowLabels, getAllRowLabels, filterUndefined, CFTableColumn, isNumericalCFColumn } from './common';
import BarChart from '../visualization/barchart';
import { TableColumn, isNumericalVColumn } from '../Table/common';
import { ColumnSizer } from 'react-virtualized';

export interface ISubsetChartProps {
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

export interface IGroupChartState {
  hoveredBin: [number, number] | null;
}

export default class SubsetChart extends React.PureComponent<ISubsetChartProps, IGroupChartState> {
  static defaultProps = {
    width: 300,
    height: 200,
    margin: 2,
    innerPadding: 1,
    drawAxis: false,
    drawRange: true
  };

  constructor(props: ISubsetChartProps) {
    super(props);

    this.state = { hoveredBin: null };
    this.onHoverRange = this.onHoverRange.bind(this);
  }

  public render() {
    const { column, groupByColumn, className, style, width, height, margin } = this.props;
    const { hoveredBin } = this.state;

    const groupArgs = groupByColumn && getRowLabels(groupByColumn);
    const allGroupArgs = groupByColumn && getAllRowLabels(groupByColumn);

    if (groupArgs && groupArgs[1].length == 2) {
      const chartHeight = (height - 24) / groupArgs[1].length;
      if (isNumericalCFColumn(column)) {
        const rawData = groupArgs ? column.series.groupBy(...groupArgs) : column.series.toArray();
        const cfData = column.cf && (groupArgs ? column.cf.groupBy(...groupArgs) : column.cf.toArray());
        // const data = cfData ? groupArgs[1].map((d, i) => [rawData[i] as number[], cfData[1-i] as number[]]) : groupArgs[1].map((d, i) => [rawData[i] as number[], []]);
        const data = cfData ? [[rawData[0] as number[], cfData[1] as number[]], [cfData[0] as number[], rawData[1] as number[]]] : [rawData[0] as number[], rawData[1] as number[]];

        const allRawData = column.prevSeries && (allGroupArgs ? column.prevSeries.groupBy(...allGroupArgs) : column.prevSeries.toArray());
        const allCFData = column.allCF && (groupArgs ? column.allCF.groupBy(...groupArgs) : column.allCF.toArray());
        // const allData = allRawData && allCFData && groupArgs[1].map((d, i) => [allRawData[1-i] as number[], allCFData[i] as number[]]);
        const allData = allRawData && allCFData && [[allRawData[0] as number[], allCFData[1] as number[]], [allCFData[0] as number[], allRawData[1] as number[]]];

        return <div className={className} style={style}>
          {groupArgs[1].map((d, i) =>
            <Histogram
              data={data[i]}
              allData={allData && allData[i]}
              onSelectRange={column.onFilter}
              selectedRange={column.filter}
              xScale={column.xScale}
              width={width}
              height={chartHeight}
              margin={margin}
              extent={column.extent}
              onHoverRange={this.onHoverRange}
              key={i}
            />
            )}
        </div>
      }
      else {
        const rawData = groupArgs ? column.series.groupBy(...groupArgs) : column.series.toArray();
        const cfData = column.cf && (groupArgs ? column.cf.groupBy(...groupArgs) : column.cf.toArray());
        const data = cfData ? [[rawData[0] as string[], cfData[1] as string[]], [cfData[0] as string[], rawData[1] as string[]]] : [rawData[0] as string[], rawData[1] as string[]];

        const allRawData = column.prevSeries && (allGroupArgs ? column.prevSeries.groupBy(...allGroupArgs) : column.prevSeries.toArray());
        const allCFData = column.allCF && (groupArgs ? column.allCF.groupBy(...groupArgs) : column.allCF.toArray());
        // const allData = allRawData && allCFData && groupArgs[1].map((d, i) => [allRawData[1-i] as number[], allCFData[i] as number[]]);
        const allData = allRawData && allCFData && [[allRawData[0] as string[], allCFData[1] as string[]], [allCFData[0] as string[], allRawData[1] as string[]]];


        return <div className={className} style={style}>
          {groupArgs[1].map((d, i) =>
            <BarChart
              data={data[i]}
              allData={allData && allData[i]}
              xScale={column.xScale}
              width={width}
              height={chartHeight}
              margin={margin}
              onSelectCategories={column.onFilter}
              selectedCategories={column.filter}
              key={i}
            />
            )}
        </div>
      }
    }
    else {

    if (isNumericalVColumn(column)) {
      const groupArgs = groupByColumn && getRowLabels(groupByColumn);
      const data = groupArgs ? column.series.groupBy(...groupArgs) : column.series.toArray();
      const cfData = column.cf && (groupArgs ? column.cf.groupBy(...groupArgs) : column.cf.toArray());
      const allGroupArgs = groupByColumn && getAllRowLabels(groupByColumn);
      const allData = column.prevSeries && (allGroupArgs ? column.prevSeries.groupBy(...allGroupArgs) : column.prevSeries.toArray());
      const allCFData = column.allCF && (groupArgs ? column.allCF.groupBy(...groupArgs) : column.allCF.toArray());
      // console.log(column);
      if (column.cf) {
        const chartHeight = (height - 24) / 2;
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
              onHoverRange={this.onHoverRange}
            />
            <Histogram
              // data={this.validateCFs(column.cf.toArray()) as number[]}
              // allData={column.allCF && this.validateAllCFs(column.allCF.toArray()) as number[]}
              data={cfData as number[] | number[][]}
              allData={allCFData as number[] | number[][]}
              onSelectRange={column.onFilterCF}
              selectedRange={column.cfFilter}
              xScale={column.xScale}
              width={width}
              height={chartHeight}
              margin={margin}
              extent={column.extent}
              onHoverRange={this.onHoverRange}
            />
            <div className="info">
              {hoveredBin
                ? `${hoveredBin[0]} - ${hoveredBin[1]}`
                : (column.extent && `${number2string(column.extent[0], 3)} - ${number2string(column.extent[1], 3)}`)
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
  }

  validateCFs = memoizeOne(filterUndefined);
  validateAllCFs = memoizeOne(filterUndefined);

  _groupByArgs(): undefined | [number[], number[]] {
    const { groupByColumn } = this.props;
    return groupByColumn && getRowLabels(groupByColumn);
  }

  onHoverRange(hoveredBin?: [number, number]) {
    this.setState({ hoveredBin: hoveredBin || null });
  };

}
