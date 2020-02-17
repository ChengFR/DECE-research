import * as d3 from "d3";
// import {scaleOrdinal, scaleLinear} from 'd3-scale';
import * as React from "react";
import * as _ from "lodash";
import {
  getMargin,
  CSSPropertiesFn,
  ChartOptions,
  getChildOrAppend,
} from "./common";
import { shallowCompare } from "../../common/utils";
import "./counterfactuals.css";

export interface ICFOptions extends ChartOptions {
  innerPadding: number;
  rectStyle?: CSSPropertiesFn<SVGRectElement, d3.Bin<number, number>>;
  onRectMouseOver?: d3.ValueFn<any, d3.Bin<number, number>, void>;
  onRectMouseMove?: d3.ValueFn<any, d3.Bin<number, number>, void>;
  onRectMouseLeave?: d3.ValueFn<any, d3.Bin<number, number>, void>;
  xScale: d3.ScaleLinear<number, number>;
}

export const defaultOptions = {
  width: 300,
  height: 200,
  margin: 0,
  innerPadding: 1
};

export function drawCFs(
  svg: SVGElement,
  baseValue: number,
  cfValues: number[],
  options: Omit<ICFOptions, keyof (typeof defaultOptions)> & Partial<Pick<ICFOptions, keyof (typeof defaultOptions)>>
) {
  const opts = { ...defaultOptions, ...options };
  const {
    height,
    rectStyle,
    innerPadding,
    onRectMouseOver,
    onRectMouseMove,
    onRectMouseLeave,
    xScale
  } = opts;

  const margin = getMargin(opts.margin);

  const yRange = [0, height - margin.top - margin.bottom];
  const step = Math.floor(yRange[1] / cfValues.length);
  const barWidth = step - innerPadding;
  const baseLength = xScale(baseValue);
  // console.debug("Rendering histogram", xRange, yRange);

  // X axis: scale and draw:

  const root = d3.select(svg);

  // const yAxis = getChildOrAppend<SVGGElement, SVGElement>(root, "g", "y-axis");
  // yAxis.call(d3.axisLeft(y));

  // append the bar rectangles to the svg element
  const g = getChildOrAppend<SVGGElement, SVGElement>(root, "g", "rects").attr(
    "transform",
    `translate(${margin.left}, ${margin.top})`
  );

  g.selectAll("rect.base")
    .data(cfValues)
    .join<SVGRectElement>(enter => {
      return enter
        .append("rect")
        .attr("class", 'base');
    })
    .attr("width", baseLength)
    .attr("y", (_, i) => i * step)
    .attr("height", barWidth);

  const merged = g
    .selectAll("rect.diff")
    .data(cfValues)
    .join<SVGRectElement>(enter => {
      const rect = enter.append("rect");
      rect.append('title').text(d => d);
      return rect;
    })
    .attr("x", (d, i) => d < baseValue ? xScale(d) : baseLength)
    .attr("y", (_, i) => i * step)
    .attr("width", d => Math.max(0, Math.abs(baseLength - xScale(d))))
    .attr("height", barWidth)
    .attr("class", d => `diff ${d < baseValue ? 'decrease' : 'increase'}`);

    // .on("mouseover", (onRectMouseOver || null) as null)
    // .on("mousemove", (onRectMouseMove || null) as null)
    // .on("mouseleave", (onRectMouseLeave || null) as null);


  if (rectStyle) {
    Object.keys(rectStyle).forEach(key => {
      merged.style(
        key,
        (rectStyle[key as keyof typeof rectStyle] || null) as null
      );
    });
  }
}

export interface IFeatureCFProps extends ICFOptions {
  baseValue: number
  cfValues: number[];
  style?: React.CSSProperties;
  svgStyle?: React.CSSProperties;
  className?: string;
}

export interface IFeatureCFState {
}

export class FeatureCF extends React.PureComponent<
  IFeatureCFProps,
  IFeatureCFState
> {
  static defaultProps = { ...defaultOptions };
  private svgRef: React.RefObject<SVGSVGElement> = React.createRef();
  private shouldPaint: boolean = false;

  constructor(props: IFeatureCFProps) {
    super(props);

    this.state = { hoveredBin: null };
    this.paint = this.paint.bind(this);
    // this.onMouseOverBar = this.onMouseOverBar.bind(this);
    // this.onMouseLeaveBar = this.onMouseLeaveBar.bind(this);
  }

  public paint(svg: SVGSVGElement | null = this.svgRef.current) {
    if (svg) {
      const { baseValue, cfValues, className, style, svgStyle, height, xScale, ...rest } = this.props;
      drawCFs(svg, baseValue, cfValues, { xScale, height, ...rest });
      this.shouldPaint = false;
    }
  }

  public componentDidMount() {
    this.paint();
  }

  public componentDidUpdate(
    prevProps: IFeatureCFProps,
    prevState: IFeatureCFState
  ) {
    const excludedProperties = new Set(["style", "svgStyle", "className"]);
    if (!shallowCompare(this.props, prevProps, excludedProperties)) {
      this.shouldPaint = true;
      const delayedPaint = () => {
        if (this.shouldPaint) this.paint();
      };
      window.setTimeout(delayedPaint, 100);
    }
    // }
  }

  public render() {
    const { style, className, width, height } = this.props;
    return (
        <svg
          className={className ? `${className} feature-cf` : 'feature-cf'}
          style={style}
          ref={this.svgRef}
          width={width}
          height={height}
        />
    );
  }
}

export default FeatureCF;
