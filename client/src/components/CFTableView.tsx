import * as React from "react";
import {
  InfiniteLoader,
  SectionRenderedParams,
  Index,
  IndexRange
} from "react-virtualized";
import memoizeOne from "memoize-one";
import { Dataset, DataMeta, DataFrame } from "../data";
import Panel from "./Panel";
import Table, {CellProps, columnMargin} from "./Table";
import { CFResponse } from "../api";
import FeatureCF from "./visualization/counterfactuals";

export interface ICFTableViewProps {
  dataset: Dataset;
  CFMeta: DataMeta;
  rowHeight: number;
  cfHeight: number;
  getCFs: (params: IndexRange) => Promise<CFResponse[]>;
}

export interface ICFTableViewState {
  xScales?: d3.ScaleLinear<number, number>[];
  columnWidths?: number[];
  // loadedCFs: (CFResponse | undefined)[];
}

export default class CFTableView extends React.Component<
  ICFTableViewProps,
  ICFTableViewState
> {
  static defaultProps = {
    rowHeight: 20,
    cfHeight: 7
  };

  private loadedCFs: (CFResponse | undefined)[] = [];
  private tableRef: Table | null = null;
  constructor(props: ICFTableViewProps) {
    super(props);

    this.state = {
      // loadedCFs: []
    };
    this.isRowLoaded = this.isRowLoaded.bind(this);
    this.loadMoreRows = this.loadMoreRows.bind(this);
    this.renderCell = this.renderCell.bind(this);
    this.rowHeight = this.rowHeight.bind(this);
  }

  public rowHeight({ index }: Index): number {
    const { rowHeight, cfHeight } = this.props;
    const cfs = this.loadedCFs[index];
    if (!cfs) return rowHeight;
    return Math.max(rowHeight, cfs.counterfactuals[0].length * cfHeight + 4);
  }

  public render() {
    const { dataset } = this.props;
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
                  columns={dataset.reorderedDataFrame.columns}
                  rowCount={dataset.reorderedDataFrame.length}
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
    const { columnIndex, rowIndex, width, height } = props;
    const { CFMeta, dataset } = this.props;
    const { dataMeta, reorderedDataFrame } = dataset;
    if (columnIndex === -1) return undefined;
    if (columnIndex === dataMeta.target.index) return undefined;
    const cfs = this.loadedCFs[rowIndex];
    if (!cfs) return undefined;
    // render CFs
    const cfIndex = this.featureIdx2CFIdx(reorderedDataFrame, CFMeta)[columnIndex]!;
    return (
      <FeatureCF
        baseValue={reorderedDataFrame.at(rowIndex, columnIndex) as number}
        cfValues={
          cfs.counterfactuals[cfIndex] as number[]
        }
        xScale={this.tableRef?.xScale(columnIndex) as d3.ScaleLinear<number, number>}
        width={width}
        height={this.rowHeight({index: rowIndex})}
        margin={columnMargin}
        // style={{marginTop: 2, position: 'relative'}}
      />
    );
  }

  isRowLoaded({ index }: Index): boolean {
    return !!this.loadedCFs[index];
  }

  async loadMoreRows(params: IndexRange) {
    console.debug("loadMoreRows", params);
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

function renderCF() {}
