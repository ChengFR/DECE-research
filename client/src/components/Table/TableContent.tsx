import * as React from 'react';
import * as d3 from 'd3';
import _ from 'lodash';

import { IDataFrame } from 'data-forge';
import { cumsum } from '../../common/math';

export interface ITableContentProps {
  dataFrame: IDataFrame;
  columnWidths: number[];
  rowHeight: number;
}

export interface ITableContentState {
}

export default class TableContent extends React.Component<ITableContentProps, ITableContentState> {
  static defaultProps = {
    rowHeight: 20
  };
  private divRef: React.RefObject<HTMLDivElement> = React.createRef();

  constructor(props: ITableContentProps) {
    super(props);

    this.state = {
    };
    this.paint = this.paint.bind(this);
  }

  public componentDidMount() {
    this.paint();
  }

  public componentDidUpdate() {
    this.paint();
  }

  public paint() {
    if (this.divRef.current) {
      const {columnWidths, rowHeight} = this.props;
      const xs = [0, ...cumsum(columnWidths)];
      const colParams = columnWidths.map((width, i) => ({width, x: xs[i]}));
      renderCells(this.divRef.current, this.props.dataFrame, {colParams, rowHeight, rowRange: [0, 30]});
    }
  }

  public render() {
    return (
      <div className="table-content" ref={this.divRef} />
    );
  }
}

export interface ColumnParam {
  width: number;
  x: number;
}

interface RenderCellOptions {
  colRange?: [number, number];
  rowRange?: [number, number];
  colParams: ColumnParam[];
  rowHeight: number;
}

function renderCells(rootElement: HTMLDivElement, dataFrame: IDataFrame, options: RenderCellOptions) {

  const {colRange, rowRange, colParams, rowHeight} = options;
  let filteredDF = dataFrame;
  
  if (rowRange) {
    filteredDF = filteredDF.skip(rowRange[0]).take(rowRange[1] - rowRange[0]);
  }

  if (colRange) {
    filteredDF = filteredDF.subset(filteredDF.getColumnNames().slice(...colRange));
    // filteredDF = filteredDF.map(row => row.slice(colRange[0], colRange[1]));
  }

  const filteredData = filteredDF.toRows();

  const rowStart = rowRange ? rowRange[0] : 0;
  const colStart = colRange ? colRange[0] : 0;

  const mappedData = _.flatten(filteredData.map((r, i) => {
    return r.map((value, j) => {
      const row = i + rowStart;
      const col = j + colStart;
      return {
        value, row, col,
        y: row * rowHeight,
        x: colParams[col].x,
        width: colParams[col].width
      };
    })
  }));

  const root = d3.select(rootElement);
  const cell = root.selectAll<HTMLDivElement, null>('div.cell')
    .data(mappedData, function(d) { return d ? `c-${d.row}-${d.col}` : this.id; });

  cell.join(
    enter => {
      const div = enter.append('div')
        .attr('class', e => `cell col-${e.col} row-${e.row}`)
        .style('left', e => `${e.x}px`)
        .style('top', e => `${e.y}px`)
        .style('width', e => `${e.width}px`)
        .style('height', `${rowHeight}px`);

      div.append('div').attr('class', 'content');
      return div;
    },
    update => {
      return update.style('width', e => `${e.width}px`);
    },

  ).select('div.content').text(e => e.value);
  
}