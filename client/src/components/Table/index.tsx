import * as React from "react";
import { IDataFrame } from "data-forge";

import { getTextWidth } from '../../common/utils';
import Header from "./Header";
import TableContent from './TableContent';
import './index.css';

export interface ITableProps {
  dataFrame: IDataFrame;
}

interface ITableState {
  columnWidths: number[];
}

function initColumnWidths(columns: string[], padding: number=10) {
  return columns.map(c => Math.ceil(getTextWidth(c) + 2 * padding));
}

export default class Table extends React.Component<ITableProps, ITableState> {

  constructor(props: ITableProps) {
    super(props);
    this.state = { columnWidths: initColumnWidths(props.dataFrame.getColumnNames())};
  }

  public render() {
    const { dataFrame } = this.props;
    const {columnWidths} = this.state;
    const columns = dataFrame
      .getColumns()
      .toArray()
      .map(({ name, type }) => {
        return { name, type };
      });
    return (
      <div className="table-container">
        <Header columns={columns} columnWidths={columnWidths} />
        <TableContent dataFrame={dataFrame} columnWidths={columnWidths}/>
      </div>
    );
  }
}
