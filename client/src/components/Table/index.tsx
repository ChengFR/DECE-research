import * as React from 'react';
import {IDataFrame} from 'data-forge';

export interface ITableProps {
  dataFrame: IDataFrame;
};

interface ITableState {

};

export default class Table extends React.Component<ITableProps, ITableState> {
  constructor(props: ITableProps) {
    super(props);
    this.state = {

    };
  }
  public render() {
    return (
      <div>
        
      </div>
    );
  }
};
