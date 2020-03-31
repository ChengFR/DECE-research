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
import PureGrid from './PureGrid'

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

    // this.defaultCellRenderer = this.defaultCellRenderer.bind(this);
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
      fixedColumns,
      rowCount,
      rowHeight,
      styleLeftGrid,
      styleRightGrid,
    } = this.props;
    console.debug("render table header");

    const leftGridWidth = getFixedGridWidth(fixedColumns, columns);

    const leftGrid = fixedColumns ?
      <PureGrid
        height={height}
        width={leftGridWidth}
        style={styleLeftGrid}
        containerStyle={this._leftGridStyle(styleLeftGrid)}
        scrollLeft={scrollLeft}
        onScroll={onScroll}
        className={"left-grid-wrapper"}
        cellRenderer={this.renderCellLeft}
        rowCount={rowCount}
        rowHeight={rowHeight}
        columnCount={fixedColumns}
        columnWidth={({ index }: { index: number }) => columns[index].width}
      /> : null;

    const rightGridWidth = width - leftGridWidth;
    const grid = (
      <PureGrid
        cellRenderer={this.renderCellRight}
        className={`invisible-scrollbar`}
        columnCount={columns.length - fixedColumns}
        columnWidth={({ index }: { index: number }) =>
          columns[index + fixedColumns].width
        }
        height={height}
        rowHeight={rowHeight}
        onScroll={onScroll}
        scrollLeft={scrollLeft}
        rowCount={rowCount}
        tabIndex={null}
        width={rightGridWidth}
        style={styleRightGrid}
        containerStyle={this._rightGridStyle(leftGridWidth, styleRightGrid)}
        overscanColumnCount={3}
      />)

    return (
      <div
        className={`table-subset ${className}`}
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
    if (result === undefined) result = <div />;
    return (
      <div 
        className={`cell row-${rowIndex} col-${columnIndex}`}
        key={key}
        style={style}
      >
        {result}
      </div>
    );
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

  
}

