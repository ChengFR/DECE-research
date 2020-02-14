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
import "./barchart.css";
import memoizeOne from "memoize-one";

type Category = {
  count: number;
  name: string;
};

export interface IBarChartOptions extends ChartOptions {
  innerPadding: number;
  barWidth?: number;
  maxStep: number;
  categories?: string[];
  rectStyle?: CSSPropertiesFn<SVGRectElement, Category>;
  onRectMouseOver?: d3.ValueFn<any, Category, void>;
  onRectMouseMove?: d3.ValueFn<any, Category, void>;
  onRectMouseLeave?: d3.ValueFn<any, Category, void>;
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

function countCategories(data: Array<string | number>, categories?: string[]) {
  const counter = _.countBy(data);
  const domain: string[] = categories || _.keys(counter).sort();
  const visData = domain.map(
    (c, i): Category => ({
      count: counter[c] || 0,
      name: domain[i]
    })
  );
  return visData;
}

export function drawBarChart(
  svg: SVGElement,
  data: Category[],
  options?: Partial<IBarChartOptions>
) {
  const opts = { ...defaultOptions, ...options };
  const {
    width,
    height,
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

  // X axis: scale and draw:
  const domain: string[] = data.map(d => d.name);

  const outerPadding = getOuterPadding(
    xRange[1],
    domain.length,
    innerPadding,
    maxStep
  );
  const x = d3
    .scaleBand()
    .domain(domain)
    .paddingInner(innerPadding)
    .paddingOuter(outerPadding)
    .rangeRound(xRange);

  const root = d3.select(svg);

  const y = d3
    .scaleLinear()
    .range(yRange)
    .domain([0, d3.max(data, d => d.count) as number]);

  // const yAxis = getChildOrAppend<SVGGElement, SVGElement>(root, "g", "y-axis");
  // yAxis.call(d3.axisLeft(y));

  // append the bar rectangles to the svg element
  const g = getChildOrAppend<SVGGElement, SVGElement>(root, "g", "bars").attr(
    "transform",
    `translate(${margin.left + outerPadding}, ${margin.top})`
  );
  const merged = g
    .selectAll("rect.bar")
    .data(data)
    .join<SVGRectElement>(enter => {
      return enter.append("rect").attr("class", "bar");
    })
    .attr("x", d => x(d.name) || 0)
    .attr("width", x.bandwidth())
    .attr("y", d => y(d.count))
    .attr("height", d => yRange[0] - y(d.count));

  g.selectAll("rect.shade")
    .data(data)
    .join<SVGRectElement>(enter => {
      return enter.append("rect").attr("class", "shade");
    })
    .attr("x", d => x(d.name) || 0)
    .attr("width", x.bandwidth())
    .attr("y", yRange[1])
    .attr("height", yRange[0])
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
  svgStyle?: React.CSSProperties;
  className?: string;
}

export interface IBarChartState {
  hoveredCategory: string | null;
}

export class BarChart extends React.PureComponent<
  IBarChartProps,
  IBarChartState
> {
  static defaultProps = { ...defaultOptions };
  private ref: React.RefObject<SVGSVGElement> = React.createRef();
  private shouldPaint: boolean = false;
  constructor(props: IBarChartProps) {
    super(props);

    this.state = { hoveredCategory: null };
    this.paint = this.paint.bind(this);
    this.onMouseOverBar = this.onMouseOverBar.bind(this);
    this.onMouseLeaveBar = this.onMouseLeaveBar.bind(this);
  }

  count = memoizeOne(countCategories);

  public paint(svg: SVGSVGElement | null = this.ref.current) {
    if (svg) {
      console.debug("rendering bar chart");
      const { data, style, svgStyle, className, height, ...rest } = this.props;
      const barData = this.count(data);
      drawBarChart(svg, barData, {
        ...rest,
        height: height - 20,
        onRectMouseOver: this.onMouseOverBar,
        onRectMouseLeave: this.onMouseLeaveBar
      });
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
    const {
      style,
      svgStyle,
      className,
      width,
      height,
      data,
      categories
    } = this.props;
    const { hoveredCategory } = this.state;
    const barData = this.count(data, categories);
    return (
      <div className={(className || "") + " bar-chart"} style={style}>
        <svg
          ref={this.ref}
          style={svgStyle}
          width={width}
          height={height - 20}
        />
        <div className="info">
          {hoveredCategory
            ? `${hoveredCategory}`
            : `${barData.length} Categories`}
        </div>
      </div>
    );
  }

  onMouseOverBar: NonNullable<IBarChartOptions["onRectMouseOver"]> = data => {
    this.setState({ hoveredCategory: data.name });
  };

  onMouseLeaveBar: NonNullable<IBarChartOptions["onRectMouseOver"]> = () => {
    this.setState({ hoveredCategory: null });
  };
}

export default BarChart;
