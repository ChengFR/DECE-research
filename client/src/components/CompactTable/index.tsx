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
import { CFResponse, SubsetCFResponse, Filter, getSubsetCF, CounterFactual } from "api";
import { Dataset, DataMeta, DataFrame, IColumn,  _CFSubset, CFDataFrame } from "data";
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
import { isColumnNumerical, Series, ICatColumn, ISeries } from '../../data/column';
import { assert } from '../../common/utils';
import { CatTableColumn, isNumericalVColumn, VColumn, VCatColumn, NumTableColumn } from '../Table/common';
// import { filterByColumnStates, SubsetCFTable, CFCatColumn, CFTableColumn, SubsetTableGroup, isNumericalCFColumn, CFNumColumn, getValidData, getValidCfData } from './common';
import "./index.scss";
import SubsetCFHist from "./SubsetCFHist";
// import SubsetCFBar from "./SubsetCFBar";
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
// class LoadableTable extends React.Component<ILoadableTableProps> {
//   private onRowsRendered?: (params: {
//     startIndex: number;
//     stopIndex: number;
//   }) => void;

//   private loaderRef: InfiniteLoader | null = null;
//   constructor(props: ILoadableTableProps) {
//     super(props);
//     this.onSectionRendered = this.onSectionRendered.bind(this);
//   }

//   public resetLoadMoreRowsCache(autoReload: boolean = false) {
//     console.debug("Reset loader cache");
//     this.loaderRef?.resetLoadMoreRowsCache(autoReload);
//   }

//   public render() {
//     const {
//       rowCount,
//       isRowLoaded,
//       loadMoreRows,
//       tableRef,
//       ...rest
//     } = this.props;
//     return (
//       <InfiniteLoader
//         isRowLoaded={isRowLoaded}
//         loadMoreRows={loadMoreRows}
//         rowCount={rowCount}
//         ref={ref => { this.loaderRef = ref; }}
//       >
//         {({ onRowsRendered, registerChild }: InfiniteLoaderChildProps) => {
//           // console.debug("called table renderer");
//           this.onRowsRendered = onRowsRendered;
//           return (
//             <Table
//               className="compact-table"
//               rowCount={rowCount}
//               onSectionRendered={this.onSectionRendered}
//               ref={(child: Table | null) => {
//                 tableRef && tableRef(child);
//                 return registerChild(child);
//               }}
//               {...rest}
//             />
//           );
//         }}
//       </InfiniteLoader>
//     );
//   }

//   public onSectionRendered(params: SectionRenderedParams) {
//     console.debug("onSectionRendered", params);
//     return (
//       this.onRowsRendered &&
//       this.onRowsRendered({
//         startIndex: params.rowStartIndex,
//         stopIndex: params.rowStopIndex
//       })
//     );
//   }
// }

export interface ICompactTableProps {
  cfHeight: number;
  rowHeight: number;
  pixel: number;

  defaultSubset: _CFSubset;
  getSubsetCF: (param: { filters: Filter[] }) => Promise<_CFSubset>;
  // updateQueryInstance?: (queryInstance: CounterFactual) => void;
}

export interface ICompactTableState {
  subsets: _CFSubset[];
  focusedDF: CFDataFrame;
  featCols: VColumn[];
  predCol: VCatColumn;

  rows: RowState[];
  showCF: boolean;
  hovered: [number, number] | null;

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
  // private loaderRef: LoadableTable | null = null;
  // private basicColumns: CFTableColumn[];

  private featureNames: string[];
  private predName: string;
  private targetName: string;
  constructor(props: ICompactTableProps) {
    super(props);
    // this.isRowLoaded = this.isRowLoaded.bind(this);
    // this.loadMoreRows = this.loadMoreRows.bind(this);
    this.renderCell = this.renderCell.bind(this);
    this.renderHeaderCell = this.renderHeaderCell.bind(this);
    this.rowHeight = this.rowHeight.bind(this);
    // this.onSort = this.onSort.bind(this);
    // this.onChangeFilter = this.onChangeFilter.bind(this);
    // // this.onChangeColumnWidth = this.onChangeColumnWidth.bind(this);
    // this.onClearFilter = this.onClearFilter.bind(this);
    this.onHover = this.onHover.bind(this);
    this.onExpandRow = this.onExpandRow.bind(this);
    this.onClickRow = this.onClickRow.bind(this);
    this.onCollapseRow = this.onCollapseRow.bind(this);
    this.onSelectColumn = this.onSelectColumn.bind(this);
    this.onUpdateFilter = this.onUpdateFilter.bind(this);
    // this.registerTableRef = this.registerTableRef.bind(this);
    // this.loadCF = this.loadCF.bind(this);
    this.onSwitchCF = this.onSwitchCF.bind(this);
    this.onSwichAxis = this.onSwichAxis.bind(this);
    // this.getCFs = this.getCFs.bind(this);
    // this.initTable = this.initTable.bind(this);
    // this.initTableGroup = this.initTableGroup.bind(this);
    this.onSubsetFocusOnClass = this.onSubsetFocusOnClass.bind(this);
    this.onFocusOnClass = this.onFocusOnClass.bind(this);

    this.updateSubset = this.updateSubset.bind(this);
    this.copySubset = this.copySubset.bind(this);
    this.deleteSubset = this.deleteSubset.bind(this);

    this._loadSubsetCache = this._loadSubsetCache.bind(this);
    this._cacheSubsets = this._cacheSubsets.bind(this);
    // this.getSubsetFromFilters = this.getSubsetFromFilters.bind(this);

    // const dataFrame = props.dataset.reorderedDataFrame;
    // const dataMeta = props.dataset.dataMeta;
    // const cfs = this.props.cfs && this.getCFs(this.props.cfs, this.props.dataset.dataMeta, dataFrame);
    // const cfSubsets = [new CFSubset({ dataset: props.dataset, filters: [], cfData: this.props.defaultSetsubCF.counterfactuals, cfMeta: this.props.CFMeta })];
    // this.basicColumns = dataFrame.columns.map((c, i) =>
    //   this.initColumn(c, cfs && cfs[i])
    // );

    // this.state = {
    //   rows: initRowStates(dataFrame.length),
    //   dataFrame,
    //   columns: this.basicColumns,
    //   hovered: null,
    //   showCF: true,
    //   groupByColumn: 1,
    //   drawYAxis: false,

    //   subsets: cfSubsets.map(
    //     subset => this.initTableGroup(subset.reorderedDataFrame, subset.dataMeta, false, subset.reorderedSubsetColMat(), subset.reorderedFilters())
    //   )

    // };

    const focusedDF = this.props.defaultSubset.CFDataFrames[0];
    this.featureNames = this.props.defaultSubset.dataMeta.features.map(d => d.name);
    this.predName = this.props.defaultSubset.dataMeta.prediction!.name;
    this.targetName = this.props.defaultSubset.dataMeta.target!.name;
    this.state = {
      subsets: [this.props.defaultSubset],
      focusedDF: focusedDF,
      featCols: this.featureNames.map(name => createColumn(focusedDF.getColumnByName(name))),
      predCol: createColumn(focusedDF.getColumnByName(this.predName)) as CatTableColumn,
      hovered: null,
      showCF: true,
      // groupByColumn: 1,
      drawYAxis: false,
      rows: initRowStates(focusedDF.length),
    }
  }

  componentDidMount() {
    this._loadSubsetCache();
  }

  // public initColumn(column: IColumn, cf?: Series, prototypeColumn?: CFTableColumn): CFTableColumn {
  //   const c: CFTableColumn = prototypeColumn ? createColumn(prototypeColumn) : createColumn(column);
  //   c.series = column.series;
  //   if (isNumericalVColumn(c)) {
  //     const array = [...c.series.toArray()];
  //     c.prevSeries = new Series(array.length, i => array[i])
  //   } else {
  //     const array = [...c.series.toArray()];
  //     c.prevSeries = new Series(array.length, i => array[i])
  //   }
  //   if (cf) assert(column.series.length === cf.length, `instance number does not match cf number: ${column.series.length}-${cf.length}`);
  //   c.onSort = (order: "ascend" | "descend") => this.onSort(c.name, order);
  //   c.onChangeColumnWidth = (width: number) =>
  //     this.onChangeColumnWidth(c.name, width);
  //   c.onFilter = (filter?: string[] | [number, number]) => this.onChangeFilter(c.name, filter);
  //   if (cf) {
  //     if (isNumericalVColumn(c)) {
  //       c.cf = cf as Series<number> | undefined;
  //       const array = [...cf.toArray()] as number[];
  //       c.allCF = new Series(array.length, i => array[i]);
  //     }
  //     else {
  //       c.cf = cf as Series<string> | undefined;
  //       const array = [...cf.toArray()] as string[];
  //       c.allCF = new Series(array.length, i => array[i]);
  //     }
  //     c.onFilterCF = (filter?: string[] | [number, number]) => this.onChangeCFFilter(c.name, filter);
  //   }
  //   return c;
  // }

  // public initTable(dataFrame: DataFrame, dataMeta: DataMeta, index: number,
  //   cfColumns?: Readonly<(IColumn | undefined)[]>, filters?: (Filter | undefined)[], prototypeColumns?: CFTableColumn[]): SubsetCFTable {
  //   const dataColumns: IColumn[] = dataFrame.columns.map(column => createColumn(column));
  //   const cfSeries: (Series | undefined)[] = cfColumns ? cfColumns.map(d => d ? new Series(d.series.length, j => d.series.at(j)) : undefined) : []

  //   const columns: CFTableColumn[] = dataColumns.map((d, i) => {
  //     // if (isColumnNumerical(d))
  //     return this.initColumn(d, cfSeries[i], prototypeColumns && prototypeColumns[i]);
  //     // else
  //     //   return this.initColumn(d, cfSeries[i])
  //   });

  //   const predCol = columns.find(col => dataMeta.prediction && col.name === dataMeta.prediction.name);
  //   if (predCol === undefined) throw Error("No prediction column");
  //   const validMask: boolean[] = _.range(predCol.series.length).map((d, i) => predCol.cf ? predCol.series.at(i) !== predCol.cf.at(i) : false);
  //   columns.forEach(d => d.valid = validMask);
  //   columns.forEach(d => d.selectedValid = validMask);

  //   return new SubsetCFTable(columns, index, dataMeta, filters ? filters : []);
  // }

  // public initTableGroup(dataFrame: DataFrame, dataMeta: DataMeta, deletable: boolean,
  //   cfColumnMat?: ((IColumn | undefined)[] | undefined)[], filters?: (Filter | undefined)[], prototypeColumns?: CFTableColumn[]): SubsetTableGroup {
  //   const dataColumns: IColumn[] = dataFrame.columns.map(column => createColumn(column));
  //   const columnMat: CFTableColumn[][] = _.range(dataColumns.length).map(
  //     (d, i) => {
  //       const cfSeries: (Series | undefined)[] = (cfColumnMat && cfColumnMat[i]) ?
  //         cfColumnMat[i]!.map(d => d ? new Series(d.series.length, j => d.series.at(j)) : undefined) : [];
  //       const columns: CFTableColumn[] = dataColumns.map((d, i) => {
  //         return this.initColumn(d, cfSeries[i], prototypeColumns && prototypeColumns[i]);
  //       });

  //       const predCol = columns.find(col => dataMeta.prediction && col.name === dataMeta.prediction.name);
  //       if (predCol === undefined) throw Error("No prediction column");
  //       const validMask: boolean[] = _.range(predCol.series.length).map((d, i) => predCol.cf ? predCol.series.at(i) !== predCol.cf.at(i) : false);
  //       columns.forEach(d => d.valid = validMask);
  //       columns.forEach(d => d.selectedValid = validMask);
  //       return columns;
  //     }
  //   )
  //   return new SubsetTableGroup(columnMat, dataMeta, filters ? filters : [], deletable)
  // }

  static infuseCol(vcol: VColumn, icol: IColumn): TableColumn {
    if (isNumericalVColumn(vcol) && isColumnNumerical(icol)) {
      return { ...vcol, ...icol };
    }
    else if (!isNumericalVColumn(vcol) && !isColumnNumerical(icol)) {
      return { ...vcol, ...icol };
    }
    else {
      throw "The type of the column and the column style should be consistent.";
    }
  }

  private getValidFilter(df: CFDataFrame) {
    const pred = df.getColumnByName(this.predName).series as ISeries<string>;
    const cfPred = df.getCFColumnByName(this.predName).series as ISeries<string>;
    assert(pred.length === cfPred.length);
    const validFilter = (id: number) => (pred.at(id) !== cfPred.at(id));
    return validFilter;
  }

  private makeHeaderCols(): [TableColumn[], TableColumn[]] {
    const { focusedDF, predCol, featCols } = this.state;
    const cols: TableColumn[] = [];
    const CFCols: TableColumn[] = [];
    console.log(this.predName,focusedDF.getCFColumnByName(this.predName));
    cols.push(CFTableView.infuseCol(predCol, focusedDF.getColumnByName(this.predName)));
    CFCols.push(CFTableView.infuseCol(predCol, focusedDF.getCFColumnByName(this.predName)));
    this.featureNames.forEach((name, i) => {
      cols.push(CFTableView.infuseCol(featCols[i], focusedDF.getColumnByName(name)));
      CFCols.push(CFTableView.infuseCol(featCols[i], focusedDF.getCFColumnByName(name)));
    });

    return [cols, CFCols];
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

  // changeDataFrame(dataFrame: CFDataFrame) {
  //   if (dataFrame !== this.state.focusedDF) {
  //     const name2column = _.keyBy(this.state.columns, c => c.name);
  //     // const cfs = this.props.cfs && this.getCFs(this.props.cfs, this.props.dataset.dataMeta, dataFrame);
  //     return {
  //       dataFrame,
  //       columns: dataFrame.columns.map((c, i) => {
  //         // const cf = cfs ? cfs[i] : undefined;
  //         if (c.name in name2column) {
  //           // merge and update the column
  //           return { ...name2column[c.name], ...c } as CFTableColumn;
  //         }
  //         // init new column
  //         return this.initColumn(c);
  //       })
  //     };
  //   }
  //   return null;
  // }

  public componentDidUpdate(prevProps: ICompactTableProps, prevState: ICompactTableState) {
    // if (prevProps.dataset !== this.props.dataset) {
    //   // const newState = this.changeDataFrame(
    //   //   this.props.dataset.reorderedDataFrame
    //   // );
    //   // this.setState(newState);
    // }
    this._cacheSubsets();
  }

  public render() {
    const { focusedDF, hovered } = this.state;
    const { rows, subsets: allColumns } = this.state;
    const { defaultSubset } = this.props;
    const rowCount = focusedDF.length;
    const hoveredValue = hovered ? focusedDF.at(...hovered) : "";
    // const fixedColumns =
    //   Number(Boolean(dataset?.dataMeta.prediction)) +
    //   Number(Boolean(dataset?.dataMeta.target));
    // const columns = _.range(1, focusedDF.columns.length).map(d => focusedDF.columns[d]);
    const fixedColumns = 1;
    const columns = this.makeHeaderCols()[0];
    return (
      <Panel title="Table View" initialWidth={960} initialHeight={700} x={300} y={5}>
        {/* {this.renderToolBox()} */}
        {this.renderLegend()}
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

  public renderLegend() {
    const { focusedDF } = this.state;
    const dataMeta = this.props.defaultSubset.dataMeta;
    const color = defaultCategoricalColor;
    const classes = dataMeta.target &&
      focusedDF.columns[dataMeta.target.index].categories;
    return classes && (
      <div className="legend">
        {classes.map((d, i) => <div className="legend-container">
          <span className="legend-class">{d}</span>
          <div className="legend-color-div" style={{ backgroundColor: color(i) }} />
        </div>)}
      </div>
    )
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

  // onChangeColumnWidth(columnName: string, width: number) {
  //   const { focusedDF, subsets: allColumns, predCol, featCols } = this.state;
  //   const columns = [predCol, ...featCols];
  //   const index = columns.findIndex(c => c.name === columnName);
  //   columns.splice(index, 1, changeColumnWidth(columns[index], width));
  //   allColumns.forEach(tables => tables.tables
  //     .forEach(table => table.columns.splice(index, 1, changeColumnWidth(table.columns[index], width))))
  //   this.setState({ featCols: [...columns] });
  // }

  // onSort(columnName?: string, order: "ascend" | "descend" = "ascend") {
  //   let newDataFrame =
  //     columnName === undefined
  //       ? this.props.dataset.reorderedDataFrame
  //       : this.state.dataFrame.sortBy(columnName, order);
  //   const newState = this.changeDataFrame(newDataFrame);
  //   if (newState) {
  //     newState.columns.forEach(
  //       c => (c.sorted = c.name === columnName ? order : null)
  //     );
  //     const rows = reorderRows(this.state.rows, newDataFrame.index);
  //     this.setState({ ...newState, rows });
  //   }
  // }

  // onClearFilter() {
  //   this.state.featCols.forEach(c => delete c.filter);
  //   const newState = this.changeDataFrame(
  //     this.state.prevDataFrame || this.props.dataset.reorderedDataFrame
  //   );
  //   if (newState) {
  //     const rows = filterRows(this.state.rows, newState.dataFrame.index);
  //     this.setState({ ...newState, rows });
  //   }
  // }

  // private doFiltering(columns: CFTableColumn[]) {
  //   const { rows } = this.state;
  //   const baseDataFrame = this.state.prevDataFrame || this.state.dataFrame;
  //   const newDataFrame = filterByColumnStates(baseDataFrame, columns);
  //   const newState = this.changeDataFrame(newDataFrame);
  //   // console.debug("onChangeFilter", filters, newState);
  //   if (newState) {
  //     // newState.columns.forEach(
  //     //   (c, i) => (c.prevSeries = baseDataFrame.columns[i].series)
  //     // );
  //     const newIndex = newState.dataFrame.index;
  //     const newRows = filterRows(rows, newIndex);
  //     this.setState({
  //       ...newState,
  //       prevDataFrame: baseDataFrame,
  //       rows: newRows
  //     });
  //   }
  // }

  // onChangeFilter(columnName: string, filter?: string[] | [number, number]) {
  //   const { featCols: columns, rows } = this.state;
  //   // const baseDataFrame = this.state.prevDataFrame || this.state.dataFrame;
  //   const index = columns.findIndex(c => c.name === columnName);
  //   columns[index].filter = filter;
  //   console.debug("onChangeFilter", columnName, filter);
  //   this.doFiltering(columns);
  //   // const filters: {
  //   //   columnName: string;
  //   //   filter: string[] | [number, number];
  //   // }[] = [];
  //   // columns.forEach(c => {
  //   //   c.filter && filters.push({ columnName: c.name, filter: c.filter });
  //   // });

  //   // const newState = this.changeDataFrame(baseDataFrame.filterBy(filters));
  //   // console.debug("onChangeFilter", columnName, filter);
  //   // // console.debug("onChangeFilter", filters, newState);
  //   // if (newState) {
  //   //   newState.columns.forEach(
  //   //     (c, i) => (c.prevSeries = baseDataFrame.columns[i].series)
  //   //   );
  //   //   const newIndex = newState.dataFrame.index;
  //   //   const newRows = filterRows(rows, newIndex);
  //   //   this.setState({
  //   //     ...newState,
  //   //     prevDataFrame: baseDataFrame,
  //   //     rows: newRows
  //   //   });
  //   // }
  // }

  // onChangeCFFilter(columnName: string, filter?: string[] | [number, number]) {
  //   const { featCols: columns, rows } = this.state;
  //   const index = columns.findIndex(c => c.name === columnName);
  //   columns[index].cfFilter = filter;
  //   console.debug("onChangeCFFilter", columnName, filter);
  //   this.doFiltering(columns);
  // }

  onHover(row: number | null, column: number | null) {
    // console.log(`hovering ${row} ${column}`);
    const { hovered } = this.state;
    if (hovered && row === hovered[0] && column === hovered[1]) return;
    if (row === null || column === null) this.setState({ hovered: null });
    else this.setState({ hovered: [row, column] });
  }

  onExpandRow(row: number) {
    const { rows, focusedDF } = this.state;
    const newRows = expandRows(rows, row, row + 1, [focusedDF.index[row]]);
    console.log(row);
    console.debug("Expand row", row, focusedDF.index[row], newRows);
    // this.loadCF(dataFrame.index[row]).then(() =>
    this.setState({ rows: newRows })
    // );
  }

  onCollapseRow(row: number) {
    const { rows, focusedDF } = this.state;
    const state = rows[row];
    if (isExpandedRow(state)) {
      const newRows = collapseRows(rows, state.index, state.index + 1);
      console.debug("Collapse row", row, focusedDF.index[state.index], newRows);
      this.setState({ rows: newRows });
    } else {
      throw "This should not happen!";
    }
  }

  onSelectColumn(groupIndex: number, columnIndex: number) {
    const { subsets } = this.state;
    const focusedDF = subsets[groupIndex].CFDataFrames[columnIndex - 1].copy();
    // const columns = table.columns.map(d => ({ ...d }));
    // const dataFrame = DataFrame.fromColumns(columns);
    this.setState({ focusedDF, groupIndex, columnIndex });
  }

  onUpdateFilter(groupIndex: number, columnIndex: number, newFilter: Filter) {
    const {subsets} = this.state;
    const newSubset = subsets[groupIndex].updateFilter(columnIndex - 1, newFilter);
    subsets.splice(groupIndex, 1, newSubset);
    this.setState({subsets});
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
    const columnIndex = cellProps.columnIndex;
    const { featCols, predCol, focusedClass, focusedDF } = this.state;
    // const column = columns[columnIndex];
    // const { width } = column;
    console.debug("render chart cell");
    if (columnIndex === 0) {
      return <LabelColumn
        className={`subset-chart`}
        predColumn={CFTableView.infuseCol(predCol, focusedDF.getColumnByName(this.predName)) as CatTableColumn}
        targetColumn={CFTableView.infuseCol(predCol, focusedDF.getColumnByName(this.targetName)) as CatTableColumn}
        width={predCol.width}
        height={subsetChartHeight}
        margin={this.state.drawYAxis ? { ...columnMargin, left: 30 } : columnMargin}
        histogramType='stacked'
        focusedCategory={focusedClass}
        onFocusCategory={this.onFocusOnClass}
      />
    }
    else {
      const featName = this.featureNames[columnIndex - 1];
      const column = CFTableView.infuseCol(featCols[columnIndex - 1], focusedDF.getColumnByName(featName));
      const CFColumn = CFTableView.infuseCol(featCols[columnIndex - 1], focusedDF.getCFColumnByName(featName));
      const groupByColumn = CFTableView.infuseCol(predCol, focusedDF.getColumnByName(this.predName)) as CatTableColumn;

      if (isNumericalVColumn(column) && isNumericalVColumn(CFColumn)) {
        return <SubsetCFHist
          className={`header-chart`}
          column={column}
          CFColumn={CFColumn}
          validFilter= {this.getValidFilter(focusedDF)}
          protoColumn={column}
          // column={columns[columnIndex]}
          labelColumn={groupByColumn}
          // protoColumnGroupBy={this.basicColumns[groupByColumn]}
          width={column.width}
          height={subsetChartHeight}
          margin={this.state.drawYAxis ? { ...columnMargin, left: 30 } : columnMargin}
          onUpdateFilter={(extent?: [number, number]) => {
            // extent && column.onFilter(extent)
            column.onFilter && column.onFilter(extent);
          }}
          onUpdateCFFilter={(extent?: [number, number]) => {
            // extent && column.onFilter(extent)
            CFColumn.onFilter && CFColumn.onFilter(extent);
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
      else if (!isNumericalVColumn(column) && !isNumericalVColumn(CFColumn)) {
        // return (
        //   <SubsetCFBar
        //     className={`header-chart`}
        //     column={column}
        //     protoColumn={this.basicColumns[columnIndex] as CFCatColumn}
        //     // column={columns[columnIndex]}
        //     groupByColumn={columns[groupByColumn]}
        //     // onUpdateFilter={(categories?: string[]) => tableGroup.updateFilter(columnIndex, undefined, categories)}
        //     // protoColumnGroupBy={this.basicColumns[groupByColumn]}
        //     onUpdateFilter={(categories?: string[]) => {
        //       column.onFilter && column.onFilter(categories)
        //     }}
        //     onUpdateCFFilter={(categories?: string[]) => {
        //       column.onFilterCF && column.onFilterCF(categories)
        //     }}
        //     width={width}
        //     height={subsetChartHeight}
        //     margin={this.state.drawYAxis ? { ...columnMargin, left: 30 } : columnMargin}
        //     k={`header-${columnIndex}`}
        //     histogramType='side-by-side'
        //     drawHandle={false}
        //     drawAxis={this.state.drawYAxis}
        //     selected={false}
        //     layout={"header"}
        //     expandable={false}
        //     focusedCategory={focusedClass}
        //     color={focusedClass === 1 ? i => defaultCategoricalColor(i ^ 1) : defaultCategoricalColor}
        //   />
        // );
      }
      else {
        throw "Type of column and CF column should be consistent."
      }
    }

  }

  renderSubsetCell(groupIndex: number, cellProps: CellProps) {
    // const { columnIndex } = cellProps;
    const columnIndex = cellProps.columnIndex;
    const { subsets, predCol, featCols } = this.state;
    const subset = subsets[groupIndex];
    // const columns = tableGroup.tables[columnIndex].columns;
    // const column = columns[columnIndex];
    // const { width } = column;

    console.debug("render subset cell");
    if (columnIndex === 0) {
      if (subset.prediction && subset.target) {
        const predColumn = CFTableView.infuseCol(predCol, subset.prediction);
        const targetColumn = CFTableView.infuseCol(predCol, subset.target);
        return <LabelColumn
          className={`subset-chart`}
          predColumn={predColumn as CatTableColumn}
          targetColumn={targetColumn as CatTableColumn}
          // column={columns[columnIndex]}
          // protoColumnGroupBy={this.basicColumns[groupByColumn]}
          width={predColumn.width}
          height={subsetChartHeight}
          margin={this.state.drawYAxis ? { ...columnMargin, left: 30 } : columnMargin}
          histogramType='stacked'
          focusedCategory={subset.focusedClass}
          onFocusCategory={this.onSubsetFocusOnClass.bind(this, groupIndex)}
        />
      }
    }
    else {
      const df = subset.CFDataFrames[columnIndex - 1];
      const featName = this.featureNames[columnIndex - 1];
      const column = CFTableView.infuseCol(featCols[columnIndex - 1], df.getColumnByName(featName));
      const CFColumn = CFTableView.infuseCol(featCols[columnIndex - 1], df.getCFColumnByName(featName));
      const labelColumn = CFTableView.infuseCol(predCol, df.getColumnByName(this.predName)) as CatTableColumn;
      assert(column.series.length === CFColumn.series.length);

      if (isNumericalVColumn(column) && isNumericalVColumn(CFColumn)) {
        return <SubsetCFHist
          className={`subset-chart`}
          column={column}
          CFColumn={CFColumn}
          validFilter= {this.getValidFilter(df)}
          // protoColumn={this.basicColumns[columnIndex] as CFNumColumn}
          labelColumn={labelColumn}
          selectedRange={subset.filters[columnIndex - 1].extent}
          width={column.width}
          height={subsetChartHeight}
          margin={this.state.drawYAxis ? { ...columnMargin, left: 30 } : columnMargin}
          k={`subset-${groupIndex}-${columnIndex}`}
          onUpdateFilter={(extent?: [number, number]) => this.onUpdateFilter(groupIndex, columnIndex, {name: column.name, extent})}
          histogramType='side-by-side'
          onSelect={() => this.onSelectColumn(groupIndex, columnIndex)}
          expandable={true}
          drawLineChart={true}
          drawHandle={true}
          drawAxis={this.state.drawYAxis}
          selected={groupIndex === this.state.groupIndex && columnIndex === this.state.columnIndex}
          focusedCategory={subset.focusedClass}
          color={subset.focusedClass === 1 ? i => defaultCategoricalColor(i ^ 1) : defaultCategoricalColor}
        />
      }
      else {
        // return (
        //   <SubsetCFBar
        //     className={`subset-chart`}
        //     column={column}
        //     protoColumn={this.basicColumns[columnIndex] as CFCatColumn}
        //     // column={columns[columnIndex]}
        //     labelColumn={columns[groupByColumn]}
        //     onUpdateFilter={(categories?: string[]) => tableGroup.updateFilter(columnIndex, undefined, categories)}
        //     // protoColumnGroupBy={this.basicColumns[groupByColumn]}
        //     width={width}
        //     height={subsetChartHeight}
        //     margin={this.state.drawYAxis ? { ...columnMargin, left: 30 } : columnMargin}
        //     k={`subset-${groupIndex}-${columnIndex}`}
        //     histogramType='side-by-side'
        //     drawHandle={true}
        //     drawAxis={this.state.drawYAxis}
        //     selected={groupIndex === this.state.groupIndex && columnIndex === this.state.columnIndex}
        //     onSelect={() => this.onSelectColumn(groupIndex, columnIndex)}
        //     expandable={true}
        //     focusedCategory={tableGroup.focusedClass}
        //     color={tableGroup.focusedClass === 1 ? i => defaultCategoricalColor(i ^ 1) : defaultCategoricalColor}
        //   />
        // );
      }
    }
  }


  renderCellExpanded(props: CellProps, row: ExpandedRow) {
    const { width, rowIndex } = props;
    const columnIndex = props.columnIndex;
    // const { dataset } = this.props;
    const { predCol, featCols, showCF, focusedDF } = this.state;
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
    else if (columnIndex === 0) {
      const column: TableColumn = { ...predCol, ...focusedDF.getColumnByName(this.predName) as ICatColumn };
      const CFColumn: TableColumn = { ...predCol, ...focusedDF.getCFColumnByName(this.predName) as ICatColumn };
      const data = column.series.toArray();
      const cfData = CFColumn.series.toArray();
      return (
        <div className="cell-content">
          {/* <span>{dataFrame.at(row.index, columnIndex)}</span> */}
          <span>{`${data[row.index].toString().substring(0, 3)}->${cfData && cfData[row.index].toString().substring(0, 3)}`}</span>
        </div>
      );
    }
    else {
      if (props.isScrolling) return (<Spin indicator={LoadingIcon} delay={300} />);

      const featName = this.featureNames[columnIndex - 1];
      const column = { ...featCols[columnIndex - 1], ...focusedDF.getColumnByName(featName) } as TableColumn;
      const CFColumn = { ...featCols[columnIndex - 1], ...focusedDF.getCFColumnByName(featName) } as TableColumn;
      const data = column.series.toArray();
      const cfData = CFColumn.series.toArray();

      const originVal = data[row.index];
      const cfVal = cfData != undefined ? cfData[row.index] : undefined;
      const originStr = typeof (originVal) === 'string' ? originVal : originVal.toFixed(column.precision);
      if (originVal === cfVal) {
        return <div className="cell-content">
          <span>{`${originStr}`}</span>
        </div>
      }
      else {
        let color = "#ccc";
        if (typeof (originVal) === 'number' && typeof (cfVal) === 'number') {
          color = originVal > cfVal ? "#c06f5b" : "#9dbd78";
        }
        return <div className="cell-content">
          <div className="cell-content-container">
            <span>{`${originStr}`}</span>
            <svg viewBox="0 0 200 200" height="60%" className="cell-triangle">
              <polygon points="0, 10 126,100, 0, 190" fill={color} />
            </svg>
            <span>{`${cfVal}`}</span>
          </div>
        </div>
      }
    }

  }

  renderCellCollapsed(props: CellProps, rowState: CollapsedRows) {
    const { rowIndex, width } = props;
    const columnIndex = props.columnIndex;
    const { pixel } = this.props;
    const { predCol, featCols, showCF, focusedDF } = this.state;
    // const columns = featCols[columnIndex];
    if (columnIndex === -1) {
      // index column
      return <div className="cell-content"></div>;
    } else {
      // if (props.isScrolling) return (<Spin indicator={LoadingIcon} delay={300} />);
      // if (showCF) {
      // const cfs = this.cfs;
      // const cf = cfs && notEmpty(cfs[columnIndex]) ? cfs[columnIndex] : undefined;
      let data: string[] | number[] = [];
      let cfData: string[] | number[] = [];
      let column: TableColumn = { ...predCol, ...focusedDF.getColumnByName(this.predName) as ICatColumn };
      let CFColumn: TableColumn = { ...predCol, ...focusedDF.getCFColumnByName(this.predName) as ICatColumn };
      if (columnIndex === 0) {

      }
      else {
        const featName = this.featureNames[columnIndex - 1];
        column = { ...featCols[columnIndex - 1], ...focusedDF.getColumnByName(featName) } as TableColumn;
        CFColumn = { ...featCols[columnIndex - 1], ...focusedDF.getCFColumnByName(featName) } as TableColumn;
      }

      data = column.series.toArray();
      cfData = CFColumn.series.toArray();
      // data = getValidData(column);
      // cfData = getValidCfData(column);
      return (
        <Spin indicator={LoadingIcon} spinning={props.isScrolling} delay={200}>
          <CompactCFColumn
            data={data}
            cfData={showCF ? cfData : undefined}
            startIndex={rowState.startIndex}
            endIndex={rowState.endIndex}
            pixel={pixel}
            xScale={column.xScale}
            width={width}
            height={this.rowHeight({ index: rowIndex })}
            margin={collapsedCellMargin}
            // onHoverRow={idx => idx && this.onExpandRow(idx)}
            onClickRow={idx => idx && this.onClickRow(idx + rowState.startIndex)}
            categoricalColor={columnIndex === 1 ? defaultCategoricalColor : undefined}
          />
        </Spin>
      );
    }
  }

  onClickRow(idx: number) {
    // const { updateQueryInstance } = this.props;
    console.log(idx);
    this.onExpandRow(idx);
  }

  _getRowLabels = memoizeOne((labelColumn: ICatColumn): [number[], number[]] => {
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
    const { focusedDF } = this.state;
    const labelColumn = focusedDF.getColumnByName(this.predName);
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
    const { subsets: cfSubsets } = this.state;
    // cfSubsets[groupId]._focuseOn(newClass);
    this.setState({ subsets: [...cfSubsets] });
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

  // loadCF = async (index: number) => {
  //   const cf = await this.props.getCF(index);
  //   this.loadedCFs[cf.index] = cf;
  // };

  featureIdx2CFIdx = memoizeOne((dataFrame: DataFrame, cfMeta: DataMeta) => {
    return dataFrame.columns.map(c => cfMeta.getColumnDisc(c.name)?.index);
  });

  // getCFs = memoizeOne(buildCFSeries);
  // public get cfs() {
  //   const { cfs, dataset } = this.props;
  //   return cfs ? this.getCFs(cfs, dataset.dataMeta, this.state.dataFrame) : undefined;
  // }

  public async updateSubset(index: number) {
    const {getSubsetCF} = this.props;
    const { subsets } = this.state;
    const filters = subsets[index].filters;
    // const prevColumns = subsets[index].keyColumns;
    const newSubset = await getSubsetCF({filters});
    subsets.splice(index, 1, newSubset);

    this.setState({ subsets });
  }

  // public async getSubsetFromFilters(filters: Filter[], prevColumns?: CFTableColumn[]) {
  //   const { getSubsetCF } = this.props;
  //   const newSubset = await getSubsetCF({ filters });
  //   // const newSubset = new CFSubset({ dataset, filters, cfData: cfResponse.counterfactuals, cfMeta: CFMeta })
  //   console.debug("subset constructed");
  //   const newTable = this.initTableGroup(newSubset.reorderedDataFrame, newSubset.dataMeta, false, newSubset.reorderedSubsetColMat(), newSubset.reorderedFilters(), prevColumns);
  //   console.debug("table constructed");
  //   return newTable;
  // }

  public copySubset(index: number) {
    const { subsets } = this.state;
    subsets.splice(index + 1, 0, subsets[index].copy());
    console.log(subsets);
    this.setState({ subsets });
  }

  public deleteSubset(index: number) {
    const { subsets } = this.state;
    subsets.splice(index, 1);
    this.setState({ subsets });
  }

  private _cacheSubsets() {
    const { subsets } = this.state;
    const { defaultSubset } = this.props;
    const filters = subsets.map(subset => subset.filters);
    const index = defaultSubset.dataMeta.features[0].name;
    localStorage.setItem(`${index}-cfSubsets`, JSON.stringify(filters));
  }

  async _loadSubsetCache() {
    const { defaultSubset, getSubsetCF } = this.props;
    const index = defaultSubset.dataMeta.features[0].name;
    const cacheString = localStorage.getItem(`${index}-cfSubsets`);
    // const cacheString = localStorage.getItem(`cfSubsets`);
    let filterMat: Filter[][] = cacheString ? JSON.parse(cacheString) : [[]];
    // if (filterMat.length > 0) {
    //   let subsets: _CFSubset[] = [];
    //   for (let filters of filterMat) {
    //     console.log(filters);
    //     const newTable = await getSubsetCF({filters});
    //     subsets.push(newTable);
    //   }

    //   console.log(subsets);
    //   this.setState({ subsets })
    // }
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