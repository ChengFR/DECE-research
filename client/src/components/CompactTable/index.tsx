import * as React from "react";
import { Switch, Icon, Spin } from "antd";
import _ from "lodash";
import memoizeOne from "memoize-one";
import {Index, IndexRange} from "react-virtualized";
import { CFResponse, SubsetCFResponse, Filter, getSubsetCF, CounterFactual } from "api";
import { Dataset, DataMeta, DataFrame, IColumn, CFSubset, CFDataFrame } from "data";
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
import {
  TableColumn,
  changeColumnWidth,
  ITableProps
} from "../Table";
import { number2string } from "common/utils";
import CompactCFColumn from "components/visualization/CompactCFColumn";
import { isColumnNumerical, Series, ICatColumn, ISeries } from '../../data/column';
import { assert } from '../../common/utils';
import { CatTableColumn, isNumericalVColumn, VColumn, VCatColumn, NumTableColumn, infuseCol, createVColumn } from '../Table/common';
import "./index.scss";
import { NumHeaderFeatCol, NumSubsetFeatCol } from "./NumFeatCol"
import { CatHeaderFeatCol, CatSubsetFeatCol } from "./CatFeatCol"
import LabelColumn from "./LabelColumn";
import { defaultCategoricalColor } from "components/visualization/common";

const collapsedCellMargin = {
  ...columnMargin,
  top: 0,
  bottom: 0
};

const LoadingIcon = <Icon type="loading" spin />;

const histHeight = 20;
const headerChartHeight = NumHeaderFeatCol.getHeight(histHeight);
const subsetChartHeight = NumSubsetFeatCol.getHeight(histHeight);
const headerRowHeights = [30, headerChartHeight];

const headerRowHeight = (params: { index: number }) => {
  return headerRowHeights[params.index];
}

export interface ICompactTableProps {
  cfHeight: number;
  rowHeight: number;
  pixel: number;

  defaultSubset: CFSubset;
  getSubsetCF: (param: { filters: Filter[] }) => Promise<CFSubset>;
  // updateQueryInstance?: (queryInstance: CounterFactual) => void;
}

export interface ICompactTableState {
  subsets: CFSubset[];
  focusedDF: CFDataFrame;
  focusedDFProto: CFDataFrame;
  featCols: VColumn[];
  predCol: VCatColumn;

  rows: RowState[];
  showCF: boolean;
  hovered: [number, number] | null;

  drawYAxis: boolean;
  groupIndex?: number;
  columnIndex?: number;
  focusedClass?: number;
  cache: boolean;
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

  private featNames: string[];
  private predName: string;
  private targetName: string;
  constructor(props: ICompactTableProps) {
    super(props);
    this.renderCell = this.renderCell.bind(this);
    this.renderHeaderCell = this.renderHeaderCell.bind(this);
    this.rowHeight = this.rowHeight.bind(this);
    this.onSort = this.onSort.bind(this);
    this.onChangeFilter = this.onChangeFilter.bind(this);
    this.onChangeCFFilter = this.onChangeCFFilter.bind(this);
    this.onChangeColumnWidth = this.onChangeColumnWidth.bind(this);
    this.onClearFilter = this.onClearFilter.bind(this);
    this.onHover = this.onHover.bind(this);
    this.onExpandRow = this.onExpandRow.bind(this);
    this.onClickRow = this.onClickRow.bind(this);
    this.onCollapseRow = this.onCollapseRow.bind(this);
    this.onSelectColumn = this.onSelectColumn.bind(this);
    this.onUpdateFilter = this.onUpdateFilter.bind(this);
    this.onSwitchCF = this.onSwitchCF.bind(this);
    this.onSwichAxis = this.onSwichAxis.bind(this);
    this.onSubsetFocusOnClass = this.onSubsetFocusOnClass.bind(this);
    this.onFocusOnClass = this.onFocusOnClass.bind(this);

    this.updateSubset = this.updateSubset.bind(this);
    this.copySubset = this.copySubset.bind(this);
    this.deleteSubset = this.deleteSubset.bind(this);

    this._loadSubsetCache = this._loadSubsetCache.bind(this);
    this._cacheSubsets = this._cacheSubsets.bind(this);

    this.featNames = this.props.defaultSubset.dataMeta.features.map(d => d.name);
    this.predName = this.props.defaultSubset.dataMeta.prediction!.name;
    this.targetName = this.props.defaultSubset.dataMeta.target!.name;

    const focusedDF = this.initFocusedDF(this.props.defaultSubset.CFDataFrames[0]);
    const featDisc = this.props.defaultSubset.dataMeta.features;
    const predDisc = this.props.defaultSubset.dataMeta.prediction!;
    const featCols = featDisc.map(disc => createVColumn(disc));
    featCols.forEach((col, i) => col.onChangeColumnWidth = this.onChangeColumnWidth.bind(this, this.featNames[i]));
    const predCol = createVColumn(predDisc) as CatTableColumn;
    predCol.onChangeColumnWidth = this.onChangeColumnWidth.bind(this, this.predName);

    this.state = {
      subsets: [this.props.defaultSubset],
      focusedDFProto: focusedDF,
      focusedDF: focusedDF.copy(),
      featCols,
      predCol,
      hovered: null,
      showCF: true,
      drawYAxis: false,
      rows: initRowStates(focusedDF.length),
      cache: false,
    }
  }

  componentDidMount() {
    if (this.state.cache)
      this._loadSubsetCache();
  }

  componentWillUpdate() {
    console.log("Table view will update.");
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
    cols.push(infuseCol(predCol, focusedDF.getColumnByName(this.predName)));
    CFCols.push(infuseCol(predCol, focusedDF.getCFColumnByName(this.predName)));
    this.featNames.forEach((name, i) => {
      cols.push(infuseCol(featCols[i], focusedDF.getColumnByName(name)));
      CFCols.push(infuseCol(featCols[i], focusedDF.getCFColumnByName(name)));
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

  public componentDidUpdate() {
    if (this.state.cache)
      this._cacheSubsets();
  }

  public render() {
    const { focusedDF, hovered } = this.state;
    const { rows, subsets: allColumns } = this.state;
    const hoveredValue = hovered ? focusedDF.at(...hovered) : "";
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
        {classes.map((d, i) => <div className="legend-container" key={i}>
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


  onChangeColumnWidth(columnName: string, width: number) {
    const { predCol, featCols } = this.state;
    const colNames = [this.predName, ...this.featNames];
    const index = colNames.findIndex(c => c === columnName);
    if (index === -1) {
      throw "Cannot find the correponding column in updating column width.";
    }
    else if (index === 0) {
      this.setState({ predCol: changeColumnWidth(predCol, width) as VCatColumn });
    }
    else {
      featCols.splice(index - 1, 1, changeColumnWidth(featCols[index - 1], width));
      this.setState({ featCols });
    }
  }

  onSort(columnName?: string, order: "ascend" | "descend" = "ascend") {
    let index = []
    if (columnName === undefined)
      index = this.props.defaultSubset.CFDataFrames[0].validIndex;
    else
      index = this.state.focusedDF.sortBy(columnName, order, true);
    const rows = reorderRows(this.state.rows, index);
    this.setState({ rows });
  }

  onClearFilter() {
    this.setState({ focusedDF: this.state.focusedDFProto.copy() });
  }

  onChangeFilter(columnName: string, filter?: string[] | [number, number]) {
    const { focusedDF, rows } = this.state;
    console.debug("onChangeFilter", columnName, filter);
    focusedDF.onChangeFilter(columnName, filter);
    const newIndex = focusedDF.validIndex;
    const newRows = filterRows(rows, newIndex);
    this.setState({ focusedDF, rows: newRows });
  }

  onChangeCFFilter(columnName: string, filter?: string[] | [number, number]) {
    const { focusedDF, rows } = this.state;
    console.debug("onChangeCFFilter", columnName, filter);
    focusedDF.onChangeCFFilter(columnName, filter);
    const newIndex = focusedDF.validIndex;
    const newRows = filterRows(rows, newIndex);
    this.setState({ focusedDF, rows: newRows });
  }

  onHover(row: number | null, column: number | null) {
    const { hovered } = this.state;
    if (hovered && row === hovered[0] && column === hovered[1]) return;
    if (row === null || column === null) this.setState({ hovered: null });
    else this.setState({ hovered: [row, column] });
  }

  onExpandRow(row: number) {
    const { rows, focusedDF } = this.state;
    const newRows = expandRows(rows, row, row + 1, [focusedDF.index[row]]);
    console.debug("Expand row", row, focusedDF.index[row], newRows);
    this.setState({ rows: newRows })
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

  initFocusedDF(focusedDF: CFDataFrame) {
    const columns = focusedDF.columns.map((col, i) => {
      return {
        ...col,
        onSort: this.onSort.bind(this, this.featNames[i]),
        onFilter: this.onChangeFilter.bind(this, this.featNames[i])
      }
    })
    const CFColumns = focusedDF.CFColumns.map((col, i) => {
      return {
        ...col,
        onFilter: this.onChangeCFFilter.bind(this, this.featNames[i])
      }
    })
    return CFDataFrame.fromCFColumns(columns, CFColumns);
  }

  onSelectColumn(groupIndex: number, columnIndex: number) {
    const { subsets } = this.state;
    const focusedDFProto = this.initFocusedDF(subsets[groupIndex].CFDataFrames[columnIndex - 1].copy());
    const focusedDF = focusedDFProto.copy();
    this.setState({ focusedDFProto, focusedDF, groupIndex, columnIndex });
  }

  onUpdateFilter(groupIndex: number, columnIndex: number, newFilter: Filter) {
    const { subsets } = this.state;
    const newSubset = subsets[groupIndex].updateFilter(columnIndex - 1, newFilter);
    subsets.splice(groupIndex, 1, newSubset);
    this.setState({ subsets });
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
    // const { columnIndex } = cellProps;
    const { columnIndex, rowIndex } = props;
    const { featCols, predCol, focusedClass, focusedDF, focusedDFProto } = this.state;
    
    if (rowIndex === 0) return undefined;
    console.debug("render chart cell");
    if (columnIndex === 0) {
      return <LabelColumn
        className={`subset-chart`}
        predColumn={infuseCol(predCol, focusedDF.getColumnByName(this.predName)) as CatTableColumn}
        targetColumn={infuseCol(predCol, focusedDF.getColumnByName(this.targetName)) as CatTableColumn}
        width={predCol.width}
        height={subsetChartHeight}
        margin={this.state.drawYAxis ? { ...columnMargin, left: 30 } : columnMargin}
        histogramType='stacked'
        focusedCategory={focusedClass}
        onFocusCategory={this.onFocusOnClass}
      />
    }
    else {
      const featIndex = columnIndex - 1;
      const featName = this.featNames[featIndex];
      const column = infuseCol(featCols[featIndex], focusedDF.getColumnByName(featName));
      const CFColumn = infuseCol(featCols[featIndex], focusedDF.getCFColumnByName(featName));
      const allColumn = infuseCol(featCols[featIndex], focusedDFProto.getColumnByName(featName));
      const allCFColumn = infuseCol(featCols[featIndex], focusedDFProto.getCFColumnByName(featName));
      const labelColumn = infuseCol(predCol, focusedDF.getColumnByName(this.predName)) as CatTableColumn;
      const allLabelColumn = infuseCol(predCol, focusedDFProto.getColumnByName(this.predName)) as CatTableColumn;

      const protoCol = this.props.defaultSubset.getFeatures(featIndex)[featIndex];

      if (isNumericalVColumn(column) && isNumericalVColumn(CFColumn)) {
        return <NumHeaderFeatCol
          className={`header-chart`}
          width={column.width}
          histHeight={20}
          margin={this.state.drawYAxis ? { ...columnMargin, left: 30 } : columnMargin}
          drawAxis={this.state.drawYAxis}
          histogramType='side-by-side'
          k={`header-${columnIndex}`}

          column={column}
          CFColumn={CFColumn}
          allColumn={allColumn as NumTableColumn}
          allCFColumn={allCFColumn as NumTableColumn}
          validFilter={this.getValidFilter(focusedDF)}
          // protoColumn={column}
          labelColumn={labelColumn}
          allLabelColumn={allLabelColumn}
          protoColumn={infuseCol(featCols[featIndex], protoCol) as NumTableColumn}

          onUpdateFilter={(extent?: [number, number]) => {
            column.onFilter && column.onFilter(extent);
          }}
          onUpdateCFFilter={(extent?: [number, number]) => {
            CFColumn.onFilter && CFColumn.onFilter(extent);
          }}

          focusedCategory={focusedClass}
          color={focusedClass === 1 ? i => defaultCategoricalColor(i ^ 1) : defaultCategoricalColor}
        />
      }
      else if (!isNumericalVColumn(column) && !isNumericalVColumn(CFColumn)) {
        return (
          <CatHeaderFeatCol

            className={`header-chart`}
            width={column.width}
            histHeight={20}
            margin={this.state.drawYAxis ? { ...columnMargin, left: 30 } : columnMargin}
            drawAxis={this.state.drawYAxis}
            histogramType='side-by-side'
            k={`header-${columnIndex}`}

            column={column}
            CFColumn={CFColumn}
            allColumn={allColumn as CatTableColumn}
            allCFColumn={allCFColumn as CatTableColumn}
            validFilter={this.getValidFilter(focusedDF)}
            labelColumn={labelColumn}
            allLabelColumn={allLabelColumn}
            protoColumn={infuseCol(featCols[featIndex], protoCol) as CatTableColumn}

            onUpdateFilter={(categories?: string[]) => {
              column.onFilter && column.onFilter(categories)
            }}
            onUpdateCFFilter={(categories?: string[]) => {
              CFColumn.onFilter && CFColumn.onFilter(categories);
            }}

            focusedCategory={focusedClass}
            color={focusedClass === 1 ? i => defaultCategoricalColor(i ^ 1) : defaultCategoricalColor}
          />
        );
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
        const predColumn = infuseCol(predCol, subset.prediction);
        const targetColumn = infuseCol(predCol, subset.target);
        return <LabelColumn
          className={`subset-chart`}
          predColumn={predColumn as CatTableColumn}
          targetColumn={targetColumn as CatTableColumn}
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
      const featIndex = columnIndex - 1;
      const df = subset.CFDataFrames[featIndex];
      const featName = this.featNames[featIndex];
      const column = infuseCol(featCols[featIndex], df.getColumnByName(featName));
      const CFColumn = infuseCol(featCols[featIndex], df.getCFColumnByName(featName));
      const labelColumn = infuseCol(predCol, df.getColumnByName(this.predName)) as CatTableColumn;
      assert(column.series.length === CFColumn.series.length);
      const protoCol = this.props.defaultSubset.getFeatures(featIndex)[featIndex];

      if (isNumericalVColumn(column) && isNumericalVColumn(CFColumn)) {
        return <NumSubsetFeatCol
          className={`subset-chart`}
          width={column.width}
          histHeight={20}
          margin={this.state.drawYAxis ? { ...columnMargin, left: 30 } : columnMargin}
          k={`subset-${groupIndex}-${columnIndex}`}
          histogramType='side-by-side'
          drawAxis={this.state.drawYAxis}

          column={column}
          CFColumn={CFColumn}
          validFilter={this.getValidFilter(df)}
          protoColumn={infuseCol(featCols[featIndex], protoCol) as NumTableColumn}
          labelColumn={labelColumn}
          selectedRange={subset.filters[featIndex].extent || column.extent}
          onUpdateSelectedRange={(extent?: [number, number]) => this.onUpdateFilter(groupIndex, columnIndex, { name: column.name, extent })}

          onSelect={() => this.onSelectColumn(groupIndex, columnIndex)}
          selected={groupIndex === this.state.groupIndex && columnIndex === this.state.columnIndex}
          focusedCategory={subset.focusedClass}
          color={subset.focusedClass === 1 ? i => defaultCategoricalColor(i ^ 1) : defaultCategoricalColor}
        />
      }
      else if (!isNumericalVColumn(column) && !isNumericalVColumn(CFColumn)) {
        return <CatSubsetFeatCol
          className={`subset-chart`}
          width={column.width}
          histHeight={20}
          margin={this.state.drawYAxis ? { ...columnMargin, left: 30 } : columnMargin}
          k={`subset-${groupIndex}-${columnIndex}`}
          histogramType='side-by-side'
          drawAxis={this.state.drawYAxis}

          column={column}
          CFColumn={CFColumn}
          validFilter={this.getValidFilter(df)}
          labelColumn={labelColumn}
          protoColumn={infuseCol(featCols[featIndex], protoCol) as CatTableColumn}
          selectedCategories={subset.filters[featIndex].categories || column.categories}
          onUpdateSelectedCategories={(categories?: string[]) => this.onUpdateFilter(groupIndex, columnIndex, { name: column.name, categories })}

          onSelect={() => this.onSelectColumn(groupIndex, columnIndex)}
          selected={groupIndex === this.state.groupIndex && columnIndex === this.state.columnIndex}
          focusedCategory={subset.focusedClass}
          color={subset.focusedClass === 1 ? i => defaultCategoricalColor(i ^ 1) : defaultCategoricalColor}
        />
      }
      else {
        throw "Type of column and CF column should be consistent."
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

      const featName = this.featNames[columnIndex - 1];
      const column = { ...featCols[columnIndex - 1], ...focusedDF.getColumnByName(featName) } as TableColumn;
      const CFColumn = { ...featCols[columnIndex - 1], ...focusedDF.getCFColumnByName(featName) } as TableColumn;
      const data = column.series.toArray();
      const cfData = CFColumn.series.toArray();

      const originVal = data[row.index];
      const cfVal = cfData[row.index];
      const originStr = typeof (originVal) === 'string' ? originVal : originVal.toFixed(column.precision);
      if (originVal === cfVal) {
        return <div className="cell-content" onClick={this.onCollapseRow.bind(this, rowIndex)}>
          <span>{`${originStr}`}</span>
        </div>
      }
      else {
        let color = "#ccc";
        if (typeof (originVal) === 'number' && typeof (cfVal) === 'number') {
          color = originVal > cfVal ? "#c06f5b" : "#9dbd78";
        }
        return <div className="cell-content" onClick={this.onCollapseRow.bind(this, rowIndex)}>
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
      let data: string[] | number[] = [];
      let cfData: string[] | number[] = [];
      let column = infuseCol(predCol, focusedDF.getColumnByName(this.predName) as ICatColumn);
      let CFColumn = infuseCol(predCol, focusedDF.getCFColumnByName(this.predName) as ICatColumn);
      if (columnIndex === 0) {

      }
      else {
        const featName = this.featNames[columnIndex - 1];
        column = infuseCol(featCols[columnIndex - 1], focusedDF.getColumnByName(featName));
        CFColumn = infuseCol(featCols[columnIndex - 1], focusedDF.getCFColumnByName(featName));
      }

      data = column.series.toArray();
      cfData = CFColumn.series.toArray();
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

  onSwitchCF(showCF: boolean) {
    this.setState({ showCF });
    this.tableRef?.recomputeGridSize();
  }

  onSwichAxis(drawYAxis: boolean) {
    this.setState({ drawYAxis });
    this.tableRef?.recomputeGridSize();
  }

  onSubsetFocusOnClass(groupId: number, newClass?: number) {
    const { subsets: cfSubsets } = this.state;
    cfSubsets[groupId].updateFocusedClass(newClass);
    this.setState({ subsets: [...cfSubsets] });
  }

  onFocusOnClass(newClass?: number) {
    this.setState({ focusedClass: newClass });
  }

  featureIdx2CFIdx = memoizeOne((dataFrame: DataFrame, cfMeta: DataMeta) => {
    return dataFrame.columns.map(c => cfMeta.getColumnDisc(c.name)?.index);
  });

  public async updateSubset(index: number) {
    const { getSubsetCF } = this.props;
    const { subsets } = this.state;
    const filters = subsets[index].filters;
    // const prevColumns = subsets[index].keyColumns;
    const newSubset = await getSubsetCF({ filters });
    subsets.splice(index, 1, newSubset);

    this.setState({ subsets });
  }

  public copySubset(index: number) {
    const { subsets } = this.state;
    subsets.splice(index + 1, 0, subsets[index].copy());
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
    let filterMat: Filter[][] = cacheString ? JSON.parse(cacheString) : [[]];
    if (filterMat.length > 0) {
      let subsets: CFSubset[] = [];
      for (let filters of filterMat) {
        const _filters = filters.filter(f => this.featNames.includes(f.name));
        const subset = await getSubsetCF({ filters: _filters });
        subsets.push(subset);
      }
      this.setState({ subsets })
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