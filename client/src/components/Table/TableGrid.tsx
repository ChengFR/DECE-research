import * as React from 'react';
import * as d3 from 'd3';
import _ from 'lodash';
import { Grid, GridCellProps, Index, ScrollParams } from 'react-virtualized';
import { IDataFrame } from 'data-forge';

export interface ITableGridProps {
  data: Array<Array<number | string>>;
  // columnWidths: number[];
  columnWidth: number | ((params: Index) => number);
  rowHeight: number;
  height: number;
  width: number;
  className?: string;
  style?: React.CSSProperties;
  scrollLeft?: number;
  scrollTop?: number;
  onScroll?: (params: ScrollParams) => any;
}

export interface ITableGridState {
}

const config = {
    height: 300,
    overscanColumnCount: 0,
    overscanRowCount: 10,
    scrollToColumn: undefined,
    scrollToRow: undefined,
    useDynamicRowHeight: false,
}

export default class TableGrid extends React.Component<ITableGridProps, ITableGridState> {
  static defaultProps = {
    rowHeight: 20
  };
  // private divRef: React.RefObject<HTMLDivElement> = React.createRef();
  private _ref: React.LegacyRef<Grid> = React.createRef();

  constructor(props: ITableGridProps) {
    super(props);

    this.state = {
    };
    this._cellRenderer = this._cellRenderer.bind(this);
  }

  // public componentDidMount() {
  //   this.paint();
  // }

  // public componentDidUpdate() {
  //   this.paint();
  // }

  // public paint() {
  //   if (this.divRef.current) {
  //     const {columnWidths, rowHeight} = this.props;
  //     const xs = [0, ...cumsum(columnWidths)];
  //     const colParams = columnWidths.map((width, i) => ({width, x: xs[i]}));
  //     renderCells(this.divRef.current, this.props.dataFrame, {colParams, rowHeight, rowRange: [0, 30]});
  //   }
  // }

  // public render() {
  //   return (
  //     <div className="table-content" ref={this.divRef} />
  //   );
  // }
  public render() {
    const {data, style, className, ...rest} = this.props;

    return (
      <Grid
        {...rest}
        className={`${className} scrollbar fixed-scrollbar`}
        cellRenderer={this._cellRenderer}
        columnCount={data.length}
        // onScrollbarPresenceChange={this._onScrollbarPresenceChange}
        ref={this._ref}
        rowCount={data[0].length}
        // scrollToColumn={scrollToColumn - fixedColumnCount}
        // scrollToRow={scrollToRow - fixedRowCount}
        style={{...style}}
      />
    );
  }


  public _cellRenderer(cellProps: GridCellProps) {
    const {rowIndex, columnIndex, key, style} = cellProps;
    
    return (
      <div className={`cell row-${rowIndex} col-${columnIndex}`} key={key} style={style}>
        {this.props.data[columnIndex][rowIndex]}
      </div>
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