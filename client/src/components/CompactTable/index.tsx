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
import { CFResponse, SubsetCFResponse, Filter, getSubsetCF } from "api";
import { Dataset, DataMeta, DataFrame, IColumn, buildCFSeries, CFSubset } from "data";
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
import { number2string, notEmpty } from "common/utils";
import CompactCFColumn from "components/visualization/CompactCFColumn";
import HeaderChart from './HeaderChart';
import GroupChart from './SubsetChart';
import { isColumnNumerical, Series, ICatColumn, ISeries } from '../../data/column';
import { assert } from '../../common/utils';
import { CategoricalColumn, isNumericalVColumn } from '../Table/common';
import { filterByColumnStates, SubsetCFTable, CFCategoricalColumn, CFTableColumn, SubsetTableGroup, isNumericalCFColumn, CFNumericalColumn } from './common';
import "./index.scss";
import SubsetChart from "./SubsetChart";
import { group } from "d3";
import SubsetCFHist from "./SubsetCFHist";
import SubsetCFBar from "./SubsetCFBar";
import LabelColumn from "./LabelColumn";
import { defaultCategoricalColor } from "components/visualization/common";

const collapsedCellMargin = {
  ...columnMargin,
  top: 0,
  bottom: 0
};

const LoadingIcon = <Icon type="loading" spin />;

const headerChartHeight = 80;
const subsetChartHeight = 80;
const headerRowHeights = [30, headerChartHeight];

const headerRowHeight = (params: { index: number }) => {
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
        ref={ref => { this.loaderRef = ref; }}
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
  getCFs: (params: IndexRange | { index: number[] }) => Promise<CFResponse[]>;
  getCF: (index: number) => Promise<CFResponse>;

  getSubsetCF: (param: { filters: Filter[] }) => Promise<SubsetCFResponse>;
  defaultSetsubCF: SubsetCFResponse;
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
  // cfSubsets: CFSubset[];
  // allColumns: SubsetCFTable[][];
  cfSubsets: SubsetTableGroup[];
  drawYAxis: boolean;
  groupIndex?: number;
  columnIndex?: number;
  focusedClass?: number;
}

export default class CFTableView extends React.Component<
  ICompactTableProps,
  ICompactTableState
  > {
  public static defaultProps = {
    cfHeight: 6,
    rowHeight: 20,
    pixel: 4
  };

  private loadedCFs: (CFResponse | undefined)[] = [];
  private tableRef: Table | null = null;
  private loaderRef: LoadableTable | null = null;
  private basicColumns: CFTableColumn[];
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
    this.onSelectColumn = this.onSelectColumn.bind(this);
    // this.registerTableRef = this.registerTableRef.bind(this);
    this.loadCF = this.loadCF.bind(this);
    this.onSwitchCF = this.onSwitchCF.bind(this);
    this.onSwichAxis = this.onSwichAxis.bind(this);
    this.getCFs = this.getCFs.bind(this);
    this.initTable = this.initTable.bind(this);
    this.initTableGroup = this.initTableGroup.bind(this);
    this.onSubsetFocusOnClass = this.onSubsetFocusOnClass.bind(this);
    this.onFocusOnClass = this.onFocusOnClass.bind(this);

    this.updateSubset = this.updateSubset.bind(this);
    this.copySubset = this.copySubset.bind(this);
    this.deleteSubset = this.deleteSubset.bind(this);

    this._loadSubsetCache = this._loadSubsetCache.bind(this);
    this._cacheSubsets = this._cacheSubsets.bind(this);
    this.getSubsetFromFilters = this.getSubsetFromFilters.bind(this);

    const dataFrame = props.dataset.reorderedDataFrame;
    const dataMeta = props.dataset.dataMeta;
    const cfs = this.props.cfs && this.getCFs(this.props.cfs, this.props.dataset.dataMeta, dataFrame);
    const cfSubsets = [new CFSubset({ dataset: props.dataset, filters: [], cfData: this.props.defaultSetsubCF.counterfactuals, cfMeta: this.props.CFMeta })];
    this.basicColumns = dataFrame.columns.map((c, i) =>
      this.initColumn(c, cfs && cfs[i])
    );

    this.state = {
      rows: initRowStates(dataFrame.length),
      dataFrame,
      columns: this.basicColumns,
      hovered: null,
      showCF: false,
      groupByColumn: 1,
      drawYAxis: false,

      cfSubsets: cfSubsets.map(
        subset => this.initTableGroup(subset.reorderedDataFrame, subset.dataMeta, false, subset.reorderedSubsetColMat(), subset.reorderedFilters())
      )

    };
  }

  componentDidMount() {
    this._loadSubsetCache();
  }

  public initColumn(column: IColumn, cf?: Series, prototypeColumn?: CFTableColumn): CFTableColumn {
    const c: CFTableColumn = prototypeColumn ? createColumn(prototypeColumn) : createColumn(column);
    c.series = column.series;
    if (isNumericalVColumn(c)) {
      const array = [...c.series.toArray()];
      c.prevSeries = new Series(array.length, i => array[i])
    } else {
      const array = [...c.series.toArray()];
      c.prevSeries = new Series(array.length, i => array[i])
    }
    if (cf) assert(column.series.length === cf.length, `instance number does not match cf number: ${column.series.length}-${cf.length}`);
    c.onSort = (order: "ascend" | "descend") => this.onSort(c.name, order);
    c.onChangeColumnWidth = (width: number) =>
      this.onChangeColumnWidth(c.name, width);
    c.onFilter = (filter?: string[] | [number, number]) => this.onChangeFilter(c.name, filter);
    if (cf) {
      if (isNumericalVColumn(c)) {
        c.cf = cf as Series<number> | undefined;
        const array = [...cf.toArray()] as number[];
        c.allCF = new Series(array.length, i => array[i]);
      }
      else {
        c.cf = cf as Series<string> | undefined;
        const array = [...cf.toArray()] as string[];
        c.allCF = new Series(array.length, i => array[i]);
      }
      c.onFilterCF = (filter?: string[] | [number, number]) => this.onChangeCFFilter(c.name, filter);
    }
    return c;
  }

  public initTable(dataFrame: DataFrame, dataMeta: DataMeta, index: number,
    cfColumns?: Readonly<(IColumn | undefined)[]>, filters?: (Filter | undefined)[], prototypeColumns?: CFTableColumn[]): SubsetCFTable {
    const dataColumns: IColumn[] = dataFrame.columns.map(column => createColumn(column));
    const cfSeries: (Series | undefined)[] = cfColumns ? cfColumns.map(d => d ? new Series(d.series.length, j => d.series.at(j)) : undefined) : []

    const columns: CFTableColumn[] = dataColumns.map((d, i) => {
      // if (isColumnNumerical(d))
      return this.initColumn(d, cfSeries[i], prototypeColumns && prototypeColumns[i]);
      // else
      //   return this.initColumn(d, cfSeries[i])
    });

    const predCol = columns.find(col => dataMeta.prediction && col.name === dataMeta.prediction.name);
    if (predCol === undefined) throw Error("No prediction column");
    const validMask: boolean[] = _.range(predCol.series.length).map((d, i) => predCol.cf ? predCol.series.at(i) !== predCol.cf.at(i) : false);
    columns.forEach(d => d.valid = validMask);
    columns.forEach(d => d.selectedValid = validMask);

    return new SubsetCFTable(columns, index, dataMeta, filters ? filters : []);
  }

  public initTableGroup(dataFrame: DataFrame, dataMeta: DataMeta, deletable: boolean,
    cfColumnMat?: ((IColumn | undefined)[] | undefined)[], filters?: (Filter | undefined)[], prototypeColumns?: CFTableColumn[]): SubsetTableGroup {
    const dataColumns: IColumn[] = dataFrame.columns.map(column => createColumn(column));
    const columnMat: CFTableColumn[][] = _.range(dataColumns.length).map(
      (d, i) => {
        const cfSeries: (Series | undefined)[] = (cfColumnMat && cfColumnMat[i]) ?
          cfColumnMat[i]!.map(d => d ? new Series(d.series.length, j => d.series.at(j)) : undefined) : [];
        const columns: CFTableColumn[] = dataColumns.map((d, i) => {
          return this.initColumn(d, cfSeries[i], prototypeColumns && prototypeColumns[i]);
        });

        const predCol = columns.find(col => dataMeta.prediction && col.name === dataMeta.prediction.name);
        if (predCol === undefined) throw Error("No prediction column");
        const validMask: boolean[] = _.range(predCol.series.length).map((d, i) => predCol.cf ? predCol.series.at(i) !== predCol.cf.at(i) : false);
        columns.forEach(d => d.valid = validMask);
        columns.forEach(d => d.selectedValid = validMask);
        return columns;
      }
    )
    return new SubsetTableGroup(columnMat, dataMeta, filters ? filters : [], deletable)
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
      // const cfs = this.props.cfs && this.getCFs(this.props.cfs, this.props.dataset.dataMeta, dataFrame);
      return {
        dataFrame,
        columns: dataFrame.columns.map((c, i) => {
          // const cf = cfs ? cfs[i] : undefined;
          if (c.name in name2column) {
            // merge and update the column
            return { ...name2column[c.name], ...c } as CFTableColumn;
          }
          // init new column
          return this.initColumn(c);
        })
      };
    }
    return null;
  }

  public componentDidUpdate(prevProps: ICompactTableProps, prevState: ICompactTableState) {
    if (prevProps.dataset !== this.props.dataset) {
      // const newState = this.changeDataFrame(
      //   this.props.dataset.reorderedDataFrame
      // );
      // this.setState(newState);
    }
    this._cacheSubsets();
  }

  public render() {
    const { dataFrame, hovered } = this.state;
    const { rows, cfSubsets: allColumns } = this.state;
    const { dataset } = this.props;
    const rowCount = dataFrame.length;
    const hoveredValue = hovered ? dataFrame.at(...hovered) : "";
    // const fixedColumns =
    //   Number(Boolean(dataset?.dataMeta.prediction)) +
    //   Number(Boolean(dataset?.dataMeta.target));
    const columns = _.range(1, this.state.columns.length).map(d => this.state.columns[d]);
    const fixedColumns = 1;
    console.debug(columns);
    return (
      <Panel title="Table View" initialWidth={960} initialHeight={700} x={300}>
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
          showIndex={false}
          rowHeight={this.rowHeight}
          ref={ref => { this.tableRef = ref; }}
          // tableRef={this.registerTableRef}
          cellRenderer={this.renderCell}
          headerCellRenderer={this.renderHeaderCell}
          headerRowCount={2}
          headerRowHeight={headerRowHeight}
          subsetCellRenderer={allColumns.map((d, i) => this.renderSubsetCell.bind(this, i))}
          subsetRowCount={1}
          subsetRowHeight={subsetChartHeight}
          onUpdateSubset={this.updateSubset}
          onCopySubset={this.copySubset}
          onDeleteSubset={this.deleteSubset}
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
        Axis: <Switch
          onChange={this.onSwichAxis}
        />
      </div>
    );
  }

  // registerTableRef(child: Table | null) {
  //   this.tableRef = child;
  // }

  onChangeColumnWidth(columnName: string, width: number) {
    const { columns, cfSubsets: allColumns } = this.state;
    const index = columns.findIndex(c => c.name === columnName);
    columns.splice(index, 1, changeColumnWidth(columns[index], width));
    allColumns.forEach(tables => tables.tables
      .forEach(table => table.columns.splice(index, 1, changeColumnWidth(table.columns[index], width))))
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
      // newState.columns.forEach(
      //   (c, i) => (c.prevSeries = baseDataFrame.columns[i].series)
      // );
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
    console.log(row);
    console.debug("Expand row", row, dataFrame.index[row], newRows);
    // this.loadCF(dataFrame.index[row]).then(() =>
    this.setState({ rows: newRows })
    // );
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

  onSelectColumn(groupIndex: number, columnIndex: number) {
    const { cfSubsets } = this.state;
    const table = cfSubsets[groupIndex].tables[columnIndex];
    const columns = table.columns.map(d => ({ ...d }));
    const dataFrame = DataFrame.fromColumns(columns);
    this.setState({ columns, dataFrame, prevDataFrame: undefined, groupIndex, columnIndex });
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
    const { rowIndex } = props;
    if (rowIndex === 0) return undefined;
    return this._chartCellRenderer(props);
  }

  _chartCellRenderer(cellProps: CellProps) {
    // const { columnIndex } = cellProps;
    const columnIndex = cellProps.columnIndex + 1;
    const { columns, groupByColumn, focusedClass } = this.state;
    const column = columns[columnIndex];
    const { width } = column;
    console.debug("render chart cell");
    if (columnIndex === 1) {
      return <LabelColumn
        className={`subset-chart`}
        predColumn={columns[1] as CFCategoricalColumn}
        targetColumn={columns[0] as CFCategoricalColumn}
        // column={columns[columnIndex]}
        // protoColumnGroupBy={this.basicColumns[groupByColumn]}
        width={width}
        height={subsetChartHeight}
        margin={this.state.drawYAxis ? { ...columnMargin, left: 30 } : columnMargin}
        histogramType='stacked'
        focusedCategory={focusedClass}
        onFocusCategory={this.onFocusOnClass}
      />
    }
    else {
      if (isNumericalCFColumn(column)) {
        return <SubsetCFHist
          className={`header-chart`}
          column={column}
          protoColumn={this.basicColumns[columnIndex] as CFNumericalColumn}
          // column={columns[columnIndex]}
          groupByColumn={columns[groupByColumn]}
          // protoColumnGroupBy={this.basicColumns[groupByColumn]}
          width={width}
          height={subsetChartHeight}
          margin={this.state.drawYAxis ? { ...columnMargin, left: 30 } : columnMargin}
          onUpdateFilter={(extent?: [number, number]) => {
            // extent && column.onFilter(extent)
            column.onFilter && column.onFilter(extent);
          }}
          onUpdateCFFilter={(extent?: [number, number]) => {
            // extent && column.onFilter(extent)
            column.onFilterCF && column.onFilterCF(extent);
          }}
          histogramType='side-by-side'
          k={`header-${columnIndex}`}
          expandable={false}
          drawLineChart={true}
          drawHandle={false}
          drawAxis={this.state.drawYAxis}
          selected={false}
          layout={'header'}
          focusedCategory={focusedClass}
          color={focusedClass === 1 ? i => defaultCategoricalColor(i ^ 1) : defaultCategoricalColor}
        />
      }
      else {
        return (
          <SubsetCFBar
            className={`header-chart`}
            column={column}
            protoColumn={this.basicColumns[columnIndex] as CFCategoricalColumn}
            // column={columns[columnIndex]}
            groupByColumn={columns[groupByColumn]}
            // onUpdateFilter={(categories?: string[]) => tableGroup.updateFilter(columnIndex, undefined, categories)}
            // protoColumnGroupBy={this.basicColumns[groupByColumn]}
            onUpdateFilter={(categories?: string[]) => {
              column.onFilter && column.onFilter(categories)
            }}
            onUpdateCFFilter={(categories?: string[]) => {
              column.onFilterCF && column.onFilterCF(categories)
            }}
            width={width}
            height={subsetChartHeight}
            margin={this.state.drawYAxis ? { ...columnMargin, left: 30 } : columnMargin}
            k={`header-${columnIndex}`}
            histogramType='stacked'
            drawHandle={false}
            drawAxis={this.state.drawYAxis}
            selected={false}
            layout={"header"}
            expandable={false}
            focusedCategory={focusedClass}
            color={focusedClass === 1 ? i => defaultCategoricalColor(i ^ 1) : defaultCategoricalColor}
          />
        );
      }
    }

  }

  renderSubsetCell(groupIndex: number, cellProps: CellProps) {
    // const { columnIndex } = cellProps;
    const columnIndex = cellProps.columnIndex + 1;
    const { groupByColumn, cfSubsets } = this.state;
    const tableGroup = cfSubsets[groupIndex];
    const columns = tableGroup.tables[columnIndex].columns;
    const column = columns[columnIndex];
    const { width } = column;

    console.debug("render subset cell");
    if (columnIndex === 1) {
      return <LabelColumn
        className={`subset-chart`}
        predColumn={columns[1] as CFCategoricalColumn}
        targetColumn={columns[0] as CFCategoricalColumn}
        // column={columns[columnIndex]}
        // protoColumnGroupBy={this.basicColumns[groupByColumn]}
        width={width}
        height={subsetChartHeight}
        margin={this.state.drawYAxis ? { ...columnMargin, left: 30 } : columnMargin}
        histogramType='stacked'
        focusedCategory={tableGroup.focusedClass}
        onFocusCategory={this.onSubsetFocusOnClass.bind(this, groupIndex)}
      />
    }
    else {
      if (isNumericalCFColumn(column)) {
        return <SubsetCFHist
          className={`subset-chart`}
          column={column}
          protoColumn={this.basicColumns[columnIndex] as CFNumericalColumn}
          // column={columns[columnIndex]}
          groupByColumn={columns[groupByColumn]}
          // protoColumnGroupBy={this.basicColumns[groupByColumn]}
          width={width}
          height={subsetChartHeight}
          margin={this.state.drawYAxis ? { ...columnMargin, left: 30 } : columnMargin}
          k={`subset-${groupIndex}-${columnIndex}`}
          onUpdateFilter={(extent?: [number, number]) => tableGroup.updateFilter(columnIndex, extent)}
          histogramType='side-by-side'
          onSelect={() => this.onSelectColumn(groupIndex, columnIndex)}
          expandable={true}
          drawLineChart={true}
          drawHandle={true}
          drawAxis={this.state.drawYAxis}
          selected={groupIndex === this.state.groupIndex && columnIndex === this.state.columnIndex}
          focusedCategory={tableGroup.focusedClass}
          color={tableGroup.focusedClass === 1 ? i => defaultCategoricalColor(i ^ 1) : defaultCategoricalColor}
        />
      }
      else {
        return (
          <SubsetCFBar
            className={`subset-chart`}
            column={column}
            protoColumn={this.basicColumns[columnIndex] as CFCategoricalColumn}
            // column={columns[columnIndex]}
            groupByColumn={columns[groupByColumn]}
            onUpdateFilter={(categories?: string[]) => tableGroup.updateFilter(columnIndex, undefined, categories)}
            // protoColumnGroupBy={this.basicColumns[groupByColumn]}
            width={width}
            height={subsetChartHeight}
            margin={this.state.drawYAxis ? { ...columnMargin, left: 30 } : columnMargin}
            k={`subset-${groupIndex}-${columnIndex}`}
            histogramType='side-by-side'
            drawHandle={true}
            drawAxis={this.state.drawYAxis}
            selected={groupIndex === this.state.groupIndex && columnIndex === this.state.groupIndex}
            onSelect={() => this.onSelectColumn(groupIndex, columnIndex)}
            expandable={true}
            focusedCategory={tableGroup.focusedClass}
            color={tableGroup.focusedClass === 1 ? i => defaultCategoricalColor(i ^ 1) : defaultCategoricalColor}
          />
        );
      }
    }
  }


  renderCellExpanded(props: CellProps, row: ExpandedRow) {
    const { width, rowIndex } = props;
    const columnIndex = props.columnIndex + 1;
    const { dataset } = this.props;
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
    if (dataset.dataMeta.target && columnIndex === dataset.dataMeta.target.index) {
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
    const cfIndex = this.featureIdx2CFIdx(dataFrame, dataset.dataMeta)[columnIndex]!;
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
          margin={this.state.drawYAxis ? { ...columnMargin, left: 30 } : columnMargin}
        // style={{marginTop: 2, position: 'relative'}}
        />
      </div>
    );
  }

  renderCellCollapsed(props: CellProps, rowState: CollapsedRows) {
    const { rowIndex, width } = props;
    const columnIndex = props.columnIndex + 1;
    const { pixel } = this.props;
    const { columns, showCF } = this.state;
    const column = columns[columnIndex];
    if (columnIndex === 1) {
      // index column
      return <div className="cell-content"></div>;
    } else {
      // if (props.isScrolling) return (<Spin indicator={LoadingIcon} delay={300} />);
      // if (showCF) {
      // const cfs = this.cfs;
      // const cf = cfs && notEmpty(cfs[columnIndex]) ? cfs[columnIndex] : undefined;
      let data: number[] | string[] = [];
      let cfData: (number | undefined)[] | (string | undefined)[] | undefined = undefined;
      if (isNumericalCFColumn(column)) {
        cfData = column.cf?.toArray();
        cfData = cfData && cfData.filter((d, i) => column.valid ? column.valid[i] : false);
        data = column.series.toArray();
        data = data.filter((d, i) => column.valid ? column.valid[i] : false);
      }
      else {
        cfData = column.cf?.toArray();
        cfData = cfData && cfData.filter((d, i) => column.valid ? column.valid[i] : false);
        data = column.series.toArray();
        data = data.filter((d, i) => column.valid ? column.valid[i] : false);
      }
      return (
        <Spin indicator={LoadingIcon} spinning={props.isScrolling} delay={200}>
          <CompactCFColumn
            data={data}
            cfData={showCF ? cfData : undefined}
            startIndex={rowState.startIndex}
            endIndex={rowState.endIndex}
            pixel={pixel}
            xScale={columns[columnIndex].xScale}
            width={width}
            height={this.rowHeight({ index: rowIndex })}
            margin={collapsedCellMargin}
          // onHoverRow={idx => idx && this.onExpandRow(idx)}
          // onClickRow={idx => idx && this.onExpandRow(idx)}
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
    const { groupByColumn, columns } = this.state;
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

  onSwichAxis(drawYAxis: boolean) {
    this.setState({ drawYAxis });
    this.tableRef?.recomputeGridSize();
  }

  onSubsetFocusOnClass(groupId: number, newClass?: number) {
    const { cfSubsets } = this.state;
    cfSubsets[groupId]._focuseOn(newClass);
    this.setState({ cfSubsets: [...cfSubsets] });
  }

  onFocusOnClass(newClass?: number) {
    this.setState({ focusedClass: newClass });
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

  getCFs = memoizeOne(buildCFSeries);
  public get cfs() {
    const { cfs, dataset } = this.props;
    return cfs ? this.getCFs(cfs, dataset.dataMeta, this.state.dataFrame) : undefined;
  }

  public async updateSubset(index: number) {
    const { cfSubsets } = this.state;
    const filters = cfSubsets[index].stashedFilters;
    const prevColumns = cfSubsets[index].keyColumns;
    const newTable = await this.getSubsetFromFilters(filters, prevColumns);
    cfSubsets.splice(index, 1, newTable);

    this.setState({ cfSubsets });
  }

  public async getSubsetFromFilters(filters: Filter[], prevColumns?: CFTableColumn[]) {
    const { getSubsetCF, dataset, CFMeta } = this.props;
    const cfResponse = await getSubsetCF({ filters });
    const newSubset = new CFSubset({ dataset, filters, cfData: cfResponse.counterfactuals, cfMeta: CFMeta })
    console.debug("subset constructed");
    const newTable = this.initTableGroup(newSubset.reorderedDataFrame, newSubset.dataMeta, false, newSubset.reorderedSubsetColMat(), newSubset.reorderedFilters(), prevColumns);
    console.debug("table constructed");
    return newTable;
  }

  public copySubset(index: number) {
    const { cfSubsets } = this.state;
    cfSubsets.splice(index, 0, cfSubsets[index].copy());
    console.log(cfSubsets);
    this.setState({ cfSubsets });
  }

  public deleteSubset(index: number) {
    const { cfSubsets } = this.state;
    cfSubsets.splice(index, 1);
    this.setState({ cfSubsets });
  }

  private _cacheSubsets() {
    const { cfSubsets } = this.state;
    const { CFMeta } = this.props;
    const filters = cfSubsets.map(subset => subset.filters);
    const index = CFMeta.features[0].name;
    localStorage.setItem(`${index}-cfSubsets`, JSON.stringify(filters));
  }

  async _loadSubsetCache() {
    const { CFMeta } = this.props;
    const index = CFMeta.features[0].name;
    const cacheString = localStorage.getItem(`${index}-cfSubsets`);
    // const cacheString = localStorage.getItem(`cfSubsets`);
    let filterMat: Filter[][] = cacheString ? JSON.parse(cacheString) : [[]];
    if (filterMat.length > 0) {
      let cfSubsets: SubsetTableGroup[] = [];
      for (let filters of filterMat) {
        const newTable = await this.getSubsetFromFilters(filters);
        cfSubsets.push(newTable);
      }

      console.log(cfSubsets);
      this.setState({ cfSubsets })
    }
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