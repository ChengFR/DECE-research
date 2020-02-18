import * as d3 from "d3";
// import {scaleOrdinal, scaleLinear} from 'd3-scale';
import * as React from "react";
import {
  getMargin,
  CSSPropertiesFn,
  ChartOptions,
  getChildOrAppend,
  getScaleLinear
} from "./common";
import "./histogram.css";
import { shallowCompare } from "../../common/utils";
import memoizeOne from "memoize-one";

export interface IHistogramOptions extends ChartOptions {
  innerPadding: number;
  rectStyle?: CSSPropertiesFn<SVGRectElement, d3.Bin<number, number>>;
  onRectMouseOver?: d3.ValueFn<any, d3.Bin<number, number>, void>;
  onRectMouseMove?: d3.ValueFn<any, d3.Bin<number, number>, void>;
  onRectMouseLeave?: d3.ValueFn<any, d3.Bin<number, number>, void>;
  xScale?: d3.ScaleLinear<number, number>;
}

export const defaultOptions: IHistogramOptions = {
  width: 300,
  height: 200,
  margin: 0,
  innerPadding: 1
};

function getNBinsRange(width: number): [number, number] {
  return [Math.ceil(width / 9), Math.floor(width / 7)];
}

export function drawHistogram(
  svg: SVGElement,
  data: ArrayLike<number>,
  options?: Partial<IHistogramOptions>
) {
  const opts = { ...defaultOptions, ...options };
  const {
    width,
    height,
    rectStyle,
    innerPadding,
    onRectMouseOver,
    onRectMouseMove,
    onRectMouseLeave,
    xScale
  } = opts;

  const margin = getMargin(opts.margin);

  const xRange = [0, width - margin.right - margin.left] as [number, number];
  const yRange = [height - margin.top - margin.bottom, 0];
  // console.debug("Rendering histogram", xRange, yRange);

  // X axis: scale and draw:
  const x = xScale ? xScale : getScaleLinear(data, ...xRange);

  const root = d3.select(svg);

  // const xAxis = getChildOrAppend<SVGGElement, SVGElement>(root, "g", "x-axis");
  // xAxis.attr("transform", `translate(0,${height})`).call(d3.axisBottom(x));

  // set the parameters for the histogram
  const nBins = d3.thresholdSturges(data);
  const [min, max] = getNBinsRange(width);
  const ticks = x.ticks(Math.min(Math.max(min, nBins), max));

  const histogram = d3
    .histogram()
    .domain(x.domain() as [number, number])
    .thresholds(ticks);

  const bins = histogram(data);

  // Y axis: scale and draw:
  const y = d3.scaleLinear().range(yRange);

  y.domain([
    0,
    d3.max(bins, function(d) {
      return d.length;
    }) as number
  ]); // d3.hist has to be called before the Y axis obviously

  // const yAxis = getChildOrAppend<SVGGElement, SVGElement>(root, "g", "y-axis");
  // yAxis.call(d3.axisLeft(y));

  // append the bar rectangles to the svg element
  const g = getChildOrAppend<SVGGElement, SVGElement>(root, "g", "rects").attr(
    "transform",
    `translate(${margin.left}, ${margin.top})`
  );
  const merged = g
    .selectAll("rect.bar")
    .data(bins)
    .join<SVGRectElement>(enter => {
      return enter
        .append("rect")
        .attr("x", innerPadding)
        .attr("class", 'bar');
    })
    .attr("transform", d => {
      return `translate(${x(d.x0 as number)}, ${y(d.length)})`;
    })
    .attr("width", d => {
      // console.debug("update width to", x(d.x1 as number) - x(d.x0 as number) - 1);
      return Math.max(0, x(d.x1 as number) - x(d.x0 as number) - 1);
    })
    .attr("height", d => {
      return yRange[0] - y(d.length) + 0.01;
    });

  g.selectAll("rect.shade")
    .data(bins)
    .join<SVGRectElement>(enter => {
      return enter
        .append("rect")
        .attr("class", 'shade')
        .attr("y", yRange[1]);
    })
    .attr("x", d => {
      return x(d.x0 as number);
    })
    .attr("width", d => {
      // console.debug("update width to", x(d.x1 as number) - x(d.x0 as number) - 1);
      return Math.max(0, x(d.x1 as number) - x(d.x0 as number));
    })
    .attr("height", d => {
      return yRange[0];
    })
    .on("mouseover", (onRectMouseOver || null) as null)
    .on("mousemove", (onRectMouseMove || null) as null)
    .on("mouseleave", (onRectMouseLeave || null) as null);

  if (rectStyle) {
    Object.keys(rectStyle).forEach(key => {
      merged.style(
        key,
        (rectStyle[key as keyof typeof rectStyle] || null) as null
      );
    });
  }
}

export interface IHistogramProps extends IHistogramOptions {
  data: ArrayLike<number>;
  style?: React.CSSProperties;
  svgStyle?: React.CSSProperties;
  className?: string;
}

export interface IHistogramState {
  hoveredBin: [number, number] | null;
  xScale?: d3.ScaleLinear<number, number>;
}

export class Histogram extends React.PureComponent<
  IHistogramProps,
  IHistogramState
> {
  static defaultProps = { ...defaultOptions };
  private svgRef: React.RefObject<SVGSVGElement> = React.createRef();
  private shouldPaint: boolean = false;

  constructor(props: IHistogramProps) {
    super(props);

    this.state = { hoveredBin: null };
    this.paint = this.paint.bind(this);
    this.onMouseOverBar = this.onMouseOverBar.bind(this);
    this.onMouseLeaveBar = this.onMouseLeaveBar.bind(this);
  }

  public paint(svg: SVGSVGElement | null = this.svgRef.current) {
    if (svg) {
      const { data, className, style, svgStyle, height, ...rest } = this.props;
      const xScale = this.state.xScale;
      drawHistogram(svg, data, { xScale, height: height - 24, ...rest, onRectMouseOver: this.onMouseOverBar, onRectMouseLeave: this.onMouseLeaveBar });
      this.shouldPaint = false;
    }
  }

  public componentDidMount() {
    this.setState({ xScale: this.getXscale() });
    this.paint();
  }

  public componentDidUpdate(
    prevProps: IHistogramProps,
    prevState: IHistogramState
  ) {
    const excludedProperties = new Set(["style", "svgStyle", "className"]);
    if (!shallowCompare(this.props, prevProps, excludedProperties)) {
      this.shouldPaint = true;
      this.setState({ xScale: this.getXscale() });
      const delayedPaint = () => {
        if (this.shouldPaint) this.paint();
      };
      window.setTimeout(delayedPaint, 100);
    }

    // }
  }

  memoizedXScaler = memoizeOne(getScaleLinear);

  getXscale = () => {
    const { data, width } = this.props;
    const margin = getMargin(this.props.margin);
    return this.memoizedXScaler(data, 0, width - margin.left - margin.right);
  };

  public render() {
    const { style, svgStyle, className, width, height } = this.props;
    const { xScale, hoveredBin } = this.state;
    const xRange = xScale && xScale.domain();
    return (
      <div className={(className || "") + " histogram"} style={style}>
        <svg
          ref={this.svgRef}
          style={{...svgStyle, marginTop: 4}}
          width={width}
          height={height - 24}
        />
        <div className="info">
          {hoveredBin
            ? `${hoveredBin[0]} - ${hoveredBin[1]}`
            : xRange && `${xRange[0]} - ${xRange[1]}`}
        </div>
      </div>
    );
  }

  onMouseOverBar: NonNullable<IHistogramOptions["onRectMouseOver"]> = (
    data,
    index
  ) => {
    const {x0, x1} = data;
    this.setState({ hoveredBin: [x0 === undefined ? -Infinity: x0, x1 === undefined ? Infinity : x1] });
  };

  onMouseLeaveBar: NonNullable<IHistogramOptions["onRectMouseOver"]> = (
    data,
    index
  ) => {
    this.setState({ hoveredBin: null });
  };
}

export default Histogram;
