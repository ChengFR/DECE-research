import * as React from "react";
import _ from "lodash";
import memoizeOne from "memoize-one";
import {
  InfiniteLoader,
  SectionRenderedParams,
  Index,
  IndexRange,
  InfiniteLoaderChildProps
} from "react-virtualized";
import { CFResponse } from "api";
import { Dataset, DataMeta, DataFrame, IColumn } from "data";
import Panel from "components/Panel";
import Table, { CellProps, columnMargin } from "components/Table";
import {
  RowState,
  CollapsedRows,
  ExpandedRow,
  isExpandedRow,
  initRowStates,
  reorderRows,
  filterRows,
  expandRows,
  reduceRows,
  collapseRows
} from "./table_state";
import StackedFeature from "../visualization/stackedFeature";
import FeatureCF from "components/visualization/counterfactuals";
import {
  TableColumn,
  changeColumnWidth,
  createColumn,
  ITableProps
} from "../Table";
import { number2string } from "common/utils";
import "./index.css";

const collapsedCellMargin = {
  ...columnMargin,
  top: 0,
  bottom: 0
};

interface ILoadableTableProps extends ITableProps {
  isRowLoaded: (params: Index) => boolean;
  loadMoreRows: (params: IndexRange) => Promise<any>;
  tableRef?: (instance: Table | null) => void;
}

class LoadableTable extends React.PureComponent<ILoadableTableProps> {
  private onRowsRendered?: (params: {
    startIndex: number;
    stopIndex: number;
  }) => void;
  constructor(props: ILoadableTableProps) {
    super(props);
    this.onSectionRendered = this.onSectionRendered.bind(this);
  }
  public render() {
    const {
      rowCount,
      isRowLoaded,
      loadMoreRows,
      tableRef,
      ...rest
    } = this.props;
    return (
      <InfiniteLoader
        isRowLoaded={isRowLoaded}
        loadMoreRows={loadMoreRows}
        rowCount={rowCount}
      >
        {({ onRowsRendered, registerChild }: InfiniteLoaderChildProps) => {
          // console.debug("called table renderer");
          this.onRowsRendered = onRowsRendered;
          return (
            <Table
              className="compact-table"
              rowCount={rowCount}
              onSectionRendered={this.onSectionRendered}
              ref={(child: Table | null) => {
                tableRef && tableRef(child);
                return registerChild(child);
              }}
              {...rest}
            />
          );
        }}
      </InfiniteLoader>
    );
  }

  public onSectionRendered(params: SectionRenderedParams) {
    console.debug("onSectionRendered", params);
    return (
      this.onRowsRendered &&
      this.onRowsRendered({
        startIndex: params.rowStartIndex,
        stopIndex: params.rowStopIndex
      })
    );
  }
}

export interface ICompactTableProps {
  dataset: Dataset;
  CFMeta: DataMeta;
  cfHeight: number;
  rowHeight: number;
  pixel: number;
  getCFs: (params: IndexRange) => Promise<CFResponse[]>;
  getCF: (index: number) => Promise<CFResponse>;
}

export interface ICompactTableState {
  columns: TableColumn[];
  dataFrame: DataFrame;
  prevDataFrame?: DataFrame;
  rows: RowState[];
  hovered: [number, number] | null;
  // loadedCFs: (CFResponse | undefined)[];
}

export default class CFTableView extends React.Component<
  ICompactTableProps,
  ICompactTableState
> {
  static defaultProps = {
    cfHeight: 6,
    rowHeight: 20,
    pixel: 1
  };

  private loadedCFs: (CFResponse | undefined)[] = [];
  private tableRef: Table | null = null;
  constructor(props: ICompactTableProps) {
    super(props);

    this.state = {
      rows: initRowStates(props.dataset.dataFrame.length),
      dataFrame: props.dataset.reorderedDataFrame,
      columns: props.dataset.reorderedDataFrame.columns.map(c =>
        this.initColumn(c)
      ),
      hovered: null
    };
    this.isRowLoaded = this.isRowLoaded.bind(this);
    this.loadMoreRows = this.loadMoreRows.bind(this);
    this.renderCell = this.renderCell.bind(this);
    this.rowHeight = this.rowHeight.bind(this);
    this.onSort = this.onSort.bind(this);
    this.onChangeFilter = this.onChangeFilter.bind(this);
    this.onChangeColumnWidth = this.onChangeColumnWidth.bind(this);
    this.onClearFilter = this.onClearFilter.bind(this);
    this.onHover = this.onHover.bind(this);
    this.onExpandRow = this.onExpandRow.bind(this);
    this.onCollapseRow = this.onCollapseRow.bind(this);
    this.registerTableRef = this.registerTableRef.bind(this);
    this.loadCF = this.loadCF.bind(this);
  }

  public initColumn(column: IColumn<string> | IColumn<number>): TableColumn {
    const c = createColumn(column);
    c.onSort = (order: "ascend" | "descend") => this.onSort(c.name, order);
    c.onChangeColumnWidth = (width: number) =>
      this.onChangeColumnWidth(c.name, width);
    c.onFilter = (filter: any) => this.onChangeFilter(c.name, filter);
    return c;
  }

  public rowHeight({ index }: Index): number {
    return this.computeRowHeights(this.state.rows)[index];
  }

  computeRowHeights = memoizeOne((rows: RowState[]) => {
    const { cfHeight, pixel, rowHeight } = this.props;
    return rows.map(row => {
      if (isExpandedRow(row)) {
        const cfs = this.loadedCFs[row.dataIndex];
        if (!cfs) return rowHeight;
        return Math.max(
          rowHeight,
          cfs.counterfactuals[0].length * cfHeight +
            columnMargin.top +
            columnMargin.bottom
        );
      } else {
        return pixel * (row.endIndex - row.startIndex + 1);
      }
    });
  });

  changeDataFrame(dataFrame: DataFrame) {
    if (dataFrame !== this.state.dataFrame) {
      const name2column = _.keyBy(this.state.columns, c => c.name);
      return {
        dataFrame,
        columns: dataFrame.columns.map(c => {
          if (c.name in name2column) {
            return { ...name2column[c.name], ...c } as TableColumn;
          }
          return this.initColumn(c);
        })
      };
    }
    return null;
  }

  public componentDidUpdate(prevProps: ICompactTableProps) {
    if (prevProps.dataset !== this.props.dataset) {
      const newState = this.changeDataFrame(
        this.props.dataset.reorderedDataFrame
      );
      this.setState(newState);
    }
  }

  public render() {
    const { dataFrame, hovered } = this.state;
    const { rows, columns } = this.state;
    const { dataset } = this.props;
    const rowCount = dataFrame.length;
    const hoveredValue = hovered ? dataFrame.at(...hovered) : "";
    const fixedColumns =
      Number(Boolean(dataset?.dataMeta.prediction)) +
      Number(Boolean(dataset?.dataMeta.target));

    return (
      <Panel title="Table View" initialWidth={960} initialHeight={600}>
        <LoadableTable
          isRowLoaded={this.isRowLoaded}
          loadMoreRows={this.loadMoreRows}
          rowCount={rows.length}
          columns={columns}
          fixedColumns={fixedColumns}
          showIndex={true}
          rowHeight={this.rowHeight}
          tableRef={this.registerTableRef}
          cellRenderer={this.renderCell}
        />
        {hovered && (
          <CornerInfo
            row={hovered[0]}
            column={hovered[1]}
            value={
              typeof hoveredValue === "string"
                ? hoveredValue
                : number2string(hoveredValue)
            }
          />
        )}
      </Panel>
    );
  }

  registerTableRef(child: Table | null) {
    this.tableRef = child;
  }

  onChangeColumnWidth(columnName: string, width: number) {
    const { columns } = this.state;
    const index = columns.findIndex(c => c.name === columnName);
    columns.splice(index, 1, changeColumnWidth(columns[index], width));

    this.setState({ columns: [...columns] });
  }

  onSort(columnName?: string, order: "ascend" | "descend" = "ascend") {
    let newDataFrame =
      columnName === undefined
        ? this.props.dataset.reorderedDataFrame
        : this.state.dataFrame.sortBy(columnName, order);
    const newState = this.changeDataFrame(newDataFrame);
    if (newState) {
      newState.columns.forEach(
        c => (c.sorted = c.name === columnName ? order : null)
      );
      const rows = reorderRows(this.state.rows, newDataFrame.index);
      this.setState({ ...newState, rows });
    }
  }

  onClearFilter() {
    this.state.columns.forEach(c => delete c.filter);
    const newState = this.changeDataFrame(
      this.state.prevDataFrame || this.props.dataset.reorderedDataFrame
    );
    if (newState) {
      const rows = filterRows(this.state.rows, newState.dataFrame.index);
      this.setState({ ...newState, rows });
    }
  }

  onChangeFilter(columnName: string, filter?: string[] | [number, number]) {
    const { columns, rows } = this.state;
    const baseDataFrame = this.state.prevDataFrame || this.state.dataFrame;
    const index = columns.findIndex(c => c.name === columnName);
    columns[index].filter = filter;
    const filters: {
      columnName: string;
      filter: string[] | [number, number];
    }[] = [];
    columns.forEach(c => {
      c.filter && filters.push({ columnName: c.name, filter: c.filter });
    });

    const newState = this.changeDataFrame(baseDataFrame.filterBy(filters));
    // console.debug("onChangeFilter", columns);
    // console.debug("onChangeFilter", filters, newState);
    if (newState) {
      newState.columns.forEach(
        (c, i) => (c.prevSeries = baseDataFrame.columns[i].series)
      );
      const newIndex = newState.dataFrame.index;
      const newRows = filterRows(rows, newIndex);
      this.setState({
        ...newState,
        prevDataFrame: baseDataFrame,
        rows: newRows
      });
    }
  }

  onHover(row: number | null, column: number | null) {
    // console.log(`hovering ${row} ${column}`);
    const { hovered } = this.state;
    if (hovered && row === hovered[0] && column === hovered[1]) return;
    if (row === null || column === null) this.setState({ hovered: null });
    else this.setState({ hovered: [row, column] });
  }

  onExpandRow(row: number) {
    const { rows, dataFrame } = this.state;
    const newRows = expandRows(rows, row, row + 1, [dataFrame.index[row]]);
    console.debug("Expand row", row, dataFrame.index[row], newRows);
    this.loadCF(dataFrame.index[row]).then(() =>
      this.setState({ rows: newRows })
    );
  }

  onCollapseRow(row: number) {
    const { rows, dataFrame } = this.state;
    const state = rows[row];
    if (isExpandedRow(state)) {
      const newRows = collapseRows(rows, state.index, state.index + 1);
      console.debug("Collapse row", row, dataFrame.index[state.index], newRows);
      this.setState({ rows: newRows });
    } else {
      throw "This should not happen!";
    }
    
  }

  renderCell(props: CellProps) {
    const rowState = this.state.rows[props.rowIndex];
    if (isExpandedRow(rowState)) {
      return this.renderCellExpanded(props, rowState);
    } else {
      return this.renderCellCollapsed(props, rowState);
    }
  }

  renderCellExpanded(props: CellProps, row: ExpandedRow) {
    const { columnIndex, width, rowIndex } = props;
    const { dataset, CFMeta } = this.props;
    const { dataFrame } = this.state;
    if (columnIndex === -1) {
      // index column
      return (
        <div
          className="cell-content"
          onContextMenu={e => {
            e.preventDefault();
            this.onCollapseRow(rowIndex);
          }}
        >
          {row.dataIndex}
        </div>
      );
    }
    if (columnIndex === dataset.dataMeta.target.index) {
      return (
        <div className="cell-content">
          <span>{dataFrame.at(row.index, columnIndex)}</span>
        </div>
      );
    }
    const cfs = this.loadedCFs[row.dataIndex];
    if (!cfs) return undefined;
    // render CFs
    const cfIndex = this.featureIdx2CFIdx(dataFrame, CFMeta)[columnIndex]!;
    return (
      <div className="cell-content">
        <FeatureCF
          baseValue={dataFrame.at(row.index, columnIndex) as number}
          cfValues={cfs.counterfactuals[cfIndex] as number[]}
          xScale={
            this.tableRef?.xScale(columnIndex) as d3.ScaleLinear<number, number>
          }
          width={width}
          height={this.rowHeight({ index: rowIndex })}
          margin={columnMargin}
          // style={{marginTop: 2, position: 'relative'}}
        />
      </div>
    );
  }

  renderCellCollapsed(props: CellProps, rowState: CollapsedRows) {
    const { columnIndex, rowIndex, width } = props;
    const { pixel } = this.props;
    const { columns } = this.state;
    if (columnIndex === -1) {
      // index column
      return <div className="cell-content"></div>;
    } else {
      return (
        <StackedFeature
          data={columns[columnIndex].series.toArray()}
          startIndex={rowState.startIndex}
          endIndex={rowState.endIndex}
          pixel={pixel}
          xScale={columns[columnIndex].xScale}
          width={width}
          height={this.rowHeight({ index: rowIndex })}
          margin={collapsedCellMargin}
          onHoverRow={row => this.onHover(row, columnIndex)}
          onClickRow={this.onExpandRow}
          // style={{marginTop: 2, position: 'relative'}}
        />
      );
    }
  }

  isRowLoaded({ index }: Index): boolean {
    return true;
    // index is the indx of the cell (rowState)
    // const rowState = this.state.rows[index];
    // return !!this.loadedCFs[index];
  }

  async loadMoreRows(params: IndexRange) {
    return;
    const cfs = await this.props.getCFs(params);
    cfs.forEach(cf => {
      this.loadedCFs[cf.index] = cf;
    });
    return cfs;
  }

  loadCF = async (index: number) => {
    const cf = await this.props.getCF(index);
    this.loadedCFs[cf.index] = cf;
  };

  featureIdx2CFIdx = memoizeOne((dataFrame: DataFrame, cfMeta: DataMeta) => {
    return dataFrame.columns.map(c => cfMeta.getColumnDisc(c.name)?.index);
  });
}

interface IControlsProps {
  onClearFilters?: () => any;
  onClearSort?: () => any;
}

const Controls: React.FunctionComponent<IControlsProps> = props => {
  return <div></div>;
};

interface ICornerInfoProps {
  row: number;
  column: number;
  value: string;
}

const CornerInfo: React.FunctionComponent<ICornerInfoProps> = props => {
  const { row, column, value } = props;
  return (
    <div className="corner-info">
      {value} ({row}, {column})
    </div>
  );
};
