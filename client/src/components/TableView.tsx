import * as React from 'react';
import Dataset from '../data/dataset';
import Panel from './Panel';
import Table from './Table';

export interface ITableViewProps {
  dataset: Dataset
}

export interface ITableViewState {
}

export default class TableView extends React.Component<ITableViewProps, ITableViewState> {
  constructor(props: ITableViewProps) {
    super(props);

    this.state = {
    }
  }

  public render() {
    const { dataset } = this.props;
    const fixedColumns = Number(Boolean(dataset?.dataMeta.prediction)) + Number(Boolean(dataset?.dataMeta.target));

    return (
      <Panel title="Table View" initialWidth={960} initialHeight={600}>
        {dataset && <Table dataFrame={dataset.reorderedDataFrame} fixedColumns={fixedColumns} showIndex={true}/>}
      </Panel>
    );
  }
}
