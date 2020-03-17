import * as React from "react";
import { Switch, Icon, Spin } from "antd";
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
import CompactCFColumn from "components/visualization/CompactCFColumn";
import HeaderChart from './HeaderChart';
import { isColumnNumerical } from '../../data/column';
import { assert } from '../../common/utils';
import { CategoricalColumn } from '../Table/common';
import { CFTableColumn, filterByColumnStates } from './common';
import "./index.scss";

const collapsedCellMargin = {
  ...columnMargin,
  top: 0,
  bottom: 0
};

const LoadingIcon = <Icon type="loading" spin />;

const headerChartHeight = 80;
const headerRowHeights = [30, headerChartHeight];

const headerRowHeight = (params: {index: number}) => {
  return headerRowHeights[params.index];
}

interface ILoadableTableProps extends ITableProps {
  isRowLoaded: (params: Index) => boolean;
  loadMoreRows: (params: IndexRange) => Promise<any>;
  tableRef?: (instance: Table | null) => void;
}

// Deprecated.
class LoadableTable extends React.PureComponent<ILoadableTableProps> {
  private onRowsRendered?: (params: {
    startIndex: number;
    stopIndex: number;
  }) => void;

  private loaderRef: InfiniteLoader | null = null;
  constructor(props: ILoadableTableProps) {
    super(props);
    this.onSectionRendered = this.onSectionRendered.bind(this);
  }

  public resetLoadMoreRowsCache(autoReload: boolean = false) {
    console.debug("Reset loader cache");
    this.loaderRef?.resetLoadMoreRowsCache(autoReload);
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
        ref={ref => {this.loaderRef = ref;}}
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
  cfs?: (CFResponse | undefined)[];
  cfHeight: number;
  rowHeight: number;
  pixel: number;
  getCFs: (params: IndexRange | {index: number[]}) => Promise<CFResponse[]>;
  getCF: (index: number) => Promise<CFResponse>;
}

export interface ICompactTableState {
  columns: CFTableColumn[];
  dataFrame: DataFrame;
  prevDataFrame?: DataFrame;
  rows: RowState[];
  showCF: boolean;
  hovered: [number, number] | null;
  groupByColumn: number;
  // loadedCFs: (CFResponse | undefined)[];
}

export default class CFTableView extends React.Component<
  ICompactTableProps,
  ICompactTableState
> {
  public static defaultProps = {
    cfHeight: 6,
    rowHeight: 20,
    pixel: 1
  };

  private loadedCFs: (CFResponse | undefined)[] = [];
  private tableRef: Table | null = null;
  private loaderRef: LoadableTable | null = null;
  constructor(props: ICompactTableProps) {
    super(props);
     // this.isRowLoaded = this.isRowLoaded.bind(this);
    // this.loadMoreRows = this.loadMoreRows.bind(this);
    this.renderCell = this.renderCell.bind(this);
    this.renderHeaderCell = this.renderHeaderCell.bind(this);
    this.rowHeight = this.rowHeight.bind(this);
    this.onSort = this.onSort.bind(this);
    this.onChangeFilter = this.onChangeFilter.bind(this);
    this.onChangeColumnWidth = this.onChangeColumnWidth.bind(this);
    this.onClearFilter = this.onClearFilter.bind(this);
    this.onHover = this.onHover.bind(this);
    this.onExpandRow = this.onExpandRow.bind(this);
    this.onCollapseRow = this.onCollapseRow.bind(this);
    // this.registerTableRef = this.registerTableRef.bind(this);
    this.loadCF = this.loadCF.bind(this);
    this.onSwitchCF = this.onSwitchCF.bind(this);
    this.getCFs = this.getCFs.bind(this);

    const dataFrame = props.dataset.reorderedDataFrame;
    const cfs = this.props.cfs && this.getCFs(this.props.cfs, this.props.CFMeta, dataFrame);
    this.state = {
      rows: initRowStates(dataFrame.length),
      dataFrame,
      columns: dataFrame.columns.map((c, i) =>
        this.initColumn(c, cfs && cfs[i])
      ),
      hovered: null,
      showCF: false,
      groupByColumn: 0,
    };
   
  }

  public initColumn(column: IColumn<string> | IColumn<number>, cf?: CFSeries): CFTableColumn {
    const c: CFTableColumn = createColumn(column);
    c.onSort = (order: "ascend" | "descend") => this.onSort(c.name, order);
    c.onChangeColumnWidth = (width: number) =>
      this.onChangeColumnWidth(c.name, width);
    c.onFilter = (filter: any) => this.onChangeFilter(c.name, filter);
    if (cf) {
      c.cf = cf;
      c.allCF = cf;
      c.onFilterCF = (filter: any) => this.onChangeCFFilter(c.name, filter);
    }
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
      const cfs = this.props.cfs && this.getCFs(this.props.cfs, this.props.CFMeta, dataFrame);
      return {
        dataFrame,
        columns: dataFrame.columns.map((c, i) => {
          const cf = cfs ? cfs[i] : undefined;
          if (c.name in name2column) {
            // merge and update the column
            return { ...name2column[c.name], ...c, cf } as CFTableColumn;
          }
          // init new column
          return this.initColumn(c, cf);
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
        {this.renderToolBox()}
        {/* <LoadableTable
          isRowLoaded={this.isRowLoaded}
          loadMoreRows={this.loadMoreRows}
          rowCount={rows.length}
          columns={columns}
          fixedColumns={fixedColumns}
          showIndex={true}
          rowHeight={this.rowHeight}
          ref={ref => {this.loaderRef=ref;}}
          // tableRef={this.registerTableRef}
          cellRenderer={this.renderCell}
        /> */}
        <Table
          className="compact-table"
          // onSectionRendered={this.onSectionRendered}
          rowCount={rows.length}
          columns={columns}
          fixedColumns={fixedColumns}
          showIndex={true}
          rowHeight={this.rowHeight}
          ref={ref => {this.tableRef=ref;}}
          // tableRef={this.registerTableRef}
          cellRenderer={this.renderCell}
          headerCellRenderer={this.renderHeaderCell}
          headerRowCount={2}
          headerRowHeight={headerRowHeight}
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

  public renderToolBox() {
    return (
      <div className="toolbox">
        CF: <Switch
          checkedChildren="CF"
          unCheckedChildren="F"
          onChange={this.onSwitchCF}
        />
      </div>
    );
  }

  // registerTableRef(child: Table | null) {
  //   this.tableRef = child;
  // }

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

  private doFiltering(columns: CFTableColumn[]) {
    const { rows } = this.state;
    const baseDataFrame = this.state.prevDataFrame || this.state.dataFrame;
    const newDataFrame = filterByColumnStates(baseDataFrame, columns);
    const newState = this.changeDataFrame(newDataFrame);
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

  onChangeFilter(columnName: string, filter?: string[] | [number, number]) {
    const { columns, rows } = this.state;
    // const baseDataFrame = this.state.prevDataFrame || this.state.dataFrame;
    const index = columns.findIndex(c => c.name === columnName);
    columns[index].filter = filter;
    console.debug("onChangeFilter", columnName, filter);
    this.doFiltering(columns);
    // const filters: {
    //   columnName: string;
    //   filter: string[] | [number, number];
    // }[] = [];
    // columns.forEach(c => {
    //   c.filter && filters.push({ columnName: c.name, filter: c.filter });
    // });

    // const newState = this.changeDataFrame(baseDataFrame.filterBy(filters));
    // console.debug("onChangeFilter", columnName, filter);
    // // console.debug("onChangeFilter", filters, newState);
    // if (newState) {
    //   newState.columns.forEach(
    //     (c, i) => (c.prevSeries = baseDataFrame.columns[i].series)
    //   );
    //   const newIndex = newState.dataFrame.index;
    //   const newRows = filterRows(rows, newIndex);
    //   this.setState({
    //     ...newState,
    //     prevDataFrame: baseDataFrame,
    //     rows: newRows
    //   });
    // }
  }

  onChangeCFFilter(columnName: string, filter?: string[] | [number, number]) {
    const { columns, rows } = this.state;
    const index = columns.findIndex(c => c.name === columnName);
    columns[index].cfFilter = filter;
    console.debug("onChangeCFFilter", columnName, filter);
    this.doFiltering(columns);
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

  renderHeaderCell(props: CellProps) {
    const {rowIndex} = props;
    if (rowIndex === 0) return undefined;
    return this._chartCellRenderer(props);
  }

  _chartCellRenderer(cellProps: CellProps) {
    const { columnIndex } = cellProps;
    const { columns, groupByColumn } = this.state;
    const column = columns[columnIndex];
    const {width } = column;
    console.debug("render chart cell");
    return (
      <HeaderChart
        className="header-chart"
        column={column}
        groupByColumn={columns[groupByColumn]}
        width={width}
        height={headerChartHeight}
        margin={columnMargin}
      />
    );
  }

  renderCellExpanded(props: CellProps, row: ExpandedRow) {
    const { columnIndex, width, rowIndex } = props;
    const { dataset, CFMeta } = this.props;
    const { dataFrame, columns } = this.state;
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
    if (props.isScrolling) return (<Spin indicator={LoadingIcon} delay={300} />);
    // render CFs
    const cfIndex = this.featureIdx2CFIdx(dataFrame, CFMeta)[columnIndex]!;
    return (
      <div className="cell-content">
        <FeatureCF
          baseValue={dataFrame.at(row.index, columnIndex) as number}
          cfValues={cfs.counterfactuals[cfIndex] as number[]}
          xScale={
            columns[columnIndex].xScale as d3.ScaleLinear<number, number>
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
    const { columns, showCF } = this.state;
    if (columnIndex === -1) {
      // index column
      return <div className="cell-content"></div>;
    } else {
      // if (props.isScrolling) return (<Spin indicator={LoadingIcon} delay={300} />);
      // if (showCF) {
        const cfs = this.cfs;
        return (
          <Spin indicator={LoadingIcon} spinning={props.isScrolling} delay={200}>
            <CompactCFColumn 
              data={columns[columnIndex].series.toArray()}
              cfData={showCF ? (cfs && cfs[columnIndex]) : undefined}
              startIndex={rowState.startIndex}
              endIndex={rowState.endIndex}
              pixel={pixel}
              xScale={columns[columnIndex].xScale}
              width={width}
              height={this.rowHeight({ index: rowIndex })}
              margin={collapsedCellMargin}
            />
          </Spin>
        );
      // }
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

  _getRowLabels = memoizeOne((labelColumn: CategoricalColumn): [number[], number[]] => {
    const cat2idx: Map<string, number> = new Map();
    labelColumn.categories?.map((c, i) => cat2idx.set(c, i));
    const labels = labelColumn.series.toArray().map(v => {
      if (!(cat2idx.has(v))) cat2idx.set(v, cat2idx.size);
      return cat2idx.get(v) as number;
    });
    const uniqLabels: number[] = [];
    cat2idx.forEach((v, k) => uniqLabels.push(v));
    return [labels, uniqLabels];
  })

  _groupByArgs(): undefined | [number[], number[]] {
    const {groupByColumn, columns} = this.state;
    const labelColumn = groupByColumn === undefined ? undefined : columns[groupByColumn];
    assert(labelColumn === undefined || !isColumnNumerical(labelColumn));
    return labelColumn && this._getRowLabels(labelColumn);
  }

  // isRowLoaded({ index }: Index): boolean {
  //   // return ;
  //   // if (this.state.showCF) {
  //   //   // index is the indx of the cell (rowState)
  //   //   const rowState = this.state.rows[index];
  //   //   return Boolean(rowState.cfLoaded);
  //   // }
  //   return true;
  // }

  onSwitchCF(showCF: boolean) {
    this.setState({ showCF });
    // this.loaderRef?.resetLoadMoreRowsCache(true);
    this.tableRef?.recomputeGridSize();
  }

  // async loadMoreRows(params: IndexRange) {
  //   // return;
  //   const startRow = this.state.rows[params.startIndex];
  //   const endRow = this.state.rows[params.stopIndex];
  //   console.debug(this.state.dataFrame.index);

  //   let index = this.state.dataFrame.index.slice(
  //     isExpandedRow(startRow) ? startRow.dataIndex : startRow.startIndex,
  //     isExpandedRow(endRow) ? endRow.dataIndex : endRow.endIndex
  //   );
  //   console.debug(index);
  //   const filteredIndex = index.filter(i => !this.loadedCFs[i]);
  //   console.debug(filteredIndex);
  //   const cfs = await this.props.getCFs({index: filteredIndex});
  //   cfs.forEach(cf => {
  //     this.loadedCFs[cf.index] = cf;
  //   });
  //   return cfs;
  // }

  loadCF = async (index: number) => {
    const cf = await this.props.getCF(index);
    this.loadedCFs[cf.index] = cf;
  };

  featureIdx2CFIdx = memoizeOne((dataFrame: DataFrame, cfMeta: DataMeta) => {
    return dataFrame.columns.map(c => cfMeta.getColumnDisc(c.name)?.index);
  });

  getCFs = memoizeOne(processCFs);
  public get cfs() {
    const {cfs, CFMeta} = this.props;
    return cfs ? this.getCFs(cfs, CFMeta, this.state.dataFrame) : undefined;
  }
}

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


type CFSeries = (string | undefined)[] | (number | undefined)[];

function processCFs(cfs: (CFResponse | undefined)[], cfMeta: DataMeta, df: DataFrame): (CFSeries | undefined)[] {
  const index = df.index;
  const columnNames = df.getColumnNames();
  return columnNames.map(c => {
    const col = cfMeta.getColumnDisc(c);
    if (col) {
      const idx = col.index;
      return index.map(i => {
        const cf = cfs[i];
        if (cf && cf.counterfactuals.length > 0) return cf.counterfactuals[0][idx];
        return undefined;
      }) as CFSeries;
    }
    return undefined;
  })
}