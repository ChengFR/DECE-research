import * as React from "react";
import * as d3 from "d3";
import memoize from "fast-memoize";

import _ from "lodash";
import { Grid, GridCellProps, Index, ScrollParams } from "react-virtualized";
import { getFixedGridWidth } from "./helpers";

export interface CellProps {
  columnIndex: number;
  rowIndex: number;
  width: number;
  height: number;
  data: any;
}

export interface ITableGridProps {
  data: Array<Array<number | string>>;
  // columnWidths: number[];
  columnWidths: number[];
  rowHeight: number;
  height: number;
  width: number;
  fixedColumns: number;
  className?: string;
  style?: React.CSSProperties;
  styleLeftGrid?: React.CSSProperties;
  styleRightGrid?: React.CSSProperties;
  scrollLeft?: number;
  scrollTop?: number;
  onScroll?: (params: ScrollParams) => any;
  cellRenderer: (props: CellProps) => React.ReactNode;
}

export interface ITableGridState {}

function number2string(x: number): string {
  if (Number.isInteger(x)) return x.toFixed(0);
  return x.toPrecision(4);
}

export default class TableGrid extends React.Component<
  ITableGridProps,
  ITableGridState
> {
  static defaultProps = {
    rowHeight: 20,
    fixedColumns: 0,
    cellRenderer: (props: CellProps): React.ReactNode => {
      const { rowIndex, columnIndex, data } = props;
      return (
        <div className="cell-content">{typeof data === 'string' ? data : number2string(data)}</div>
      );
    }
  };
  // private divRef: React.RefObject<HTMLDivElement> = React.createRef();
  private rightGridRef: React.RefObject<Grid> = React.createRef();
  private leftGridRef: React.RefObject<Grid> = React.createRef();

  constructor(props: ITableGridProps) {
    super(props);

    this.state = {};
    this.renderCell = this.renderCell.bind(this);
    this.renderCellLeft = this.renderCellLeft.bind(this);
    this.renderCellRight = this.renderCellRight.bind(this);
  }

  componentDidUpdate(prevProps: ITableGridProps) {
    if (prevProps.columnWidths !== this.props.columnWidths) {
      if (this.leftGridRef.current) this.leftGridRef.current.recomputeGridSize();
      if (this.rightGridRef.current) this.rightGridRef.current.recomputeGridSize();
    }
  }

  public render() {
    const {
      data,
      style,
      width,
      className,
      columnWidths,
      fixedColumns,
      styleLeftGrid,
      styleRightGrid,
      onScroll,
      scrollLeft,
      scrollTop,
      height,
      ...rest
    } = this.props;

    const leftGridWidth = getFixedGridWidth(fixedColumns, columnWidths);
    const rightGridWidth = width - leftGridWidth;
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
          {...rest}
          cellRenderer={this.renderCellLeft}
          className={`invisible-scrollbar`}
          columnCount={fixedColumns}
          columnWidth={({ index }: { index: number }) => columnWidths[index]}
          ref={this.leftGridRef}
          rowCount={data[0].length}
          tabIndex={null}
          width={leftGridWidth}
          height={height}
          style={styleLeftGrid}
          scrollTop={scrollTop}
          onScroll={onScroll && ((params) => onScroll({...params, scrollLeft: (this.props.scrollLeft || 0)}))}
        />
      </div>
    ) : null;

    const rightGrid = (
      <div 
        className="right-grid-wrapper" 
        style={{
          ...this._rightGridStyle(leftGridWidth, styleRightGrid),
          width: rightGridWidth,
          height: height
        }}>
      <Grid
        {...rest}
        columnWidth={({ index }: { index: number }) => columnWidths[index+fixedColumns]}
        className={`scrollbar fixed-scrollbar`}
        cellRenderer={this.renderCellRight}
        columnCount={data.length - fixedColumns}
        // onScrollbarPresenceChange={this._onScrollbarPresenceChange}
        ref={this.rightGridRef}
        rowCount={data[0].length}
        tabIndex={null}
        height={height}
        width={rightGridWidth}
        scrollLeft={scrollLeft}
        scrollTop={scrollTop}
        onScroll={onScroll}
        // scrollToColumn={scrollToColumn - fixedColumnCount}
        // scrollToRow={scrollToRow - fixedRowCount}
        style={styleRightGrid}
      />
      </div>
    )

    return (
      <div className="table-grid" style={{...style, width, height, position: 'relative'}}>
        {leftGrid}
        {rightGrid}
      </div>
    );
  }

  public renderCellRight(cellProps: GridCellProps) {
    const { columnIndex, ...rest } = cellProps;
    return this.renderCell({ ...rest, columnIndex: columnIndex + this.props.fixedColumns });
  }

  public renderCellLeft(cellProps: GridCellProps) {
    return this.renderCell(cellProps);
  }

  public renderCell(cellProps: GridCellProps) {
    const { rowIndex, columnIndex, key, style } = cellProps;
    const props = {
      width: style.width as number,
      height: style.width as number,
      rowIndex, columnIndex,
      data: this.props.data[columnIndex][rowIndex],
    };
    return (
      <div
        className={`cell row-${rowIndex} col-${columnIndex}`}
        key={key}
        style={style}
      >
        {this.props.cellRenderer(props)}
        {/* <div className="cell-content">{this.props.data[columnIndex][rowIndex]}</div> */}
      </div>
    );
  }

  public defaultCellRenderer(cellProps: CellProps) {
    const { rowIndex, columnIndex } = cellProps;
    return (
      <div className="cell-content">{this.props.data[columnIndex][rowIndex]}</div>
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
