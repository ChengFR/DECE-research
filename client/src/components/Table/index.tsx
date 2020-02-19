import * as React from "react";
import {
  AutoSizer,
  ScrollParams,
  SectionRenderedParams,
  Index
} from "react-virtualized";
import Header from "./Header";
import TableGrid, { CellRenderer } from "./TableGrid";
import { IColumn } from "../../data";
import { createColumn } from './common';
import {
  TableColumn,
  IndexWidth,
  changeColumnWidth,
} from "./common";
import "./index.css";


export interface ITableProps {
  // dataFrame: IDataFrame;
  columns: (IColumn<string> | IColumn<number> | TableColumn)[];
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
  columns: TableColumn[];
  scrollTop: number;
  scrollLeft: number;
}

export default class Table extends React.Component<ITableProps, ITableState> {
  static defaultProps = {
    rowHeight: 20,
    fixedColumns: 1,
    showIndex: false
  };

  private _leftGridWidth: number | null = null;

  private tableGrid: React.RefObject<TableGrid> = React.createRef();

  constructor(props: ITableProps) {
    super(props);
    this.state = {
      columns: this.updateColumns(props.columns),
      scrollTop: 0,
      scrollLeft: 0
    };
    this._onScroll = this._onScroll.bind(this);
    this._onScrollLeft = this._onScrollLeft.bind(this);
    this._onScrollTop = this._onScrollTop.bind(this);
    this.onChangeColumnWidth = this.onChangeColumnWidth.bind(this);
    this.defaultCellRenderer = this.defaultCellRenderer.bind(this);
    this.cellRenderer = this.cellRenderer.bind(this);
  }

  updateColumns(
    columns: (IColumn<string> | IColumn<number> | TableColumn)[],
    prevColumns?: TableColumn[]
  ): TableColumn[] {
    return columns.map((c, i) => {
      const prevColumn = prevColumns && prevColumns[i];
      if (prevColumn)
        return {...prevColumn, ...c} as TableColumn;
      return createColumn(c);
    });
  }

  componentDidUpdate(prevProps: ITableProps) {
    if (prevProps.columns !== this.props.columns) {
      this.setState({
        columns: this.updateColumns(this.props.columns, this.state.columns)
      });
    }
  }

  _getLeftGridWidth() {
    const { fixedColumns } = this.props;
    const { columns } = this.state;

    if (this._leftGridWidth == null) {
      let leftGridWidth = 0;

      for (let index = 0; index < fixedColumns; index++) {
        leftGridWidth += columns[index].width;
      }
      this._leftGridWidth = leftGridWidth;
    }

    return this._leftGridWidth;
  }

  public xScale(columnIndex: number) {
    return this.state.columns[columnIndex].xScale;
  }

  public render() {
    console.debug("render table");
    const {
      style,
      rowHeight,
      fixedColumns,
      showIndex,
      rowCount,
      onSectionRendered
    } = this.props;
    const { columns, scrollLeft, scrollTop } = this.state;
    // const getColumnWidth = ({ index }: { index: number }) => columnWidths[index];

    const containerStyle = {
      overflow: "visible",
      ...style
    };

    return (
      <div className="table-container" style={containerStyle}>
        <AutoSizer>
          {({ width, height }) => (
            <div style={{ overflow: "visible" }}>
              <Header
                columns={columns}
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
                columns={columns}
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
    const { columns } = this.state;
    columns.splice(index, 1, changeColumnWidth(columns[index], width));
    // console.log(`change column ${index} width to ${width}`);

    this.setState({ columns: [...columns] });
  }

  cellRenderer: CellRenderer = props => {
    const { cellRenderer } = this.props;
    if (!cellRenderer) return this.defaultCellRenderer(props);
    const result = cellRenderer(props);
    if (result === undefined) return this.defaultCellRenderer(props);
    return result;
  };

  defaultCellRenderer: CellRenderer = props => {
    const { columnIndex, rowIndex } = props;
    const data =
      props.data || this.props.columns[columnIndex].series.at(rowIndex);
    return (
      <div className="cell-content">
        {typeof data === "string" ? data : number2string(data)}
      </div>
    );
  };

  public forceUpdate() {
    this.tableGrid.current?.forceUpdate();
  }

  public recomputeGridSize(params?: {
    columnIndex?: number;
    rowIndex?: number;
  }) {
    this.tableGrid.current?.recomputeGridSize(params);
  }
}

function number2string(x: number): string {
  if (Number.isInteger(x)) return x.toFixed(0);
  return x.toPrecision(4);
}

export * from "./TableGrid";
export * from "./common";
