import * as React from "react";
import { IDataFrame, Series, IColumn } from "../../data";
import { AutoSizer, ScrollParams } from "react-virtualized";
import { getTextWidth } from "../../common/utils";
import Header from "./Header";
import TableGrid from "./TableGrid";
import "./index.css";

export interface ITableProps {
  dataFrame: IDataFrame;
  onScroll?: (params: ScrollParams) => any;
  style?: React.CSSProperties;
  rowHeight: number;
}

interface ITableState {
  dataFrame?: IDataFrame;
  data: Array<Array<number | string>>;
  columnWidths: number[];
  scrollTop: number;
  scrollLeft: number;
  columns: IColumn[];
}

function initColumnWidths(columns: string[], padding: number = 10) {
  return columns.map(c => Math.ceil(getTextWidth(c) + 2 * padding));
}

export default class Table extends React.Component<ITableProps, ITableState> {
  static defaultProps = {
    rowHeight: 20
  };
  static getDerivedStateFromProps(nextProps: ITableProps, prevState: ITableState) {
    if (nextProps.dataFrame !== prevState.dataFrame) {
      const columns = nextProps.dataFrame.columns;
      const data = nextProps.dataFrame.toColumns();
      return {
        dataFrame: nextProps.dataFrame,
        columns, data
      };
    }

    return null;
  }

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

  public render() {
    console.debug("render table");
    const { dataFrame, style, rowHeight } = this.props;
    const { columnWidths, scrollLeft, scrollTop, columns, data } = this.state;
    // const getColumnWidth = ({ index }: { index: number }) => columnWidths[index];

    console.log(columns);
    // console.log(dataFrame.getColumns().toArray());
    const containerStyle = {
      overflow: "visible",
      ...style
    };
    return (
      <div className="table-container">
        <AutoSizer>
          {({ width, height }) => (
            <div style={containerStyle}>
              <Header
                className="table-header"
                columns={columns}
                columnWidths={columnWidths}
                height={90}
                chartHeight={60}
                hasChart={true}
                width={width}
                onScroll={this._onScrollLeft}
                scrollLeft={scrollLeft}
                onChangeColumnWidth={this.onChangeColumnWidth}
              />
              <TableGrid
                className="table-grid"
                data={data}
                columnWidths={columnWidths}
                rowHeight={rowHeight}
                height={height - 90}
                width={width}
                onScroll={this._onScroll}
                scrollLeft={scrollLeft}
                scrollTop={scrollTop}
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

  onChangeColumnWidth({index, width}: {index: number, width: number}) {
    const {columnWidths} = this.state;
    columnWidths.splice(index, 1, width);
    // console.log(`change column ${index} width to ${width}`);

    this.setState({columnWidths: [...columnWidths]});
  }
}
