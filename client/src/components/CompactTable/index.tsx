import * as React from "react";
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
import Table, { CellProps, defaultChartMargin } from "components/Table";
import {
  TableState,
  initTableState,
  RowState,
  CollapsedRows,
  ExpandedRow, 
  isExpandedRow,
} from "./table_state";
import StackedFeature from "../visualization/stackedFeature";
import FeatureCF from "components/visualization/counterfactuals";

export interface ICompactTableProps {
  dataset: Dataset;
  CFMeta: DataMeta;
  cfHeight: number;
  rowHeight: number;
  pixel: number;
  getCFs: (params: IndexRange) => Promise<CFResponse[]>;
}

export interface ICompactTableState {
  xScales?: d3.ScaleLinear<number, number>[];
  columnWidths?: number[];
  tableState: TableState;
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
      tableState: initTableState(props.dataset.dataFrame.length)
    };
    this.isRowLoaded = this.isRowLoaded.bind(this);
    this.loadMoreRows = this.loadMoreRows.bind(this);
    this.renderCell = this.renderCell.bind(this);
    this.rowHeight = this.rowHeight.bind(this);
  }

  public rowHeight({ index }: Index): number {
    return this.computeRowHeights(this.state.tableState.rows)[index];
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

  public componentDidUpdate(prevProps: ICompactTableProps) {}

  public render() {
    const { dataset } = this.props;
    const { tableState } = this.state;
    const fixedColumns =
      Number(Boolean(dataset?.dataMeta.prediction)) +
      Number(Boolean(dataset?.dataMeta.target));

    return (
      <Panel title="Table View" initialWidth={960} initialHeight={600}>
        {dataset && (
          <InfiniteLoader
            isRowLoaded={this.isRowLoaded}
            loadMoreRows={this.loadMoreRows}
            rowCount={dataset.dataFrame.length}
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
                  rowCount={tableState.rows.length}
                  columns={dataset.reorderedDataFrame.columns}
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
        )}
      </Panel>
    );
  }

  renderCell(props: CellProps) {
    const rowState = this.state.tableState.rows[props.rowIndex];
    if (isExpandedRow(rowState)) {
      return this.renderCellExpanded(props, rowState);
    } else {
      return this.renderCellCollapsed(props, rowState);
    }
  }

  renderCellExpanded(props: CellProps, row: ExpandedRow) {
    const { columnIndex, width } = props;
    const { dataset, CFMeta } = this.props;
    const { dataMeta, reorderedDataFrame } = dataset;
    if (columnIndex === -1) {
      // index column
      return (<div className='cell-content'>{row.index}</div>);
    }
    if (columnIndex === dataMeta.target.index) {
      return (<div className='cell-content'>{reorderedDataFrame.at(row.index, columnIndex)}</div>);
    }
    const cfs = this.loadedCFs[row.index];
    if (!cfs) return undefined;
    // render CFs
    const cfIndex = this.featureIdx2CFIdx(reorderedDataFrame, CFMeta)[
      columnIndex
    ]!;
    return (
      <FeatureCF
        baseValue={reorderedDataFrame.at(row.index, columnIndex) as number}
        cfValues={
          cfs.counterfactuals[cfIndex] as number[]
        }
        xScale={this.tableRef?.xScale(columnIndex) as d3.ScaleLinear<number, number>}
        width={width}
        height={this.rowHeight({index: row.index})}
        margin={defaultChartMargin}
        // style={{marginTop: 2, position: 'relative'}}
      />
    );
  }

  renderCellCollapsed(props: CellProps, rowState: CollapsedRows) {
    const { columnIndex, rowIndex, width } = props;
    const { dataset, pixel } = this.props;
    const { reorderedDataFrame } = dataset;
    if (columnIndex === -1) {
      // index column
      return (<div className="cell-content"></div>);
    } else {
      return (
        <StackedFeature
          data={reorderedDataFrame.columns[columnIndex].series.toArray()}
          startIndex={rowState.startIndex}
          endIndex={rowState.endIndex}
          pixel={pixel}
          xScale={this.tableRef!.xScale(columnIndex)}
          width={width}
          height={this.rowHeight({ index: rowIndex })}
          margin={defaultChartMargin}
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
