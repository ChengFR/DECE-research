import * as d3 from "d3";
import * as _ from "lodash";
// import {scaleOrdinal, scaleLinear} from 'd3-scale';
import * as React from "react";
import {
  getMargin,
  CSSPropertiesFn,
  ChartOptions,
  getChildOrAppend
} from "./common";
import "./histogram.css";

export interface IBarChartOptions extends ChartOptions {
  innerPadding: number;
  barWidth?: number;
  maxStep: number;
  rectClass?: string;
  categories?: string[];
  rectStyle?: CSSPropertiesFn<SVGRectElement, d3.Bin<number, number>>;
  onRectMouseOver?: d3.ValueFn<SVGRectElement, d3.Bin<number, number>, void>;
  onRectMouseMove?: d3.ValueFn<SVGRectElement, d3.Bin<number, number>, void>;
  onRectMouseLeave?: d3.ValueFn<SVGRectElement, d3.Bin<number, number>, void>;
}

export const defaultOptions: IBarChartOptions = {
  width: 300,
  height: 200,
  margin: 3,
  innerPadding: 0.25,
  maxStep: 35
};

function getOuterPadding(
  width: number,
  nBars: number,
  innerPadding: number,
  maxStep: number
) {
  const minOuterPadding = Math.round(
    (width - maxStep * nBars + maxStep * innerPadding) / 2 / maxStep
  );
  let outerPadding = Math.max(minOuterPadding, innerPadding);
  return outerPadding;
}

export function drawBarChart(
  svg: SVGElement,
  data: Array<number | string>,
  options?: Partial<IBarChartOptions>
) {
  const opts = { ...defaultOptions, ...options };
  const {
    width,
    height,
    rectClass,
    rectStyle,
    innerPadding,
    maxStep,
    categories,
    onRectMouseOver,
    onRectMouseMove,
    onRectMouseLeave
  } = opts;
  const margin = getMargin(opts.margin);

  const xRange: [number, number] = [0, width - margin.right - margin.left];
  const yRange: [number, number] = [height - margin.top - margin.bottom, 0];
  console.debug("Rendering histogram", xRange, yRange);

  // X axis: scale and draw:
  const counter = _.countBy(data);
  const domain: string[] = categories || _.keys(counter).sort();
  const visData = domain.map((c, i) => ({
    count: counter[c] || 0,
    category: domain[i]
  }));

  const outerPadding = getOuterPadding(xRange[1],domain.length,innerPadding,maxStep);
  const x = d3
    .scaleBand()
    .domain(domain)
    .paddingInner(innerPadding)
    .paddingOuter(outerPadding)
    .rangeRound(xRange);
  console.log(domain.length, innerPadding, outerPadding, x.bandwidth(), x.step());

  const root = d3.select(svg);

  const y = d3
    .scaleLinear()
    .range(yRange)
    .domain([0, d3.max(visData, d => d.count) as number]);

  // const yAxis = getChildOrAppend<SVGGElement, SVGElement>(root, "g", "y-axis");
  // yAxis.call(d3.axisLeft(y));

  // append the bar rectangles to the svg element
  const g = getChildOrAppend<SVGGElement, SVGElement>(root, "g", "bars").attr(
    "transform",
    `translate(${margin.left + outerPadding}, ${margin.top})`
  );
  const merged = g
    .selectAll("rect")
    .data(visData)
    .join<SVGRectElement>(enter => {
      return enter.append("rect").attr("class", (rectClass || null) as string);
    })
    .attr("x", d => x(d.category) || 0)
    .attr("width", x.bandwidth())
    .attr("y", d => y(d.count))
    .attr("height", d => yRange[0] - y(d.count))
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

export interface IBarChartProps extends IBarChartOptions {
  data: Array<number | string>;
  style?: React.CSSProperties;
  className?: string;
}

export interface IBarChartState {}

export class BarChart extends React.PureComponent<
  IBarChartProps,
  IBarChartState
> {
  static defaultProps = { ...defaultOptions };
  private ref: React.RefObject<SVGSVGElement> = React.createRef();
  private shouldPaint: boolean = false;
  constructor(props: IBarChartProps) {
    super(props);

    this.state = {};
    this.paint = this.paint.bind(this);
  }

  public paint(svg: SVGSVGElement | null = this.ref.current) {
    if (svg) {
      console.debug("rendering bar chart");
      const { data, ...rest } = this.props;
      drawBarChart(svg, data, rest);
      this.shouldPaint = false;
    }
  }

  public componentDidMount() {
    this.paint();
  }

  public componentDidUpdate(
    prevProps: IBarChartProps,
    prevState: IBarChartState
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
      <svg
        ref={this.ref}
        style={style}
        className={(className || "") + " histogram"}
        width={width}
        height={height}
      />
    );
  }
}

export default BarChart;
