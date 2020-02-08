import * as React from "react";
import { Grid, GridCellProps, Index, ScrollParams } from "react-virtualized";
import Histogram from "../visualization/histogram";
import { IColumn } from "data-forge/build/lib/dataframe";

export interface IHeaderProps {
  columns: IColumn[];
  // columnWidths: number[];
  columnWidth: number | ((params: Index) => number);
  height: number;
  width: number;
  style?: React.CSSProperties;
  scrollLeft?: number;
  className?: string;
  onScroll?: (params: ScrollParams) => any;
  hasChart?: boolean;
  chartHeight: number;
}

export interface IHeaderState {
  columns: IColumn[];
  scrollLeft: number;
  scrollTop: number;
  columnData: Array<number>[];
}

export default class Header extends React.Component<
  IHeaderProps,
  IHeaderState
> {
  static defaultProps = {
    height: 20,
    chartHeight: 60,
  };

  static getDerivedStateFromProps(nextProps: IHeaderProps, prevState: IHeaderState) {
    if (nextProps.columns !== prevState.columns) {
      const {columns} = nextProps;
      const columnData = columns.map(c => c.series.toArray())
      return {columns, columnData};
    }
    return null;
  }
  private _titleRef: React.Ref<Grid> = React.createRef();
  private _chartRef: React.Ref<Grid> = React.createRef();
  constructor(props: IHeaderProps) {
    super(props);

    this.state = {
      columns: [],
      scrollLeft: 0,
      scrollTop: 0,
      columnData: [],
    };
    this._titleCellRenderer = this._titleCellRenderer.bind(this);
    this._chartCellRenderer = this._chartCellRenderer.bind(this);
  }

  // public backup_render() {
  //   const { columns, columnWidths, height } = this.props;
  //   const xs = [0, ...cumsum(columnWidths)];

  //   return (
  //     <div className="table-header" style={{ height }}>
  //       {columns.map((col, i) => {
  //         const style = { left: xs[i], width: columnWidths[i], height: height };
  //         return (
  //           <div className="cell" style={style}>
  //             {col.name}
  //           </div>
  //         );
  //       })}
  //     </div>
  //   );
  // }

  public render() {
    const { height, width, style, columns, scrollLeft, onScroll, className, hasChart, chartHeight } = this.props;

    const titleHeight = hasChart ? (height - chartHeight) : height;
    const titleGrid = (
      <Grid
        cellRenderer={this._titleCellRenderer}
        className={`${className} header-title invisible-scrollbar`}
        columnCount={columns.length}
        columnWidth={this.props.columnWidth}
        height={titleHeight}
        rowHeight={titleHeight}
        onScroll={onScroll}
        ref={this._titleRef}
        rowCount={1}
        scrollLeft={scrollLeft}
        style={{ ...style, left: 0 }}
        tabIndex={null}
        width={width}
      />
    );

    let chartGrid: string | React.ReactNode = "";

    if (hasChart) {
      chartGrid = (
        <Grid 
          cellRenderer={this._chartCellRenderer}
          className={`${className} header-chart invisible-scrollbar`}
          columnCount={columns.length}
          columnWidth={this.props.columnWidth}
          height={chartHeight}
          rowHeight={chartHeight}
          onScroll={onScroll}
          ref={this._chartRef}
          rowCount={1}
          scrollLeft={scrollLeft}
          style={{ ...style, left: 0 }}
          tabIndex={null}
          width={width}
        />
      );
    }

    return (
      <div
        className={`${className}-ScrollWrapper`}
        style={{
          ...style,
          height,
          width,
          overflowX: "hidden"
        }}
      >
        {titleGrid}
        {chartGrid}
      </div>
    );
  }

  _titleCellRenderer(cellProps: GridCellProps) {
    const { columnIndex, key, style, ...rest } = cellProps;
    const { columns } = this.props;

    return (
      <div className={`cell row-title col-${columnIndex}`} key={key} style={style}>
        {columns[columnIndex].name}
      </div>
    );
  }

  _chartCellRenderer(cellProps: GridCellProps) {
    const { columnIndex, key, style, ...rest } = cellProps;
    const { columnWidth, chartHeight } = this.props;
    const data = this.state.columnData[columnIndex];
    // console.log(data);
    const width = typeof columnWidth === 'number' ? columnWidth : columnWidth({index: columnIndex});
    return (
      <div className={`cell row-chart col-${columnIndex}`} key={key} style={style}>
        <Histogram data={data} width={width} height={chartHeight}/>
      </div>
    );
  }
}
