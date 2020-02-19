import * as React from "react";
import { Icon } from "antd";
import { Grid, GridCellProps, ScrollParams } from "react-virtualized";
import memoize from "fast-memoize";

import Histogram from "../visualization/histogram";
import BarChart from "../visualization/barchart";
import ColResizer from "./ColResizer";
import { getFixedGridWidth, columnMargin, TableColumn } from "./common";

export interface IHeaderProps {
  columns: TableColumn[];
  // columnWidths: number[];
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
  onSort?: (columnIndex: number, order: "descend" | "ascend") => any;
  onSearch?: (columnIndex: number, order: "descend" | "ascend") => any;
}

export interface IHeaderState {
  columns: TableColumn[];
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
      hasChart,
      chartHeight,
      fixedColumns,
      styleLeftGrid,
      styleRightGrid
    } = this.props;
    console.debug("render table header");

    const titleHeight = hasChart ? height - chartHeight : height;
    const rowHeight = (p: { index: number }) =>
      p.index === 0 ? titleHeight : chartHeight;

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
            columns[index + fixedColumns].width
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
        style={{ left: 0, height, width, ...style }}
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
    const { columnIndex, key, style } = cellProps;
    const { columns } = this.props;

    return (
      <ColumnTitle
        className={`cell row-title col-${columnIndex}`}
        key={key}
        style={{
          ...style,
          lineHeight: style.height && `${style.height}px`
        }}
        column={columns[columnIndex]}
      />
    );
  }

  _chartCellRenderer(cellProps: GridCellProps) {
    const { columnIndex, key, style } = cellProps;
    const { chartHeight, columns } = this.props;
    const column = this.state.columns[columnIndex];
    const width = columns[columnIndex].width;
    console.debug("render chart cell");
    return (
      <div
        className={`cell row-chart col-${columnIndex}`}
        key={key}
        style={style}
      >
        {column.type === "numerical" ? (
          <Histogram
            data={column.series.toArray()}
            width={width}
            height={chartHeight}
            margin={columnMargin}
            xScale={column.xScale}
            onSelectRange={column.onFilter}
            selectedRange={column.filter}
            allData={column.prevSeries?.toArray()}
          />
        ) : (
          <BarChart
            data={column.series.toArray()}
            width={width}
            height={chartHeight}
            margin={columnMargin}
            xScale={column.xScale}
          />
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

interface IColumnTitleProps {
  className?: string;
  style?: React.CSSProperties;
  column: TableColumn;
}

const ColumnTitle: React.FunctionComponent<IColumnTitleProps> = (
  props: IColumnTitleProps
) => {
  const { column, style, ...rest } = props;
  const { width, onChangeColumnWidth } = column;
  const { onSort, sorted, name } = column;
  return (
    <div style={style} {...props}>
      <div
        className="cell-content cut-text"
        style={{ width: width - 18, height: "100%", margin: "0 9px" }}
      >
        {name}
      </div>
      {onSort && (
        <Icon
          type="arrow-up"
          style={{ position: "absolute", top: 0, height: "100%", right: 3 }}
          className={(sorted ? `arrow sorted ${sorted}` : "arrow")}
          onClick={() => onSort(column.sorted === "descend" ? "ascend" : "descend")}
        />
      )}
      {onChangeColumnWidth && (
        <ColResizer x={width} onChangeX={width => onChangeColumnWidth(width)} />
      )}
    </div>
  );
};
