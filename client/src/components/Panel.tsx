import * as React from "react";
// import Moveable from "moveable";
import {Rnd} from 'react-rnd';

import './Panel.css';

export interface IPanelProps {
  width?: number;
  height?: number;
  x?: number;
  y?: number;
}

export interface IPanelState {
  width: number;
  height: number;
  x: number;
  y: number;
  // translate: [number, number];
}

export default class Panel extends React.Component<IPanelProps, IPanelState> {
  // static getDerivedStateFromProps(nextProps: ITableProps, prevState: ITableState) {
  //   if (nextProps.dataFrame !== prevState.dataFrame) {
  //     const columns = nextProps.dataFrame
  //       .getColumns()
  //       .toArray()
  //       .map(({ name, type }) => {
  //         return { name, type };
  //       });
  //     return {
  //       dataFrame: nextProps.dataFrame,
  //       columns
  //     };
  //   }

  //   return null;
  // }
  private ref: React.RefObject<HTMLDivElement> = React.createRef();
  constructor(props: IPanelProps) {
    super(props);

    this.state = {
      width: props.width || 600,
      height: props.height || 400,
      x: props.x || 0,
      y: props.y || 0,
    };
  }

  public componentDidMount() {
    // const moveable = new Moveable(document.body, {
    //   target: this.ref.current || undefined,
    //   scalable: true,
    //   throttleScale: 0,
    //   keepRatio: false
    // });
    // console.log(moveable);
    // moveable
    //   .on("resizeStart", ({ target, set, setOrigin, dragStart }) => {
    //     console.log("onResizeStart");
    //     // Set origin if transform-orgin use %.
    //     setOrigin(["%", "%"]);

    //     // If cssSize and offsetSize are different, set cssSize. (no box-sizing)
    //     // const style = window.getComputedStyle(target);
    //     // const cssWidth = parseFloat(style.width);
    //     // const cssHeight = parseFloat(style.height);
    //     set([this.state.width, this.state.height]);

    //     // If a drag event has already occurred, there is no dragStart.
    //     dragStart && dragStart.set(this.state.translate);
    //   })
    //   .on("resize", ({ target, width, height, drag }) => {
    //     console.log(`onResize [${width}, ${height}]`);
    //     // target.style.width = `${width}px`;
    //     // target.style.height = `${height}px`;

    //     // get drag event
    //     this.setState({width, height, translate: drag.beforeTranslate as [number, number]});
    //     // frame.translate = drag.beforeTranslate;
    //     // target.style.transform = `translate(${drag.beforeTranslate[0]}px, ${drag.beforeTranslate[1]}px)`;
    //   })
    //   .on("resizeEnd", ({ target, isDrag, clientX, clientY }) => {
    //     console.log("onResizeEnd", target, isDrag);
    //   });
  }

  public render() {
    const { x, y, width, height } = this.state;
    return (
      <Rnd
        className="panel-wrapper"
        default={{
          x: 150,
          y: 205,
          width: 500,
          height: 190,
        }}
        size={{ width,  height }}
        position={{ x, y }}
        minWidth={500}
        minHeight={190}
        bounds="window"
        disableDragging={true}
        onDragStop={(e, d) => { this.setState({ x: d.x, y: d.y }) }}
        onResize={(e, direction, ref, delta, position) => {
          this.setState({
            width: ref.offsetWidth,
            height: ref.offsetHeight,
            ...position,
          });
        }}
      >
        {this.props.children}
      </Rnd>
      // <div className="panel-wrapper" ref={this.ref} style={{width, height, transform}}>
      //   {this.props.children}
      // </div>
    );
  }
}
