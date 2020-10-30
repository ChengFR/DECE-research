import * as React from 'react';

export interface IColResizerProps {
  className?: string;
  x: number;
  onChangeX: (x: number) => void;
  style?: React.CSSProperties;
  snap: number;
}

export interface IColResizerState {}

export default class ColResizer extends React.Component<IColResizerProps, IColResizerState> {
  static defaultProps = {
    snap: 1
  };
  constructor(props: IColResizerProps) {
    super(props);
    this.state = {};
    this.handleStart = this.handleStart.bind(this);
  }
  render() {
    const { className, style } = this.props;
    let classes = ["col-resizer"];
    if (className) classes.push(className);

    return (
      <div
        className={classes.join(" ")}
        style={{ ...style}}
        onMouseDown={this.handleStart}
      />
    );
  }

  handleStart = (event: React.MouseEvent) => {
    event.preventDefault();
    const dragStartMouseX = Math.round(event.pageX);
    const { onChangeX, snap } = this.props;
    const initialX = this.props.x;
    let prevX = initialX;

    window.addEventListener("mousemove", handleResize);
    window.addEventListener("mouseup", stopResize);

    function handleResize(event: MouseEvent): void {
      const delta = event.pageX - dragStartMouseX;
      const newX = Math.round(initialX + Math.round(delta / snap) * snap);
      if (newX !== prevX) {
        onChangeX(newX);
        prevX = newX;
      }
    }

    function stopResize(event: MouseEvent): void {
      window.removeEventListener("mousemove", handleResize);
      window.removeEventListener("mouseup", stopResize);
    }
  };
}
