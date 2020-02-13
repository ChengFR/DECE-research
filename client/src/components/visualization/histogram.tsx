import * as d3 from "d3";
// import {scaleOrdinal, scaleLinear} from 'd3-scale';
import * as React from "react";
import {
  getMargin,
  CSSPropertiesFn,
  ChartOptions,
  getChildOrAppend
} from "./common";
import "./histogram.css";

export interface IHistogramOptions extends ChartOptions {
  innerPadding: number;
  rectClass?: string;
  rectStyle?: CSSPropertiesFn<SVGRectElement, d3.Bin<number, number>>;
  onRectMouseOver?: d3.ValueFn<SVGRectElement, d3.Bin<number, number>, void>;
  onRectMouseMove?: d3.ValueFn<SVGRectElement, d3.Bin<number, number>, void>;
  onRectMouseLeave?: d3.ValueFn<SVGRectElement, d3.Bin<number, number>, void>;
}

export const defaultOptions: IHistogramOptions = {
  width: 300,
  height: 200,
  margin: 3,
  innerPadding: 1
};

function getNBinsRange(width: number): [number, number] {
  return [Math.ceil(width / 9), Math.floor(width / 6)];
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
    rectClass,
    rectStyle,
    innerPadding,
    onRectMouseOver,
    onRectMouseMove,
    onRectMouseLeave
  } = opts;
  const margin = getMargin(opts.margin);

  const xRange = [0, width - margin.right - margin.left];
  const yRange = [height - margin.top - margin.bottom, 0];
  // console.debug("Rendering histogram", xRange, yRange);

  // X axis: scale and draw:
  const dataExtent = d3.extent(data);
  if (dataExtent[0] === undefined) {
    throw dataExtent;
  }
  const x = d3
    .scaleLinear()
    .domain(dataExtent)
    .nice()
    .range(xRange);

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
    .selectAll("rect")
    .data(bins)
    .join<SVGRectElement>(enter => {
      return enter
        .append("rect")
        .attr("x", innerPadding)
        .attr("class", (rectClass || null) as string);
    })
    .attr("transform", d => {
      return `translate(${x(d.x0 as number)}, ${y(d.length)})`;
    })
    .attr("width", d => {
      // console.debug("update width to", x(d.x1 as number) - x(d.x0 as number) - 1);
      return Math.max(0, x(d.x1 as number) - x(d.x0 as number) - 1);
    })
    .attr("height", d => {
      return yRange[0] - y(d.length);
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
  className?: string;
}

export interface IHistogramState {}

export class Histogram extends React.PureComponent<
  IHistogramProps,
  IHistogramState
> {
  static defaultProps = { ...defaultOptions };
  private svgRef: React.RefObject<SVGSVGElement> = React.createRef();
  private shouldPaint: boolean = false;
  constructor(props: IHistogramProps) {
    super(props);

    this.state = {};
    this.paint = this.paint.bind(this);
  }

  public paint(svg: SVGSVGElement | null = this.svgRef.current) {
    if (svg) {
      const { data, ...rest } = this.props;
      drawHistogram(svg, data, rest);
      this.shouldPaint = false;
    }
  }

  public componentDidMount() {
    this.paint();
  }

  public componentDidUpdate(
    prevProps: IHistogramProps,
    prevState: IHistogramState
  ) {
    this.shouldPaint = true;
    const delayedPaint = () => {
      if (this.shouldPaint) this.paint();
    };
    window.setTimeout(delayedPaint, 200);
    // }
  }

  public render() {
    const { style, className, width, height } = this.props;
    return (
      <div className={(className || "") + " histogram"}>
        <svg ref={this.svgRef} style={style} width={width} height={height} />
        <div className="info">
        </div>
      </div>
    );
  }
}

export default Histogram;
