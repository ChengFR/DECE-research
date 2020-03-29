import * as React from 'react';
import * as _ from "lodash";
import memoizeOne from "memoize-one";


import { shallowCompare, number2string, assert } from '../../common/utils';
import { IMargin } from '../visualization/common';
import Histogram from '../visualization/histogram';
import { CFTableColumn, CFNumericalColumn, CFCategoricalColumn, getRowLabels, getAllRowLabels, filterUndefined } from './common';
import BarChart from '../visualization/barchart';
import { TableColumn, isNumericalVColumn } from '../Table/common';




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
    this.onHoverRange = this.onHoverRange.bind(this);
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
              onHoverRange={this.onHoverRange}
            />
            <Histogram 
              data={this.validateCFs(column.cf)}
              allData={column.allCF && this.validateAllCFs(column.allCF)}
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

  onHoverRange(hoveredBin?: [number, number]) {
    this.setState({hoveredBin: hoveredBin || null});
  };

}
