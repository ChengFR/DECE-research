import * as React from "react";
import { Grid, GridCellProps, Index, ScrollParams } from "react-virtualized";
import { cumsum } from "../../common/math";

export interface IHeaderProps {
  columns: { name: string; type: string }[];
  // columnWidths: number[];
  columnWidth: number | ((params: Index) => number);
  height: number;
  width: number;
  style?: React.CSSProperties;
  scrollLeft?: number;
  className?: string;
  onScroll?: (params: ScrollParams) => any;
}

export interface IHeaderState {
  scrollLeft: number;
  scrollTop: number;
}

export default class Header extends React.Component<
  IHeaderProps,
  IHeaderState
> {
  static defaultProps = {
    height: 20
  };
  private _ref: React.LegacyRef<Grid> = React.createRef();
  constructor(props: IHeaderProps) {
    super(props);

    this.state = {
      scrollLeft: 0,
      scrollTop: 0
    };
    this._cellRenderer = this._cellRenderer.bind(this);
  }

  // public backup_render() {
  //   const { columns, columnWidths, height } = this.props;
  //   const xs = [0, ...cumsum(columnWidths)];

  //   return (
  //     <div className="table-header" style={{ height }}>
  //       {columns.map((col, i) => {
  //         const style = { left: xs[i], width: columnWidths[i], height: height };
  //         return (
  //           <div className="cell" style={style}>
  //             {col.name}
  //           </div>
  //         );
  //       })}
  //     </div>
  //   );
  // }

  public render() {
    const { height, width, style, columns, scrollLeft, onScroll, className } = this.props;

    const gridHeight = height;

    const HeaderGrid = (
      <Grid
        cellRenderer={this._cellRenderer}
        className={className}
        columnCount={columns.length}
        columnWidth={this.props.columnWidth}
        height={gridHeight}
        rowHeight={height}
        onScroll={onScroll}
        ref={this._ref}
        rowCount={1}
        scrollLeft={scrollLeft}
        style={{ ...style, left: 0, overflowX: 'hidden' }}
        tabIndex={null}
        width={width}
      />
    );

    return (
      <div
        className={`${className}-ScrollWrapper`}
        style={{
          ...style,
          height,
          width,
          overflowX: "hidden"
        }}
      >
        {HeaderGrid}
      </div>
    );
  }

  _cellRenderer(cellProps: GridCellProps) {
    const { columnIndex, key, style, ...rest } = cellProps;
    const { columns } = this.props;

    return (
      <div className={`header-cell col-${columnIndex}`} key={key} style={style}>
        {columns[columnIndex].name}
      </div>
    );
  }
}
