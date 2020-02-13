import * as React from "react";
import memoize from "fast-memoize";

import { Grid, GridCellProps, ScrollParams, SectionRenderedParams } from "react-virtualized";
import { getFixedGridWidth, IndexWidth } from "./helpers";

export interface CellProps {
  columnIndex: number;
  rowIndex: number;
  width: number;
  height: number;
  data: any;
}

export type CellRenderer = (props: CellProps) => React.ReactNode;

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
  cellRenderer: CellRenderer;
  showIndex: boolean;
  onSectionRendered?: (params: SectionRenderedParams) => any;
}

export interface ITableGridState {}

function number2string(x: number): string {
  if (Number.isInteger(x)) return x.toFixed(0);
  return x.toPrecision(4);
}

export const defaultCellRenderer: CellRenderer = props => {
  const { data } = props;
  return (
    <div className="cell-content">
      {typeof data === "string" ? data : number2string(data)}
    </div>
  );
};

export default class TableGrid extends React.PureComponent<
  ITableGridProps,
  ITableGridState
> {
  static defaultProps = {
    rowHeight: 20,
    fixedColumns: 0,
    cellRenderer: defaultCellRenderer,
    showIndex: false
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
    this.renderCellIndex = this.renderCellIndex.bind(this);
  }

  componentDidUpdate(prevProps: ITableGridProps) {
    if (prevProps.columnWidths !== this.props.columnWidths) {
      if (this.leftGridRef.current)
        this.leftGridRef.current.recomputeGridSize();
      if (this.rightGridRef.current)
        this.rightGridRef.current.recomputeGridSize();
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
      showIndex,
      rowHeight,
      onSectionRendered,
    } = this.props;

    const leftGridWidth =
      getFixedGridWidth(fixedColumns, columnWidths) +
      (showIndex ? IndexWidth : 0);
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
          cellRenderer={this.renderCellLeft}
          className={`invisible-scrollbar`}
          columnCount={fixedColumns + Number(showIndex)}
          columnWidth={
            showIndex
              ? ({ index }) =>
                  index === 0 ? IndexWidth : columnWidths[index - 1]
              : ({ index }) => columnWidths[index]
          }
          rowHeight={rowHeight}
          ref={this.leftGridRef}
          rowCount={data[0].length}
          tabIndex={null}
          width={leftGridWidth}
          height={height}
          style={styleLeftGrid}
          scrollTop={scrollTop}
          onScroll={
            onScroll &&
            (params =>
              onScroll({ ...params, scrollLeft: this.props.scrollLeft || 0 }))
          }
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
        }}
      >
        <Grid
          columnWidth={({ index }: { index: number }) =>
            columnWidths[index + fixedColumns]
          }
          rowHeight={rowHeight}
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
          onSectionRendered={onSectionRendered}
          // scrollToColumn={scrollToColumn - fixedColumnCount}
          // scrollToRow={scrollToRow - fixedRowCount}
          style={styleRightGrid}
        />
      </div>
    );

    return (
      <div
        className={className ? `${className} table-grid` : "table-grid"}
        style={{ ...style, width, height, position: "relative" }}
      >
        {leftGrid}
        {rightGrid}
      </div>
    );
  }

  public renderCellRight(cellProps: GridCellProps) {
    const { columnIndex, ...rest } = cellProps;
    return this.renderCell({
      ...rest,
      columnIndex: columnIndex + this.props.fixedColumns
    });
  }

  public renderCellLeft(cellProps: GridCellProps) {
    if (this.props.showIndex) {
      const {columnIndex} = cellProps;
      if (columnIndex === 0) return this.renderCellIndex(cellProps);
      return this.renderCell({...cellProps, columnIndex: columnIndex - 1});

    } else {
      return this.renderCell(cellProps);
    }
  };

  public renderCellIndex(cellProps: GridCellProps) {
    const { rowIndex, key, style } = cellProps;
    return (
      <div className={`cell row-${rowIndex} col-index`} key={key} style={style}>
        <span className='cell-content'>{rowIndex}</span>
      </div>
    );
  }

  public renderCell(cellProps: GridCellProps) {
    const { rowIndex, columnIndex, key, style } = cellProps;
    const props = {
      width: style.width as number,
      height: style.width as number,
      rowIndex,
      columnIndex,
      data: this.props.data[columnIndex][rowIndex]
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
      <div className="cell-content">
        {this.props.data[columnIndex][rowIndex]}
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
