import * as React from "react";
import {
  AutoSizer,
  ScrollParams,
  SectionRenderedParams,
  Index,
} from "react-virtualized";
import memoize from "fast-memoize";
import memoizeOne from 'memoize-one';
import { getTextWidth } from "../../common/utils";
import Header from "./Header";
import TableGrid, { CellRenderer } from "./TableGrid";
import { IndexWidth, defaultChartMargin } from "./helpers";
import "./index.css";
import { getScaleLinear } from "../visualization/common";
import { IDataFrame, IColumn } from "../../data";

const memoizedGetScaleLinear = memoize(getScaleLinear);

export interface ITableProps {
  // dataFrame: IDataFrame;
  columns: IColumn[];
  rowCount: number;
  onScroll?: (params: ScrollParams) => any;
  style?: React.CSSProperties;
  rowHeight: number | ((params: Index) => number);
  fixedColumns: number;
  cellRenderer?: CellRenderer;
  showIndex: boolean;
  columnWidths?: number[];
  onSectionRendered?: (params: SectionRenderedParams) => any;
}

interface ITableState {
  dataFrame?: IDataFrame;
  columnWidths: number[];
  scrollTop: number;
  scrollLeft: number;
  xScales: (d3.ScaleLinear<number, number> | undefined)[];
}

function initColumnWidths(
  columns: string[],
  padding: number = 10,
  minWidth: number = 80,
  maxWidth: number = 200
) {
  return columns.map(c =>
    Math.min(
      Math.max(minWidth, Math.ceil(getTextWidth(c) + 2 * padding)),
      maxWidth
    )
  );
}

export default class Table extends React.Component<ITableProps, ITableState> {
  static defaultProps = {
    rowHeight: 20,
    fixedColumns: 1,
    showIndex: false
  };
  // static getDerivedStateFromProps(
  //   nextProps: ITableProps,
  //   prevState: ITableState
  // ) {
  //   let newState: Partial<ITableState> = {};
  //   if (nextProps.dataFrame !== prevState.dataFrame) {
  //     newState.dataFrame = nextProps.dataFrame;
  //   }
  //   return newState;
  // }

  private _leftGridWidth: number | null = null;

  private tableGrid: React.RefObject<TableGrid> = React.createRef();

  constructor(props: ITableProps) {
    super(props);
    this.state = {
      columnWidths: initColumnWidths(props.columns.map(c => c.name)),
      scrollTop: 0,
      scrollLeft: 0,
      xScales: [],
    };
    this._onScroll = this._onScroll.bind(this);
    this._onScrollLeft = this._onScrollLeft.bind(this);
    this._onScrollTop = this._onScrollTop.bind(this);
    this.onChangeColumnWidth = this.onChangeColumnWidth.bind(this);
    this.defaultCellRenderer = this.defaultCellRenderer.bind(this);
    this.cellRenderer = this.cellRenderer.bind(this);
  }

  _getLeftGridWidth() {
    const { fixedColumns } = this.props;
    const { columnWidths } = this.state;

    if (this._leftGridWidth == null) {
      let leftGridWidth = 0;

      for (let index = 0; index < fixedColumns; index++) {
        leftGridWidth += columnWidths[index];
      }
      this._leftGridWidth = leftGridWidth;
    }

    return this._leftGridWidth;
  }

  _getXScales = memoizeOne((columns: IColumn[], columnWidths: number[]) => {
    return columns.map((col, i) => {
      if (col.type === 'numerical')
        return memoizedGetScaleLinear(col.series.toArray(), 0, columnWidths[i] - defaultChartMargin.left - defaultChartMargin.right, col.extent);
      return undefined;
    })
  });

  public xScales() {
    const {columnWidths} = this.state;
    return this._getXScales(this.props.columns, columnWidths);
  }

  public render() {
    console.debug("render table");
    const {
      style,
      rowHeight,
      columns,
      fixedColumns,
      showIndex,
      rowCount,
      onSectionRendered
    } = this.props;
    const { columnWidths, scrollLeft, scrollTop } = this.state;
    // const getColumnWidth = ({ index }: { index: number }) => columnWidths[index];

    const containerStyle = {
      overflow: "visible",
      ...style
    };

    const xScales = this.xScales();
    console.debug(xScales);
    return (
      <div className="table-container" style={containerStyle}>
        <AutoSizer>
          {({ width, height }) => (
            <div style={{ overflow: "visible" }}>
              <Header
                xScales={xScales}
                columns={columns}
                columnWidths={columnWidths}
                height={90}
                chartHeight={60}
                hasChart={true}
                width={width - (showIndex ? IndexWidth : 0)}
                fixedColumns={fixedColumns}
                onScroll={this._onScrollLeft}
                scrollLeft={scrollLeft}
                onChangeColumnWidth={this.onChangeColumnWidth}
                style={{ left: showIndex ? IndexWidth : 0 }}
              />
              <TableGrid
                rowCount={rowCount}
                columnCount={columns.length}
                columnWidths={columnWidths}
                rowHeight={rowHeight}
                height={height - 90}
                width={width}
                cellRenderer={this.cellRenderer}
                fixedColumns={fixedColumns}
                onScroll={this._onScroll}
                scrollLeft={scrollLeft}
                scrollTop={scrollTop}
                showIndex={showIndex}
                onSectionRendered={onSectionRendered}
                ref={this.tableGrid}
              />
            </div>
          )}
        </AutoSizer>
      </div>
    );
  }

  _onScrollLeft(scrollInfo: ScrollParams) {
    const { scrollLeft, scrollTop, ...rest } = scrollInfo;
    this._onScroll({
      scrollLeft,
      scrollTop: this.state.scrollTop,
      ...rest
    });
  }

  _onScrollTop(scrollInfo: ScrollParams) {
    const { scrollLeft, scrollTop, ...rest } = scrollInfo;
    this._onScroll({
      scrollTop,
      scrollLeft: this.state.scrollLeft,
      ...rest
    });
  }

  _onScroll(scrollInfo: ScrollParams) {
    const { scrollLeft, scrollTop } = scrollInfo;
    this.setState({
      scrollLeft,
      scrollTop
    });
    const onScroll = this.props.onScroll;
    if (onScroll) {
      onScroll(scrollInfo);
    }
  }

  onChangeColumnWidth({ index, width }: { index: number; width: number }) {
    const { columnWidths } = this.state;
    columnWidths.splice(index, 1, width);
    // console.log(`change column ${index} width to ${width}`);

    this.setState({ columnWidths: [...columnWidths] });
  }

  cellRenderer: CellRenderer = props => {
    const {cellRenderer} = this.props;
    if (!cellRenderer) return this.defaultCellRenderer(props);
    const result = cellRenderer(props);
    if (result === undefined) return this.defaultCellRenderer(props);
    return result;
  }

  defaultCellRenderer: CellRenderer = props => {
    const {columnIndex, rowIndex} = props;
    const data = this.props.columns[columnIndex].series.at(rowIndex);
    return (
      <div className="cell-content">
        {typeof data === "string" ? data : number2string(data)}
      </div>
    );
  };

  public forceUpdate() {
    this.tableGrid.current?.forceUpdate();
  }

  public recomputeGridSize(params?: {columnIndex?: number, rowIndex?: number}) {
    this.tableGrid.current?.recomputeGridSize(params);
  }
}

function number2string(x: number): string {
  if (Number.isInteger(x)) return x.toFixed(0);
  return x.toPrecision(4);
}

export * from "./TableGrid";
export * from "./helpers";
