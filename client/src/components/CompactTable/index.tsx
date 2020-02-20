import * as React from "react";
import _ from "lodash";
import memoizeOne from "memoize-one";
import {
  InfiniteLoader,
  SectionRenderedParams,
  Index,
  IndexRange
} from "react-virtualized";
import { CFResponse } from "api";
import { Dataset, DataMeta, DataFrame } from "data";
import Panel from "components/Panel";
import Table, { CellProps, columnMargin } from "components/Table";
import {
  RowState,
  CollapsedRows,
  ExpandedRow,
  isExpandedRow,
  initRowStates
} from "./table_state";
import StackedFeature from "../visualization/stackedFeature";
import FeatureCF from "components/visualization/counterfactuals";
import { TableColumn, changeColumnWidth, createColumn } from "../Table/common";
import { IColumn } from "../../data/column";
import { reduceRows, filterRows } from './table_state';

export interface ICompactTableProps {
  dataset: Dataset;
  CFMeta: DataMeta;
  cfHeight: number;
  rowHeight: number;
  pixel: number;
  getCFs: (params: IndexRange) => Promise<CFResponse[]>;
}

export interface ICompactTableState {
  columns: TableColumn[];
  dataFrame: DataFrame;
  prevDataFrame?: DataFrame;
  rows: RowState[];
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
      )
    };
    this.isRowLoaded = this.isRowLoaded.bind(this);
    this.loadMoreRows = this.loadMoreRows.bind(this);
    this.renderCell = this.renderCell.bind(this);
    this.rowHeight = this.rowHeight.bind(this);
    this.onSort = this.onSort.bind(this);
  }

  public initColumn(column: IColumn<string> | IColumn<number>): TableColumn {
    const c = createColumn(column);
    c.onSort = (order: "ascend" | "descend") => this.onSort(c.name, order);
    c.onChangeColumnWidth = (width: number) => this.onChangeColumnWidth(c.name, width);
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
        const cfs = this.loadedCFs[row.index];
        if (!cfs) return rowHeight;
        return Math.max(
          rowHeight,
          cfs.counterfactuals[0].length * cfHeight + 2
        );
      } else {
        return pixel * (row.endIndex - row.startIndex);
      }
    });
  });

  changeDataFrame(dataFrame: DataFrame) {
    if (dataFrame !== this.state.dataFrame) {
      const name2column = _.keyBy(this.state.columns);
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
      const newState = this.changeDataFrame(this.props.dataset.reorderedDataFrame)
      this.setState(newState);
    }
  }

  public render() {
    const { dataset } = this.props;
    const { rows, columns, dataFrame } = this.state;
    const fixedColumns =
      Number(Boolean(dataset?.dataMeta.prediction)) +
      Number(Boolean(dataset?.dataMeta.target));

    const rowCount = dataFrame.length;

    return (
      <Panel title="Table View" initialWidth={960} initialHeight={600}>
        <InfiniteLoader
          isRowLoaded={this.isRowLoaded}
          loadMoreRows={this.loadMoreRows}
          rowCount={rowCount}
        >
          {({ onRowsRendered, registerChild }) => {
            const onSectionRendered = ({
              rowStartIndex,
              rowStopIndex
            }: SectionRenderedParams) => {
              console.debug("onSectionRendered", rowStartIndex, rowStopIndex);
              return onRowsRendered({
                startIndex: rowStartIndex,
                stopIndex: rowStopIndex
              });
            };
            return (
              <Table
                rowCount={rows.length}
                columns={columns}
                fixedColumns={fixedColumns}
                showIndex={true}
                rowHeight={this.rowHeight}
                onSectionRendered={onSectionRendered}
                ref={(child: Table | null) => {
                  this.tableRef = child;
                  return registerChild(child);
                }}
                cellRenderer={this.renderCell}
              />
            );
          }}
        </InfiniteLoader>
      </Panel>
    );
  }

  onChangeColumnWidth(columnName: string, width: number) {
    const { columns } = this.state;
    const index = columns.findIndex(c => c.name === columnName);
    columns.splice(index, 1, changeColumnWidth(columns[index], width));
    // console.log(`change column ${index} width to ${width}`);

    this.setState({ columns: [...columns] });
  }

  onSort(columnName: string, order: "ascend" | "descend") {
    const newState = this.changeDataFrame(this.state.dataFrame.sortBy(columnName, order));
    if (newState) {
      newState.columns.forEach(c => (c.sorted = c.name === columnName ? order : null));
      this.setState(newState);
    }
  }

  onChangeFilter(columnName: string, filter?: string[] | [number, number]) {
    const { columns, rows } = this.state;
    const baseDataFrame = this.state.prevDataFrame || this.state.dataFrame;
    const index = columns.findIndex(c => c.name === columnName);
    const column = columns[index];
    columns.splice(index, 1, {...column, filter} as TableColumn);
    const filters: {columnName: string, filter: string[] | [number, number]}[] = [];
    columns.forEach(c => {
      c.filter && filters.push({columnName: c.name, filter: c.filter});
    })
    console.debug("onChangeFilter", filters);

    const newState = this.changeDataFrame(baseDataFrame.filterBy(filters));
    if (newState) {
      newState.columns.forEach((c, i) => c.prevSeries = baseDataFrame.columns[i].series);
      const newIndex = newState.dataFrame.index;
      const newRows = filterRows(rows, newIndex);
      console.log(newState);
      this.setState({...newState, prevDataFrame: baseDataFrame, rows: newRows});
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
    const { columnIndex, width } = props;
    const { dataset, CFMeta } = this.props;
    const { dataFrame } = this.state;
    if (columnIndex === -1) {
      // index column
      return <div className="cell-content">{row.index}</div>;
    }
    if (columnIndex === dataset.dataMeta.target.index) {
      return (
        <div className="cell-content">
          {dataFrame.at(row.index, columnIndex)}
        </div>
      );
    }
    const cfs = this.loadedCFs[row.index];
    if (!cfs) return undefined;
    // render CFs
    const cfIndex = this.featureIdx2CFIdx(dataFrame, CFMeta)[columnIndex]!;
    return (
      <FeatureCF
        baseValue={dataFrame.at(row.index, columnIndex) as number}
        cfValues={cfs.counterfactuals[cfIndex] as number[]}
        xScale={
          this.tableRef?.xScale(columnIndex) as d3.ScaleLinear<number, number>
        }
        width={width}
        height={this.rowHeight({ index: row.index })}
        margin={columnMargin}
        // style={{marginTop: 2, position: 'relative'}}
      />
    );
  }

  renderCellCollapsed(props: CellProps, rowState: CollapsedRows) {
    const { columnIndex, rowIndex, width } = props;
    const { pixel } = this.props;
    const { dataFrame } = this.state;
    if (columnIndex === -1) {
      // index column
      return <div className="cell-content"></div>;
    } else {
      return (
        <StackedFeature
          data={dataFrame.columns[columnIndex].series.toArray()}
          startIndex={rowState.startIndex}
          endIndex={rowState.endIndex}
          pixel={pixel}
          xScale={this.tableRef!.xScale(columnIndex)}
          width={width}
          height={this.rowHeight({ index: rowIndex })}
          margin={columnMargin}
          // style={{marginTop: 2, position: 'relative'}}
        />
      );
    }
  }

  isRowLoaded({ index }: Index): boolean {
    return !!this.loadedCFs[index];
  }

  async loadMoreRows(params: IndexRange) {
    const cfs = await this.props.getCFs(params);
    cfs.forEach(cf => {
      this.loadedCFs[cf.index] = cf;
    });
    return cfs;
  }

  featureIdx2CFIdx = memoizeOne((dataFrame: DataFrame, cfMeta: DataMeta) => {
    return dataFrame.columns.map(c => cfMeta.getColumnDisc(c.name)?.index);
  });
}


interface IControlsProps {
  onClearFilters?: () => any;
  onClearSort?: () => any;
}

const Controls: React.FunctionComponent<IControlsProps> = (props) => {
  return (<div></div>);
};
