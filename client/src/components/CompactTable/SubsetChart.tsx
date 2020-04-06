import * as React from 'react';
import * as _ from "lodash";
import memoizeOne from "memoize-one";


import { shallowCompare, number2string, decile2precision, assert } from '../../common/utils';
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
  protoColumn?: CFTableColumn;
  groupByColumn?: Readonly<CFTableColumn>;
  protoColumnGroupBy?: Readonly<CFTableColumn>;
  cfFilter?: [number, number];
  style?: React.CSSProperties;
  className?: string;
  extent?: [number, number];
  onUpdateFilter?: (extent?: [number, number], categories?: string[]) => void;
  displayMode: 'by-class'|'origin-cf';
}

export interface IGroupChartState {
  selectedRange?: [number, number];
  selectedCats?: string[];
}

export default class SubsetChart extends React.PureComponent<ISubsetChartProps, IGroupChartState> {
  static defaultProps = {
    width: 300,
    height: 200,
    margin: 2,
    innerPadding: 1,
    drawAxis: false,
    drawRange: true,
  };

  constructor(props: ISubsetChartProps) {
    super(props);
    const {column} = this.props;
    if (isNumericalCFColumn(column))
      this.state = { selectedRange: column.dataRange };
    else 
      this.state = { selectedCats: column.categories};
    this.onHoverRange = this.onHoverRange.bind(this);
    this.onSelectRange = this.onSelectRange.bind(this);
  }

  public render() {
    const { column, protoColumn, groupByColumn, protoColumnGroupBy, className, style, width, height, margin, displayMode } = this.props;
    const { selectedRange: hoveredBin } = this.state;

    const groupArgs = groupByColumn && getRowLabels(groupByColumn);
    const allGroupArgs = groupByColumn && getAllRowLabels(groupByColumn);
    const protoGroupArgs = protoColumnGroupBy && protoColumn && getAllRowLabels(protoColumnGroupBy);

    if (groupArgs && groupArgs[1].length == 2) {
      const chartHeight = (height - 24) / 2;
      if (isNumericalCFColumn(column)) {
        const rawData = groupArgs ? column.series.groupBy(...groupArgs) : column.series.toArray();
        const cfData = column.cf && (groupArgs ? column.cf.groupBy(...groupArgs) : column.cf.toArray());

        const allRawData = column.prevSeries && (allGroupArgs ? column.prevSeries.groupBy(...allGroupArgs) : column.prevSeries.toArray());
        const allCFData = column.allCF && (groupArgs ? column.allCF.groupBy(...groupArgs) : column.allCF.toArray());

        const precision = decile2precision(Math.max.apply(null, column.series.toArray()), column.precision)

        // const dmcData = (protoGroupArgs && protoColumn && isNumericalCFColumn(protoColumn)) ?  protoColumn.series.groupBy(...protoGroupArgs): undefined;
        return <div className={className} style={style}>
          {/* {groupArgs[1].map((d, i) => */}
          <Histogram
            data={[rawData[0] as number[], cfData ? cfData[0] as number[] : []]}
            allData={allRawData && allCFData && [allRawData[0] as number[], allCFData[0] as number[]]}
            dmcData={protoColumn && protoColumn.series.toArray() as number[]}
            // onSelectRange={column.onFilter}
            onSelectRange={this.onSelectRange}
            // selectedRange={column.filter}
            // selectedRange={column.dataRange && column.dataRange}
            selectedRange={hoveredBin && hoveredBin as [number, number]}
            xScale={column.xScale}
            width={width}
            height={chartHeight}
            margin={margin}
            extent={column.extent}
            onHoverRange={this.onHoverRange}
            rangeSelector="as-a-whole"
            mode="stacked"
            // mode="side-by-side"
          />
          <Histogram
            data={[cfData ? cfData[1] as number[] : [], rawData[1] as number[]]}
            allData={allRawData && allCFData && [allCFData[1] as number[], allRawData[1] as number[]]}
            // dmcData={dmcData}
            dmcData={protoColumn && protoColumn.series.toArray() as number[]}
            // onSelectRange={column.onFilter}
            onSelectRange={this.onSelectRange}
            // selectedRange={column.filter}
            // selectedRange={column.dataRange && column.dataRange}
            selectedRange={hoveredBin && hoveredBin as [number, number]}
            xScale={column.xScale}
            width={width}
            height={chartHeight}
            margin={margin}
            extent={column.extent}
            onHoverRange={this.onHoverRange}
            rangeSelector="as-a-whole"
            mode="stacked"
          />
          <div className="info">
            {hoveredBin
              ? `${number2string(hoveredBin[0] as number, precision)} - ${number2string(hoveredBin[1] as number, precision)}`
              : (column.extent && `${number2string(column.extent[0], precision)} - ${number2string(column.extent[1], precision)}`)
            }
          </div>
          {/* )} */}
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
    const bin = this._checkBins(hoveredBin);
    this.setState({ selectedRange: bin || undefined });
  };

  onSelectRange(hoveredBin?: [number, number]) {
    const {onUpdateFilter} = this.props;
    const bin = this._checkBins(hoveredBin);
    onUpdateFilter && onUpdateFilter(bin);
    this.setState({ selectedRange: bin });
  };

  private _checkPrecision(num: number): number {
    const precision = this.props.column.precision;
    
    if (precision !== undefined) {
      num = Math.round((num + Number.EPSILON) * 10**precision) / (10**precision);
    }
    return num;
  }

  private _checkBins(bin?: [number, number]): [number, number]|undefined {
    if (bin) {
      return [this._checkPrecision(bin[0]), this._checkPrecision(bin[1])];
    }
    else return bin
  }

}
