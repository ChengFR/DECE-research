import * as React from "react";
import { Icon } from "antd";
import { Grid, GridCellProps, ScrollParams } from "react-virtualized";
import memoize from "fast-memoize";

import ColResizer from "./ColResizer";
import { getFixedGridWidth, columnMargin, TableColumn } from './common';
import { assert } from '../../common/utils';
import { isColumnNumerical } from '../../data/column';
import { CellRenderer, CellProps } from './TableGrid';
import Header, { IHeaderProps} from './Header'

export interface ISubsetGridProps extends IHeaderProps {
  columns: TableColumn[];
  cellRenderer?: CellRenderer;
  fixedColumns: number;
}

export default class SubsetGrid extends Header{
  static defaultProps = {
    height: 20,
    chartHeight: 60,
    fixedColumns: 0,
    rowCount: 1,
  };

  constructor(props: ISubsetGridProps) {
    super(props);

    this.defaultCellRenderer = this.defaultCellRenderer.bind(this);
    // this._chartCellRenderer = this._chartCellRenderer.bind(this);
    this.renderCell = this.renderCell.bind(this);
    this.renderCellLeft = this.renderCellLeft.bind(this);
    this.renderCellRight = this.renderCellRight.bind(this);
  }

  componentDidUpdate(prevProps: ISubsetGridProps) {
    if (prevProps.columns !== this.props.columns) {
      console.debug("recompute grid size");
      if (this.leftGridRef.current)
        this.leftGridRef.current.recomputeGridSize();
      if (this.rightGridRef.current)
        this.rightGridRef.current.recomputeGridSize();
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
      // hasChart,
      // chartHeight,
      fixedColumns,
      rowCount,
      rowHeight,
      styleLeftGrid,
      styleRightGrid,
      // distGroupBy,
    } = this.props;
    console.debug("render table header");

    // const titleHeight = hasChart ? height - chartHeight : height;
    // const rowHeight = (p: { index: number }) =>
    //   p.index === 0 ? titleHeight : chartHeight;

    const leftGridWidth = getFixedGridWidth(fixedColumns, columns);
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
          columnWidth={({ index }: { index: number }) => columns[index].width}
          height={height}
          rowHeight={rowHeight}
          ref={this.rightGridRef}
          rowCount={rowCount}
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
            columns[index + fixedColumns].width
          }
          height={height}
          rowHeight={rowHeight}
          onScroll={onScroll}
          ref={this.leftGridRef}
          rowCount={rowCount}
          scrollLeft={scrollLeft}
          tabIndex={null}
          width={rightGridWidth}
          style={styleRightGrid}
          // isScrollingOptOut={true}
          overscanColumnCount={3}
        />
      </div>
    );

    return (
      <div
        className={`table-header ${className}`}
        style={{ left: 0, height, width, ...style }}
      >
        {leftGrid}
        {grid}
      </div>
    );
  }
  
  renderCell(cellProps: GridCellProps) {
    const { rowIndex, columnIndex, key, style, isScrolling } = cellProps;
    const props = {
      width: style.width as number,
      height: style.height as number,
      rowIndex,
      columnIndex,
      isScrolling
    };
    const {cellRenderer} = this.props;
    let result: React.ReactNode;
    // console.log(`Render ${rowIndex} ${cellProps.columnIndex}`);
    if (cellRenderer) {
      result = cellRenderer(props);
    }
    if (result === undefined) result = this.defaultCellRenderer(props);
    return (
      <div 
        className={`cell row-${rowIndex} col-${columnIndex}`}
        key={key}
        style={style}
      >
        {result}
      </div>
    );
    // if (rowIndex === 0) return this.defaultCellRenderer(cellProps);
    // else if (this.props.hasChart && rowIndex === 1)
    //   return this._chartCellRenderer(cellProps);
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
  defaultCellRenderer(cellProps: CellProps) {
    const { columnIndex, height } = cellProps;
    const { columns } = this.props;

    return (
      <div />
    );
  }
}

