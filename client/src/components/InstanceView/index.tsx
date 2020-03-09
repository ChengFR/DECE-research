import * as React from 'react';
import { ColumnSpec } from '../../data/column';

export interface IInstanceViewProps {
  columns: ColumnSpec[];
}

export interface IInstanceViewState {
}

export default class InstanceView extends React.Component<IInstanceViewProps, IInstanceViewState> {
  constructor(props: IInstanceViewProps) {
    super(props);

    this.state = {
    }
  }

  public render() {
    return (
      <div>
        
      </div>
    );
  }
}
