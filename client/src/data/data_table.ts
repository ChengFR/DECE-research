// TODO: Maybe consider existing wheels like:
// data-forge (with similar api as pandas, written in ts): https://github.com/data-forge/data-forge-ts

import { Column } from './column';

export type Row = Array<string | number>;

export default class DataTable {
  private columns: Column[] = [];

  private data: Row[] = [];

  constructor ({data, columns}: {data: Row[], columns: Column[]}) {
    this.data = data;
    this.columns = columns;
  }
  
}