import * as React from "react";
import { Icon } from "antd";
import { Grid, GridCellProps, ScrollParams } from "react-virtualized";
import memoize from "fast-memoize";

import ColResizer from "./ColResizer";
import { getFixedGridWidth, columnMargin, TableColumn } from './common';
import { assert } from '../../common/utils';
import { isColumnNumerical } from '../../data/column';
import { CellRenderer, CellProps } from './TableGrid';
import PureGrid from './PureGrid'

export interface IHeaderProps {
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
  onSort?: (columnIndex: number, order: "descend" | "ascend") => any;
  onSearch?: (columnIndex: number, order: "descend" | "ascend") => any;
}

export interface IHeaderState {
  // columns: TableColumn[];
  scrollLeft: number;
  columnData: Array<number>[];
}

export default class Header extends React.PureComponent<
  IHeaderProps,
  IHeaderState
  > {
  static defaultProps = {
    height: 20,
    chartHeight: 60,
    fixedColumns: 0,
    rowCount: 1,
    operatorWidth: 0,
  };

  // static getDerivedStateFromProps(
  //   nextProps: IHeaderProps,
  //   prevState: IHeaderState
  // ) {
  //   let newState: Partial<IHeaderState> = {};
  //   if (nextProps.columns !== prevState.columns) {
  //     newState.columns = nextProps.columns;
  //   }
  //   return newState;
  // }
  protected leftGridRef: React.RefObject<Grid> = React.createRef();
  protected rightGridRef: React.RefObject<Grid> = React.createRef();
  protected columnWidth: any;

  constructor(props: IHeaderProps) {
    super(props);

    this.state = {
      // columns: [],
      scrollLeft: 0,
      columnData: []
    };
    this.defaultCellRenderer = this.defaultCellRenderer.bind(this);
    // this._chartCellRenderer = this._chartCellRenderer.bind(this);
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
      // hasChart,
      // chartHeight,
      fixedColumns,
      rowCount,
      rowHeight,
      styleLeftGrid,
      styleRightGrid,
      operatorWidth
      // distGroupBy,
    } = this.props;
    console.debug("render table header");

    // const titleHeight = hasChart ? height - chartHeight : height;
    // const rowHeight = (p: { index: number }) =>
    //   p.index === 0 ? titleHeight : chartHeight;

    const leftGridWidth = getFixedGridWidth(fixedColumns, columns);
    // const leftGrid = fixedColumns ? (
    //   <div
    //     className="left-grid-wrapper"
    //     style={{
    //       ...this._leftGridStyle(styleLeftGrid),
    //       width: leftGridWidth,
    //       height: height
    //     }}
    //   >
    //     <Grid
    //       cellRenderer={this.renderCellLeft}
    //       className={`invisible-scrollbar`}
    //       columnCount={fixedColumns}
    //       columnWidth={({ index }: { index: number }) => columns[index].width}
    //       height={height}
    //       rowHeight={rowHeight}
    //       ref={this.rightGridRef}
    //       rowCount={rowCount}
    //       tabIndex={null}
    //       width={leftGridWidth}
    //       style={styleLeftGrid}
    //     />
    //   </div>
    // ) : null;

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

    const rightGridWidth = width - leftGridWidth - (operatorWidth?operatorWidth: 0);
    // const grid = (
    //   <div
    //     className="right-grid-wrapper"
    //     style={{
    //       ...this._rightGridStyle(leftGridWidth, styleRightGrid),
    //       width: rightGridWidth,
    //       height: height
    //     }}
    //   >
    //     <Grid
    //       cellRenderer={this.renderCellRight}
    //       className={`invisible-scrollbar`}
    //       columnCount={columns.length - fixedColumns}
    //       columnWidth={({ index }: { index: number }) =>
    //         columns[index + fixedColumns].width
    //       }
    //       height={height}
    //       rowHeight={rowHeight}
    //       onScroll={onScroll}
    //       ref={this.leftGridRef}
    //       rowCount={rowCount}
    //       scrollLeft={scrollLeft}
    //       tabIndex={null}
    //       width={rightGridWidth}
    //       style={styleRightGrid}
    //       // isScrollingOptOut={true}
    //       overscanColumnCount={3}
    //     />
    //   </div>
    // );
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
    const { cellRenderer } = this.props;
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
      <ColumnTitle
        style={{
          lineHeight: height && `${height}px`
        }}
        column={columns[columnIndex]}
      />
    );
  }

  // _getRowLabels = memoize((labelColumn: CategoricalColumn): [number[], number[]] => {
  //   const cat2idx: Map<string, number> = new Map();
  //   labelColumn.categories?.map((c, i) => cat2idx.set(c, i));
  //   const labels = labelColumn.series.toArray().map(v => {
  //     if (!(cat2idx.has(v))) cat2idx.set(v, cat2idx.size);
  //     return cat2idx.get(v) as number;
  //   });
  //   const uniqLabels: number[] = [];
  //   cat2idx.forEach((v, k) => uniqLabels.push(v));
  //   return [labels, uniqLabels];
  // })

  // _groupByArgs(): undefined | [number[], number[]] {
  //   const {distGroupBy, columns} = this.props;
  //   const labelColumn = distGroupBy === undefined ? undefined : columns[distGroupBy];
  //   assert(labelColumn === undefined || !isColumnNumerical(labelColumn));
  //   return labelColumn && this._getRowLabels(labelColumn);
  // }

  // _chartCellRenderer(cellProps: GridCellProps) {
  //   const { columnIndex, key, style } = cellProps;
  //   const { chartHeight, columns } = this.props;
  //   const column = columns[columnIndex];
  //   const {width } = column;
  //   const groupByArgs = this._groupByArgs();
  //   console.debug("render chart cell");
  //   return (
  //     <div
  //       className={`cell row-chart col-${columnIndex}`}
  //       key={key}
  //       style={style}
  //     >
  //       <HeaderChart
  //         column={column}
  //         groupByArgs={groupByArgs}
  //         width={width}
  //         height={chartHeight}
  //         margin={columnMargin}
  //       />

  //     </div>
  //   );
  // }

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
  style?: React.CSSProperties;
  column: TableColumn;
}

const ColumnTitle: React.FunctionComponent<IColumnTitleProps> = (
  props: IColumnTitleProps
) => {
  const { column, style } = props;
  const { width, onChangeColumnWidth } = column;
  const { onSort, sorted, name } = column;
  return (
    <div className="row-title" style={style}>
      <div
        className="cell-content cut-text"
        style={{ width, height: "100%", padding: "0 9px" }}
      >
        <span title={name}>{name}</span>
      </div>
      {onSort && (
        <Icon
          type="arrow-up"
          // style={{ position: "absolute", right: 3 }}
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
