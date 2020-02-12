import * as React from "react";
import { Grid, GridCellProps, Index, ScrollParams } from "react-virtualized";
import memoize from "fast-memoize";

import { IColumn } from "../../data";

import Histogram from "../visualization/histogram";
import BarChart from "../visualization/barchart";
import ColResizer from "./ColResizer";
import { getFixedGridWidth } from "./helpers";

export interface IHeaderProps {
  columns: IColumn[];
  // columnWidths: number[];
  columnWidths: number[];
  onChangeColumnWidth?: (p: { index: number; width: number }) => any;
  height: number;
  width: number;
  style?: React.CSSProperties;
  styleLeftGrid?: React.CSSProperties;
  styleRightGrid?: React.CSSProperties;
  scrollLeft?: number;
  className?: string;
  onScroll?: (params: ScrollParams) => any;
  hasChart?: boolean;
  chartHeight: number;
  fixedColumns: number;
}

export interface IHeaderState {
  columns: IColumn[];
  scrollLeft: number;
  columnData: Array<number>[];
}

export default class Header extends React.Component<
  IHeaderProps,
  IHeaderState
> {
  static defaultProps = {
    height: 20,
    chartHeight: 60,
    fixedColumns: 0
  };

  static getDerivedStateFromProps(
    nextProps: IHeaderProps,
    prevState: IHeaderState
  ) {
    let newState: Partial<IHeaderState> = {};
    if (nextProps.columns !== prevState.columns) {
      newState.columns = nextProps.columns;
      newState.columnData = newState.columns.map(c => c.series.toArray());
    }
    return newState;
  }
  private leftGridRef: React.RefObject<Grid> = React.createRef();
  private rightGridRef: React.RefObject<Grid> = React.createRef();
  private columnWidth: any;

  constructor(props: IHeaderProps) {
    super(props);

    this.state = {
      columns: [],
      scrollLeft: 0,
      columnData: []
    };
    this._titleCellRenderer = this._titleCellRenderer.bind(this);
    this._chartCellRenderer = this._chartCellRenderer.bind(this);
    this.renderCell = this.renderCell.bind(this);
    this.renderCellLeft = this.renderCellLeft.bind(this);
    this.renderCellRight = this.renderCellRight.bind(this);
  }

  componentDidUpdate(prevProps: IHeaderProps) {
    if (prevProps.columnWidths !== this.props.columnWidths) {
      if (this.leftGridRef.current) this.leftGridRef.current.recomputeGridSize();
      if (this.rightGridRef.current) this.rightGridRef.current.recomputeGridSize();
    }
  }

  public render() {
    const {
      height,
      width,
      style,
      columns,
      scrollLeft,
      onScroll,
      className,
      hasChart,
      chartHeight,
      columnWidths,
      fixedColumns,
      styleLeftGrid,
      styleRightGrid
    } = this.props;
    console.debug("render table header");

    const titleHeight = hasChart ? height - chartHeight : height;
    const rowHeight = (p: { index: number }) =>
      p.index === 0 ? titleHeight : chartHeight;

    const leftGridWidth = getFixedGridWidth(fixedColumns, columnWidths);
    const leftGrid = fixedColumns ? (
      <div
        className="left-grid-wrapper"
        style={{
          ...this._leftGridStyle(styleLeftGrid),
          width: leftGridWidth,
          height: height
        }}
      >
        <Grid
          cellRenderer={this.renderCellLeft}
          className={`invisible-scrollbar`}
          columnCount={fixedColumns}
          columnWidth={({ index }: { index: number }) => columnWidths[index]}
          height={height}
          rowHeight={hasChart ? rowHeight : height}
          ref={this.rightGridRef}
          rowCount={hasChart ? 2 : 1}
          tabIndex={null}
          width={leftGridWidth}
          style={styleLeftGrid}
        />
      </div>
    ) : null;
    const rightGridWidth = width - leftGridWidth;
    const grid = (
      <div
        className="right-grid-wrapper"
        style={{
          ...this._rightGridStyle(leftGridWidth, styleRightGrid),
          width: rightGridWidth,
          height: height
        }}
      >
        <Grid
          cellRenderer={this.renderCellRight}
          className={`invisible-scrollbar`}
          columnCount={columns.length - fixedColumns}
          columnWidth={({ index }: { index: number }) =>
            columnWidths[index + fixedColumns]
          }
          height={height}
          rowHeight={hasChart ? rowHeight : height}
          onScroll={onScroll}
          ref={this.leftGridRef}
          rowCount={hasChart ? 2 : 1}
          scrollLeft={scrollLeft}
          tabIndex={null}
          width={rightGridWidth}
          style={styleRightGrid}
        />
      </div>
    );

    return (
      <div
        className={`table-header ${className}`}
        style={{ ...style, left: 0, height, width }}
      >
        {leftGrid}
        {grid}
      </div>
    );
  }

  renderCell(cellProps: GridCellProps) {
    const { rowIndex } = cellProps;
    // console.log(`Render ${rowIndex} ${cellProps.columnIndex}`);

    if (rowIndex === 0) return this._titleCellRenderer(cellProps);
    else if (this.props.hasChart && rowIndex === 1)
      return this._chartCellRenderer(cellProps);
  }

  renderCellLeft(cellProps: GridCellProps) {
    return this.renderCell(cellProps);
  }

  renderCellRight(cellProps: GridCellProps) {
    const { columnIndex, ...rest } = cellProps;
    return this.renderCell({
      ...rest,
      columnIndex: columnIndex + this.props.fixedColumns
    });
  }

  _titleCellRenderer(cellProps: GridCellProps) {
    const { columnIndex, key, style, ...rest } = cellProps;
    const {
      columns,
      onChangeColumnWidth,
      columnWidths
    } = this.props;
    const width = columnWidths[columnIndex];

    return (
      <div
        className={`cell row-title col-${columnIndex}`}
        key={key}
        style={{
          ...style,
          lineHeight: style.height && `${style.height}px`
        }}
      >
        <div className="cell-content">{columns[columnIndex].name}</div>
        {onChangeColumnWidth && (
          <ColResizer
            x={width}
            onChangeX={width =>
              onChangeColumnWidth({ index: columnIndex, width })
            }
          />
        )}
      </div>
    );
  }

  _chartCellRenderer(cellProps: GridCellProps) {
    const { columnIndex, key, style, ...rest } = cellProps;
    const { columnWidths, chartHeight, columns } = this.props;
    const data = this.state.columnData[columnIndex];
    const width = columnWidths[columnIndex];

    return (
      <div
        className={`cell row-chart col-${columnIndex}`}
        key={key}
        style={style}
      >
        {columns[columnIndex].type === "numerical" ? (
          <Histogram data={data} width={width} height={chartHeight} />
        ) : (
          <BarChart data={data} width={width} height={chartHeight} />
        )}
      </div>
    );
  }

  _leftGridStyle = memoize(
    (leftGridStyle?: React.CSSProperties): React.CSSProperties => {
      return {
        left: 0,
        overflowX: "hidden",
        overflowY: "hidden",
        position: "absolute",
        top: 0,
        ...leftGridStyle
      };
    }
  );

  _rightGridStyle = memoize(
    (
      left: number,
      rightGridStyle?: React.CSSProperties
    ): React.CSSProperties => {
      return {
        left,
        overflowX: "hidden",
        overflowY: "hidden",
        position: "absolute",
        top: 0,
        ...rightGridStyle
      };
    }
  );
}
