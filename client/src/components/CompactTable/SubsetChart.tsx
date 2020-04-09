import * as React from 'react';
import * as _ from "lodash";
import memoizeOne from "memoize-one";


import { shallowCompare, number2string, decile2precision, assert } from '../../common/utils';
import { IMargin, defaultCategoricalColor } from '../visualization/common';
import Histogram, { } from '../visualization/histogram';
import { CFNumericalColumn, CFCategoricalColumn, getRowLabels, getAllRowLabels, filterUndefined, CFTableColumn, isNumericalCFColumn } from './common';
import BarChart from '../visualization/barchart';
import SubsetCFHist, {ISubsetCFHistProps, ISubsetCFHistState} from './SubsetCFHist'

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
  displayMode: 'by-class' | 'origin-cf';
  histogramType: 'side-by-side' | 'stacked';
  onSelect?: () => void;
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
    const { column } = this.props;
    if (isNumericalCFColumn(column))
      this.state = { selectedRange: column.dataRange };
    else
      this.state = { selectedCats: column.categories };
    this.onHoverRange = this.onHoverRange.bind(this);
    this.onSelectRange = this.onSelectRange.bind(this);
  }

  public render() {
    const { column, protoColumn, groupByColumn, protoColumnGroupBy, className, style, width, height, margin, displayMode, histogramType } = this.props;
    const { selectedRange: hoveredBin } = this.state;

    const groupArgs = groupByColumn && getRowLabels(groupByColumn);
    const allGroupArgs = groupByColumn && getAllRowLabels(groupByColumn);
    const protoGroupArgs = protoColumnGroupBy && protoColumn && getAllRowLabels(protoColumnGroupBy);

    const validFilter = column.valid && ((idx: number) => column.valid![idx]);

    if (groupArgs) {
      const chartHeight = (height - 24) / 2;
        if (isNumericalCFColumn(column)) {
          const rawData = column.series.groupBy(...groupArgs);
          const cfData = column.cf && (groupArgs ? column.cf.groupBy(groupArgs[0], groupArgs[1], validFilter) : column.cf.toArray());

          const allRawData = column.prevSeries && (allGroupArgs ? column.prevSeries.groupBy(...allGroupArgs) : column.prevSeries.toArray());
          const allCFData = column.allCF && (groupArgs ? column.allCF.groupBy(groupArgs[0], groupArgs[1], validFilter) : column.allCF.toArray());

          const precision = decile2precision(Math.max.apply(null, column.series.toArray()), column.precision)

          console.log(column.valid?.filter(d => !d));
          console.log(rawData);

          return displayMode === 'origin-cf' ? <div className={className} style={style}>
            {/* <Histogram
              data={rawData}
              allData={allRawData}
              dmcData={protoColumn && protoColumn.series.toArray() as number[]}
              onSelectRange={this.onSelectRange}
              selectedRange={hoveredBin && hoveredBin as [number, number]}
              xScale={column.xScale}
              width={width}
              height={chartHeight}
              margin={margin}
              extent={column.extent}
              onHoverRange={this.onHoverRange}
              style={{ "marginTop": 4 }}
              rangeSelector="as-a-whole"
              mode={histogramType}
              drawAxis={true}
            />
            {cfData && <Histogram
              data={cfData}
              allData={allCFData}
              dmcData={protoColumn && protoColumn.series.toArray() as number[]}
              xScale={column.xScale}
              width={width}
              height={chartHeight}
              margin={margin}
              extent={column.extent}
              onHoverRange={this.onHoverRange}
              mode={histogramType}
              direction='down'
              color={i => defaultCategoricalColor(i ^ 1)}
              
            />
            } */}
            <SubsetCFHist 
              {...this.props as ISubsetCFHistProps}
            />
            <div className="info">
              {hoveredBin
                ? `${number2string(hoveredBin[0] as number, precision)} - ${number2string(hoveredBin[1] as number, precision)}`
                : (column.extent && `${number2string(column.extent[0], precision)} - ${number2string(column.extent[1], precision)}`)
              }
            </div>
          </div> :
            <div className={className} style={style}>
              <Histogram
                data={[rawData[0] as number[], cfData ? cfData[0] as number[] : []]}
                allData={allRawData && allCFData && [allRawData[0] as number[], allCFData[0] as number[]]}
                dmcData={protoColumn && protoColumn.series.toArray() as number[]}
                onSelectRange={this.onSelectRange}
                selectedRange={hoveredBin && hoveredBin as [number, number]}
                xScale={column.xScale}
                width={width}
                height={chartHeight}
                margin={margin}
                extent={column.extent}
                onHoverRange={this.onHoverRange}
                rangeSelector="as-a-whole"
                mode={histogramType}
                style={{ "marginTop": 4 }}
              />
              <Histogram
                data={[cfData ? cfData[1] as number[] : [], rawData[1] as number[]]}
                allData={allRawData && allCFData && [allCFData[1] as number[], allRawData[1] as number[]]}
                dmcData={protoColumn && protoColumn.series.toArray() as number[]}
                onSelectRange={this.onSelectRange}
                selectedRange={hoveredBin && hoveredBin as [number, number]}
                xScale={column.xScale}
                width={width}
                height={chartHeight}
                margin={margin}
                extent={column.extent}
                onHoverRange={this.onHoverRange}
                rangeSelector="as-a-whole"
                mode={histogramType}
                direction='down'
                style={{ "marginTop": 4 }}
              />
              <div className="info">
                {hoveredBin
                  ? `${number2string(hoveredBin[0] as number, precision)} - ${number2string(hoveredBin[1] as number, precision)}`
                  : (column.extent && `${number2string(column.extent[0], precision)} - ${number2string(column.extent[1], precision)}`)
                }
              </div>
            </div>
        }
        else {
          const rawData = column.series.groupBy(...groupArgs);
          const cfData = column.cf && (groupArgs ? column.cf.groupBy(...groupArgs) : column.cf.toArray());

          const allRawData = column.prevSeries && (allGroupArgs ? column.prevSeries.groupBy(...allGroupArgs) : column.prevSeries.toArray());
          const allCFData = column.allCF && (groupArgs ? column.allCF.groupBy(...groupArgs) : column.allCF.toArray());


          return (displayMode === 'origin-cf')? <div className={className} style={style}>
            <BarChart
              data={rawData}
              allData={allRawData}
              xScale={column.xScale}
              width={width}
              height={chartHeight}
              margin={margin}
              onSelectCategories={column.onFilter}
              selectedCategories={column.filter}
              style={{ "marginTop": 4 }}
            />
            {cfData &&
              <BarChart
                data={cfData}
                allData={allCFData}
                xScale={column.xScale}
                width={width}
                height={chartHeight}
                margin={margin}
                onSelectCategories={column.onFilter}
                selectedCategories={column.filter}
                color={i => defaultCategoricalColor(i ^ 1)}
              />
            }
          </div> : 
          <div className={className} style={style}>
            <BarChart
              data={[rawData[0] as string[], cfData ? cfData[0] as string[] : []]}
              allData={allRawData && allCFData && [allRawData[0] as string[], allCFData[0] as string[]]}
              xScale={column.xScale}
              width={width}
              height={chartHeight}
              margin={margin}
              onSelectCategories={column.onFilter}
              selectedCategories={column.filter}
            />
            <BarChart
              data={[rawData[1] as string[], cfData ? cfData[1] as string[] : []]}
              allData={allRawData && allCFData && [allRawData[1] as string[], allCFData[1] as string[]]}
              xScale={column.xScale}
              width={width}
              height={chartHeight}
              margin={margin}
              onSelectCategories={column.onFilter}
              selectedCategories={column.filter}
            />
          )}
        </div>
        }
    }
    else return <div />

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
    const { onUpdateFilter, onSelect } = this.props;
    const bin = this._checkBins(hoveredBin);
    onUpdateFilter && onUpdateFilter(bin);
    onSelect && onSelect();
    this.setState({ selectedRange: bin });
  };

  private _checkPrecision(num: number): number {
    const precision = this.props.column.precision;

    if (precision !== undefined) {
      num = Math.round((num + Number.EPSILON) * 10 ** precision) / (10 ** precision);
    }
    return num;
  }

  private _checkBins(bin?: [number, number]): [number, number] | undefined {
    if (bin) {
      return [this._checkPrecision(bin[0]), this._checkPrecision(bin[1])];
    }
    else return bin
  }

}
