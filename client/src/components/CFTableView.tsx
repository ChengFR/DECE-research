import * as React from "react";
import Dataset from "../data/dataset";
import Panel from "./Panel";
import Table from "./Table";
import {
  InfiniteLoader,
  SectionRenderedParams,
  Index,
  IndexRange
} from "react-virtualized";
import { CFResponse } from '../api';

export interface ICFTableViewProps {
  dataset: Dataset;
  getCFs: (params: IndexRange) => Promise<CFResponse[]>;
}

export interface ICFTableViewState {
  // loadedCFs: (CFResponse | undefined)[];
}

export default class CFTableView extends React.Component<
  ICFTableViewProps,
  ICFTableViewState
> {
  private loadedCFs: (CFResponse | undefined)[] = [];
  constructor(props: ICFTableViewProps) {
    super(props);

    this.state = {
      // loadedCFs: []
    };
    this.isRowLoaded = this.isRowLoaded.bind(this);
    this.loadMoreRows = this.loadMoreRows.bind(this);
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
                console.debug("onSectionRendered",rowStartIndex, rowStopIndex);
                return onRowsRendered({
                  startIndex: rowStartIndex,
                  stopIndex: rowStopIndex
                });
              };
              return (
                <Table
                  dataFrame={dataset.reorderedDataFrame()}
                  fixedColumns={fixedColumns}
                  showIndex={true}
                  onSectionRendered={onSectionRendered}
                  ref={registerChild}
                />
              );
            }}
          </InfiniteLoader>
        )}
      </Panel>
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
    console.log(this.loadedCFs);
    return cfs;
  }
}
