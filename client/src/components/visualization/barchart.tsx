import * as d3 from "d3";
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
import { countCategories } from './common';

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

export function drawBarChart(
  svg: SVGElement,
  data: Category[],
  xScale: d3.ScaleBand<string>,
  options?: Partial<IBarChartOptions>
) {
  const opts = { ...defaultOptions, ...options };
  const {
    height,
    rectStyle,
    onRectMouseOver,
    onRectMouseMove,
    onRectMouseLeave
  } = opts;
  const margin = getMargin(opts.margin);

  const yRange: [number, number] = [height - margin.top - margin.bottom, 0];

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
    `translate(${margin.left + xScale.paddingOuter()}, ${margin.top})`
  );
  const merged = g
    .selectAll("rect.bar")
    .data(data)
    .join<SVGRectElement>(enter => {
      return enter.append("rect").attr("class", "bar");
    })
    .attr("x", d => xScale(d.name) || 0)
    .attr("width", xScale.bandwidth())
    .attr("y", d => y(d.count))
    .attr("height", d => yRange[0] - y(d.count));

  g.selectAll("rect.shade")
    .data(data)
    .join<SVGRectElement>(enter => {
      return enter.append("rect").attr("class", "shade");
    })
    .attr("x", d => xScale(d.name) || 0)
    .attr("width", xScale.bandwidth())
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
  xScale: d3.ScaleBand<string>;
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
      const { data, style, svgStyle, className, height, xScale, ...rest } = this.props;
      const barData = this.count(data);
      drawBarChart(svg, barData, xScale, {
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
