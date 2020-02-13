import * as React from "react";
import { IDataFrame, IColumn } from "../../data";
import {
  AutoSizer,
  ScrollParams,
  SectionRenderedParams
} from "react-virtualized";
import { getTextWidth } from "../../common/utils";
import Header from "./Header";
import TableGrid, { defaultCellRenderer, CellRenderer } from "./TableGrid";
import "./index.css";
import { IndexWidth } from "./helpers";

export interface ITableProps {
  dataFrame: IDataFrame;
  onScroll?: (params: ScrollParams) => any;
  style?: React.CSSProperties;
  rowHeight: number;
  fixedColumns: number;
  cellRenderer: CellRenderer;
  showIndex: boolean;
  onSectionRendered?: (params: SectionRenderedParams) => any;
}

interface ITableState {
  dataFrame?: IDataFrame;
  data: Array<Array<number | string>>;
  columnWidths: number[];
  scrollTop: number;
  scrollLeft: number;
  columns: IColumn[];
}

function initColumnWidths(
  columns: string[],
  padding: number = 10,
  minWidth: number = 80,
  maxWidth: number = 400
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
    cellRenderer: defaultCellRenderer,
    showIndex: false
  };
  static getDerivedStateFromProps(
    nextProps: ITableProps,
    prevState: ITableState
  ) {
    let newState: Partial<ITableState> = {};
    if (nextProps.dataFrame !== prevState.dataFrame) {
      newState.dataFrame = nextProps.dataFrame;
      newState.columns = nextProps.dataFrame.columns;
      newState.data = nextProps.dataFrame.toColumns();
    }
    return newState;
  }

  private _leftGridWidth: number | null = null;

  constructor(props: ITableProps) {
    super(props);
    this.state = {
      columnWidths: initColumnWidths(props.dataFrame.getColumnNames()),
      scrollTop: 0,
      scrollLeft: 0,
      columns: [],
      data: []
    };
    this._onScroll = this._onScroll.bind(this);
    this._onScrollLeft = this._onScrollLeft.bind(this);
    this._onScrollTop = this._onScrollTop.bind(this);
    this.onChangeColumnWidth = this.onChangeColumnWidth.bind(this);
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

  public render() {
    console.debug("render table");
    const {
      style,
      rowHeight,
      fixedColumns,
      cellRenderer,
      showIndex,
      onSectionRendered
    } = this.props;
    const { columnWidths, scrollLeft, scrollTop, columns, data } = this.state;
    // const getColumnWidth = ({ index }: { index: number }) => columnWidths[index];

    // console.log(dataFrame.getColumns().toArray());
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
                data={data}
                columnWidths={columnWidths}
                rowHeight={rowHeight}
                height={height - 90}
                width={width}
                cellRenderer={cellRenderer}
                fixedColumns={fixedColumns}
                onScroll={this._onScroll}
                scrollLeft={scrollLeft}
                scrollTop={scrollTop}
                showIndex={showIndex}
                onSectionRendered={onSectionRendered}
              />
            </div>
          )}
        </AutoSizer>
      </div>
    );
  }

  // _renderFixedBar() {
  //   const { dataFrame, style, rowHeight, fixedColumns } = this.props;
  //   const { columnWidths, scrollLeft, scrollTop, columns, data } = this.state;
  //   return (
  //     <div className="table-fixedbar">
  //       <Header
  //         className="table-header"
  //         columns={columns}
  //         columnWidths={columnWidths}
  //         height={90}
  //         chartHeight={60}
  //         hasChart={true}
  //         width={width}
  //         onScroll={this._onScrollLeft}
  //         scrollLeft={scrollLeft}
  //         onChangeColumnWidth={this.onChangeColumnWidth}
  //       />
  //       <TableGrid
  //         className="table-grid"
  //         data={data}
  //         columnWidths={columnWidths}
  //         rowHeight={rowHeight}
  //         height={height - 90}
  //         width={width}
  //         onScroll={this._onScroll}
  //         scrollLeft={scrollLeft}
  //         scrollTop={scrollTop}
  //       />
  //     </div>
  //   );
  // }

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
}
