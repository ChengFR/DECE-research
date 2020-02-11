import * as React from "react";
import { Grid, GridCellProps, Index, ScrollParams } from "react-virtualized";
import { Resizable } from "re-resizable";
import { IColumn } from "../../data";

import Histogram from "../visualization/histogram";
import BarChart from "../visualization/barchart";

export interface IHeaderProps {
  columns: IColumn[];
  // columnWidths: number[];
  columnWidths: number[];
  onChangeColumnWidth?: (p: { index: number; width: number }) => any;
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
    chartHeight: 60
  };

  static getDerivedStateFromProps(
    nextProps: IHeaderProps,
    prevState: IHeaderState
  ) {
    if (nextProps.columns !== prevState.columns) {
      const { columns } = nextProps;
      const columnData = columns.map(c => c.series.toArray());
      return { columns, columnData };
    }
    return null;
  }
  private _gridRef: React.RefObject<Grid> = React.createRef();
  private columnWidth: any;

  constructor(props: IHeaderProps) {
    super(props);

    this.state = {
      columns: [],
      scrollLeft: 0,
      scrollTop: 0,
      columnData: []
    };
    this._titleCellRenderer = this._titleCellRenderer.bind(this);
    this._chartCellRenderer = this._chartCellRenderer.bind(this);
    this.renderCell = this.renderCell.bind(this);
  }

  componentDidUpdate(prevProps: IHeaderProps) {
    if (prevProps.columnWidths !== this.props.columnWidths) {
      const grid = this._gridRef.current;
      if (grid)
        grid.recomputeGridSize();
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
    } = this.props;
    console.debug("render table header");

    const columnWidth = ({ index }: { index: number }) => columnWidths[index];

    const titleHeight = hasChart ? height - chartHeight : height;
    const rowHeight = (p: {index: number}) => (p.index === 0 ? titleHeight : chartHeight);
    const grid = (
      <Grid
        cellRenderer={this.renderCell}
        className={`${className} header-title invisible-scrollbar`}
        columnCount={columns.length}
        columnWidth={columnWidth}
        height={height}
        rowHeight={hasChart ? rowHeight : height}
        onScroll={onScroll}
        ref={this._gridRef}
        rowCount={hasChart ? 2 : 1}
        scrollLeft={scrollLeft}
        style={{ ...style, left: 0 }}
        tabIndex={null}
        width={width}
      />
    );

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
        {grid}
      </div>
    );
  }

  renderCell(cellProps: GridCellProps) {
    const {rowIndex} = cellProps;
    if (rowIndex === 0) return this._titleCellRenderer(cellProps);
    else if (this.props.hasChart && rowIndex === 1) return this._chartCellRenderer(cellProps);
  }

  _titleCellRenderer(cellProps: GridCellProps) {
    const { columnIndex, key, style, ...rest } = cellProps;
    const {
      columns,
      height,
      chartHeight,
      hasChart,
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
          lineHeight: `${hasChart ? height - chartHeight : height}px`
        }}
      >
        <span className="cell-content">{columns[columnIndex].name}</span>
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
    // console.log(data);
    const width = columnWidths[columnIndex];
   
    return (
      <div
        className={`cell row-chart col-${columnIndex}`}
        key={key}
        style={style}
      >
        {columns[columnIndex].type === 'numerical'
          ? <Histogram data={data} width={width} height={chartHeight} />
          : <BarChart data={data} width={width} height={chartHeight} />
        }
      </div>
    );
  }
}

interface IColResizerProps {
  className?: string;
  x: number;
  onChangeX: (x: number) => void;
  style?: React.CSSProperties;
  snap: number;
}

interface IColResizerState {}

class ColResizer extends React.Component<IColResizerProps, IColResizerState> {
  static defaultProps = {
    snap: 1
  };
  constructor(props: IColResizerProps) {
    super(props);
    this.state = {};
    this.handleStart = this.handleStart.bind(this);
  }
  render() {
    const { className, x, style } = this.props;
    let classes = ["col-resizer"];
    if (className) classes.push(className);

    return (
      <div
        className={classes.join(" ")}
        style={{ ...style}}
        onMouseDown={this.handleStart}
      />
    );
  }

  handleStart = (event: React.MouseEvent) => {
    event.preventDefault();
    const dragStartMouseX = Math.round(event.pageX);
    const { onChangeX, snap } = this.props;
    const initialX = this.props.x;
    let prevX = initialX;

    window.addEventListener("mousemove", handleResize);
    window.addEventListener("mouseup", stopResize);

    function handleResize(event: MouseEvent): void {
      const delta = event.pageX - dragStartMouseX;
      const newX = Math.round(initialX + Math.round(delta / snap) * snap);
      // console.log(newX);
      if (newX !== prevX) {
        onChangeX(newX);
        prevX = newX;
      }
    }

    function stopResize(event: MouseEvent): void {
      window.removeEventListener("mousemove", handleResize);
      window.removeEventListener("mouseup", stopResize);
    }
  };
}
