import * as React from "react";
import { Icon } from "antd";
import { Menu, Dropdown } from 'antd';
import { Grid, GridCellProps, ScrollParams } from "react-virtualized";
import memoize from "fast-memoize";

import ColResizer from "./ColResizer";
import { getFixedGridWidth, columnMargin, TableColumn } from './common';
import { assert } from '../../common/utils';
import { isColumnNumerical } from '../../data/column';
import { CellRenderer, CellProps } from './TableGrid';
import Header, { IHeaderProps } from './Header'
import PureGrid from './PureGrid'

export interface ISubsetGridProps {
  columns: TableColumn[];
  // distGroupBy?: number;
  // columnWidths: number[];
  onChangeColumnWidth?: (p: { index: number; width: number }) => any;
  height: number;
  width: number;
  operatorWidth?: number,
  style?: React.CSSProperties;
  styleLeftGrid?: React.CSSProperties;
  styleRightGrid?: React.CSSProperties;
  scrollLeft?: number;
  className?: string;
  onScroll?: (params: ScrollParams) => any;
  cellRenderer?: CellRenderer;
  // hasChart?: boolean;
  // chartHeight: number;
  rowCount: number;
  rowHeight: number | ((p: { index: number }) => number);
  fixedColumns: number;
  onUpdate?: () => void;
  onCopy?: () => void;
  onDelete?: () => void;
}

export default class SubsetGrid extends React.PureComponent<ISubsetGridProps, {}>{

  protected leftGridRef: React.RefObject<Grid> = React.createRef();
  protected rightGridRef: React.RefObject<Grid> = React.createRef();
  protected columnWidth: any;

  constructor(props: ISubsetGridProps) {
    super(props)
    // this.defaultCellRenderer = this.defaultCellRenderer.bind(this);
    // this._chartCellRenderer = this._chartCellRenderer.bind(this);
    this.renderCell = this.renderCell.bind(this);
    this.renderCellLeft = this.renderCellLeft.bind(this);
    this.renderCellRight = this.renderCellRight.bind(this);
    this.renderOptionCell = this.renderOptionCell.bind(this);
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
      operatorWidth,
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

    const rightGridWidth = width - leftGridWidth - (operatorWidth ? operatorWidth : 0);
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
    const realRightGridWidth = getFixedGridWidth(columns.length, columns);
    const operation = operatorWidth && (
      <PureGrid
        cellRenderer={this.renderOptionCell}
        className={`invisible-scrollbar`}
        columnCount={1}
        columnWidth={operatorWidth}
        height={height}
        rowHeight={rowHeight}
        onScroll={onScroll}
        scrollLeft={scrollLeft}
        rowCount={rowCount}
        tabIndex={null}
        width={operatorWidth}
        // style={styleRightGrid}
        containerStyle={this._optionGridStyle(realRightGridWidth, styleRightGrid)}
        overscanColumnCount={3}
      />
    )

    return (
      <div
        className={`table-subset ${className}`}
        style={{ left: 0, height, width: width, ...style }}
      >
        {leftGrid}
        {grid}
        {operation}
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
    const { cellRenderer } = this.props;
    let result: React.ReactNode;
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

  renderOptionCell(cellProps: GridCellProps) {
    const { onUpdate, onCopy, onDelete, height} = this.props;
    const {key} = cellProps
    return (<SubsetOperations 
      onUpdate={onUpdate}
      onCopy={onCopy}
      onDelete={onDelete}
      style={{"height": height, "paddingTop": (height/2-7)}}
      key={key}
    />)
  }

  _optionGridStyle = memoize(
    (
      left: number,
      optionGridStyle?: React.CSSProperties
    ): React.CSSProperties => {
      return {
        left,
        overflowX: "hidden",
        overflowY: "hidden",
        position: "absolute",
        top: 0,
        ...optionGridStyle
      };
    }
  )
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

export interface SubsetOperationsProps {
  onUpdate?: () => void;
  onCopy?: () => void;
  onDelete?: () => void;
  style?: React.CSSProperties;
}

interface SubsetOperationsState {
  visible: boolean
}

class SubsetOperations extends React.PureComponent<SubsetOperationsProps, SubsetOperationsState> {

  constructor(props: SubsetOperationsProps) {
    super(props);
    this.state = {
      visible: false,
    };
  }

  handleMenuClick = (e: any) => {
    const {onUpdate, onCopy, onDelete} = this.props;
    if (e.key === '1') {
      onUpdate && onUpdate();
      this.setState({ visible: false });
    }
    else if (e.key === '2') {
      onCopy && onCopy();
      this.setState({ visible: false });
    }
    else if (e.key === '3') {
      onDelete && onDelete();
      this.setState({ visible: false });
    }
  };

  handleVisibleChange = (flag: any) => {
    this.setState({ visible: flag });
  };

  render() {
    const {style} = this.props;
    const menu = (
      <Menu onClick={this.handleMenuClick}>
        <Menu.Item key="1">Update</Menu.Item>
        <Menu.Item key="2">Copy</Menu.Item>
        <Menu.Item key="3">Delete</Menu.Item>
      </Menu>
    );
    return (
      <div className="option-container" style={style}>
        <Dropdown
          overlay={menu}
          onVisibleChange={this.handleVisibleChange}
          visible={this.state.visible}
        >
          <a className="customized-dropdown-link" onClick={e => e.preventDefault()}>
            <Icon type="down" />
          </a>
        </Dropdown>
      </div>
    );
  }
}

