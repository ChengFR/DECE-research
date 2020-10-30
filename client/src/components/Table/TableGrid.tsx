import * as React from "react";
import memoize from "fast-memoize";

import { Grid, GridCellProps, ScrollParams, SectionRenderedParams, Index } from "react-virtualized";
import { getFixedGridWidth, IndexWidth, TableColumn } from './common';
import PureGrid from "./PureGrid";

export interface CellProps {
  columnIndex: number;
  rowIndex: number;
  width: number;
  height: number;
  data?: any;
  isScrolling: boolean;
}

export type CellRenderer = (props: CellProps) => (React.ReactNode | undefined);

export interface ITableGridProps {
  // columnWidths: number[];
  rowCount: number;
  columns: TableColumn[];
  rowHeight: number | ((params: Index) => number);
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
  overscanRowCount: number;
  operatorWidth: number;
}

export interface ITableGridState { }

export default class TableGrid extends React.PureComponent<
  ITableGridProps,
  ITableGridState
  > {
  static defaultProps = {
    rowHeight: 20,
    fixedColumns: 0,
    showIndex: false,
    overscanRowCount: 3,
  };
  // private divRef: React.RefObject<HTMLDivElement> = React.createRef();
  private rightGridRef: React.RefObject<PureGrid> = React.createRef();
  private leftGridRef: React.RefObject<PureGrid> = React.createRef();

  constructor(props: ITableGridProps) {
    super(props);

    this.state = {};
    this.renderCell = this.renderCell.bind(this);
    this.renderCellLeft = this.renderCellLeft.bind(this);
    this.renderCellRight = this.renderCellRight.bind(this);
    this.renderCellIndex = this.renderCellIndex.bind(this);
  }

  componentDidUpdate(prevProps: ITableGridProps) {
    if (prevProps.columns !== this.props.columns) {
      this.recomputeGridSize();
    }
  }

  public render() {
    const {
      style,
      width,
      className,
      columns,
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
      rowCount,
      overscanRowCount,
      operatorWidth,
    } = this.props;

    const leftGridWidth =
      getFixedGridWidth(fixedColumns, columns) +
      (showIndex ? IndexWidth : 0);
    const rightGridWidth = width - leftGridWidth - (operatorWidth?operatorWidth:0);

    const leftGrid = fixedColumns ? (
      <PureGrid
        cellRenderer={this.renderCellLeft}
        columnCount={fixedColumns + Number(showIndex)}
        columnWidth={
          showIndex
            ? ({ index }) =>
              index === 0 ? IndexWidth : columns[index - 1].width
            : ({ index }) => columns[index].width
        }
        rowHeight={rowHeight}
        rowCount={rowCount}
        tabIndex={null}
        width={leftGridWidth}
        height={height}
        style={styleLeftGrid}
        containerStyle={this._leftGridStyle(styleLeftGrid)}
        scrollTop={scrollTop}
        // isScrollingOptOut={true}
        overscanRowCount={overscanRowCount}
        ref={this.rightGridRef}
        onScroll={
          onScroll &&
          (params =>
            onScroll({ ...params, scrollLeft: this.props.scrollLeft || 0 }))
        }
      />) : null;

    const rightGrid =
      <PureGrid
        columnWidth={({ index }: { index: number }) =>
          columns[index + fixedColumns].width
        }
        rowHeight={rowHeight}
        className={`scrollbar fixed-scrollbar`}
        cellRenderer={this.renderCellRight}
        columnCount={columns.length - fixedColumns}
        rowCount={rowCount}
        tabIndex={null}
        height={height}
        width={rightGridWidth}
        scrollLeft={scrollLeft}
        scrollTop={scrollTop}
        onScroll={onScroll}
        onSectionRendered={onSectionRendered}
        overscanColumnCount={3}
        overscanRowCount={overscanRowCount}
        style={styleRightGrid}
        ref={this.rightGridRef}
        containerStyle={this._rightGridStyle(leftGridWidth, styleRightGrid)}
      />

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
      const { columnIndex } = cellProps;
      if (columnIndex === 0) return this.renderCellIndex(cellProps);
      return this.renderCell({ ...cellProps, columnIndex: columnIndex - 1 });

    } else {
      return this.renderCell(cellProps);
    }
  };

  public renderCellIndex(cellProps: GridCellProps) {
    const { rowIndex, key, style, isScrolling } = cellProps;
    const props = {
      width: style.width as number,
      height: style.height as number,
      rowIndex,
      columnIndex: -1,
      data: rowIndex + 1,
      isScrolling
    };
    return (
      <div className={`cell row-${rowIndex} col-index`} key={key} style={style}>
        {this.props.cellRenderer(props)}
      </div>
    );
  }

  public renderCell(cellProps: GridCellProps) {
    const { rowIndex, columnIndex, key, style, isScrolling } = cellProps;
    const props = {
      width: style.width as number,
      height: style.height as number,
      rowIndex,
      columnIndex,
      isScrolling
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

  public forceUpdate() {
    this.leftGridRef.current?.forceUpdate();
    this.rightGridRef.current?.forceUpdate();
  }

  public recomputeGridSize(params?: { columnIndex?: number, rowIndex?: number }) {
    const passedDownParams = params && { rowIndex: params.rowIndex };
    this.leftGridRef.current?.recomputeGridSize(passedDownParams);
    this.rightGridRef.current?.recomputeGridSize(passedDownParams);
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
