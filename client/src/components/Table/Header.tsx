import * as React from "react";
import { cumsum } from '../../common/math';

export interface IHeaderProps {
  columns: { name: string; type: string }[];
  columnWidths: number[];
  height: number;
}

export interface IHeaderState {}

export default class Header extends React.Component<
  IHeaderProps,
  IHeaderState
> {
  static defaultProps = {
    height: 20,
  };
  constructor(props: IHeaderProps) {
    super(props);

    this.state = {};
  }

  public render() {
    const {columns, columnWidths, height} = this.props;
    const xs = [0, ...cumsum(columnWidths)];
    return (
      <div className="table-header" style={{height}}>
        {columns.map((col, i) => {
          const style = {left: xs[i], width: columnWidths[i], height: height};
          return <div className="cell" style={style}>{col.name}</div>;
        })}
      </div>
    );
  }
}
