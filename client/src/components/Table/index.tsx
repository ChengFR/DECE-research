import * as React from "react";
import * as _ from "lodash";
import {
  AutoSizer,
  ScrollParams,
  SectionRenderedParams,
  Index
} from "react-virtualized";
import Header from "./Header";
import TableGrid, { CellRenderer } from "./TableGrid";
import { IColumn } from "../../data";
import {
  createColumn,
  TableColumn,
  IndexWidth,
  changeColumnWidth,
  infuseCol
} from "./common";
import { number2string } from "common/utils";
import "./index.scss";
import { sum } from "../../common/math";
import SubsetGrid from "./SubsetGrid";

export interface ITableProps {
  // dataFrame: IDataFrame;
  className?: string;
  columns: (IColumn | TableColumn)[];
  onScroll?: (params: ScrollParams) => any;
  style?: React.CSSProperties;
  rowCount: number;
  rowHeight: number | ((params: Index) => number);
  fixedColumns: number;
  cellRenderer?: CellRenderer;
  showIndex: boolean;
  columnWidths?: number[];
  onSectionRendered?: (params: SectionRenderedParams) => any;
  headerRowCount: number;
  headerRowHeight: number | ((params: Index) => number);
  headerCellRenderer?: CellRenderer;
  subsetRowCount: number;
  subsetRowHeight: number | ((params: Index) => number);
  subsetCellRenderer: CellRenderer[];
  onUpdateSubset?: (index: number) => void;
  onCopySubset?: (index: number) => void;
  onDeleteSubset?: (index: number) => void;
}

interface ITableState {
  columns: TableColumn[];
  scrollTop: number;
  scrollLeft: number;
}

export default class Table extends React.PureComponent<
  ITableProps,
  ITableState
  > {
  public static defaultProps = {
    rowHeight: 20,
    fixedColumns: 1,
    showIndex: false,
    headerRowHeight: 30,
    headerRowCount: 1
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
    columns: (IColumn | TableColumn)[],
    prevColumns?: TableColumn[]
  ): TableColumn[] {
    return columns.map((c, i) => {
      const prevColumn = prevColumns && prevColumns[i];
      if (prevColumn) return { ...prevColumn, ...c } as TableColumn;
      else return createColumn(c);
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
      className,
      style,
      rowHeight,
      fixedColumns,
      showIndex,
      rowCount,
      onSectionRendered,
      headerRowCount,
      headerRowHeight,
      headerCellRenderer,
      subsetRowCount,
      subsetRowHeight,
      subsetCellRenderer,
      onUpdateSubset,
      onCopySubset,
      onDeleteSubset,
    } = this.props;
    const { columns, scrollLeft, scrollTop } = this.state;
    // const getColumnWidth = ({ index }: { index: number }) => columnWidths[index];

    const containerStyle = {
      overflow: "visible",
      ...style
    };
    const headerHeight = typeof headerRowHeight === "number" ? headerRowHeight : sum(
      _.range(headerRowCount).map(r => headerRowHeight({ index: r }))
    );

    const subsetHeight = (typeof subsetRowHeight === "number" ? subsetRowHeight : sum(
      _.range(subsetRowCount).map(r => subsetRowHeight({ index: r }))
    ));

    return (
      <div
        className={"table-container" + (className ? ` ${className}` : "")}
        style={containerStyle}
      >
        <AutoSizer>
          {({ width, height }) => (
            <div style={{ overflow: "visible" }}>
              <Header
                columns={columns}
                rowCount={headerRowCount}
                rowHeight={headerRowHeight}
                height={headerHeight}
                chartHeight={60}
                width={width - (showIndex ? IndexWidth : 0)}
                cellRenderer={headerCellRenderer}
                fixedColumns={fixedColumns}
                onScroll={this._onScrollLeft}
                scrollLeft={scrollLeft}
                onChangeColumnWidth={this.onChangeColumnWidth}
                style={{ left: showIndex ? IndexWidth : 0 }}
                operatorWidth={15}
              />
              {subsetCellRenderer.map((renderer, i) =>
                <SubsetGrid
                  columns={columns}
                  rowCount={subsetRowCount}
                  rowHeight={subsetRowHeight}
                  height={subsetHeight}
                  // chartHeight={60}
                  width={width - (showIndex ? IndexWidth : 0)}
                  cellRenderer={renderer}
                  fixedColumns={fixedColumns}
                  onScroll={this._onScrollLeft}
                  scrollLeft={scrollLeft}
                  onChangeColumnWidth={this.onChangeColumnWidth}
                  style={{ left: showIndex ? IndexWidth : 0 }}
                  key={i}
                  operatorWidth={15}
                  onUpdate={onUpdateSubset && onUpdateSubset.bind(this, i)}
                  onCopy={onCopySubset && onCopySubset.bind(this, i)}
                  onDelete={onDeleteSubset && onDeleteSubset.bind(this, i)}
                />)}
              <TableGrid
                rowCount={rowCount}
                columns={columns}
                rowHeight={rowHeight}
                height={height - subsetHeight * subsetCellRenderer.length - headerHeight}
                width={width}
                cellRenderer={this.cellRenderer}
                fixedColumns={fixedColumns}
                onScroll={this._onScroll}
                scrollLeft={scrollLeft}
                scrollTop={scrollTop}
                showIndex={showIndex}
                onSectionRendered={onSectionRendered}
                ref={this.tableGrid}
                operatorWidth={15}
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
    const newCol = infuseCol(changeColumnWidth(columns[index], width), columns[index])
    columns.splice(index, 1, newCol);

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
        <span>{typeof data === "string" ? data : number2string(data)}</span>
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

export * from "./TableGrid";
export * from "./common";
