import * as d3 from "d3";
// import {scaleOrdinal, scaleLinear} from 'd3-scale';
import * as React from "react";
import {
  getMargin,
  ChartOptions,
  getChildOrAppend,
} from "./common";
import { shallowCompare } from "../../common/utils";
import { MarginType, DELAY_PAINT_TIME } from './common';
import "./stackedFeature.css";

export interface IStackedFeatureOptions extends ChartOptions {
  xScale: d3.ScaleLinear<number, number>;
  pixel: number
}

export const defaultOptions = {
  width: 100,
  height: 200,
  margin: 0,
};

export function drawStackedNumerical(
  svg: SVGElement,
  data: number[],
  options: Omit<IStackedFeatureOptions, keyof (typeof defaultOptions)> & Partial<Pick<IStackedFeatureOptions, keyof (typeof defaultOptions)>>
) {
  const opts = { ...defaultOptions, ...options };
  const {
    pixel,
    xScale
  } = opts;

  const margin = getMargin(opts.margin);

  const root = d3.select(svg);

  // append the bar rectangles to the svg element
  const g = getChildOrAppend<SVGGElement, SVGElement>(root, "g", "feature-numeric").attr(
    "transform",
    `translate(${margin.left}, ${margin.top})`
  );

  g.selectAll("path")
    .data(data)
    .join<SVGPathElement>(enter => {
      return enter
        .append("path");
    })
    .attr("d", (d, i) => `M 0,${i*pixel} h ${xScale(d) - xScale(0)}`);
}

export interface IStackedFeatureProps {
  data: number[];
  width: number;
  pixel: number;
  margin: MarginType;
  xScale: d3.ScaleLinear<number, number>;
  style?: React.CSSProperties;
  svgStyle?: React.CSSProperties;
  className?: string;
}

export interface IStackedFeatureState {
}

export class StackedFeature extends React.PureComponent<
  IStackedFeatureProps,
  IStackedFeatureState
> {
  static defaultProps = { ...defaultOptions };
  private svgRef: React.RefObject<SVGSVGElement> = React.createRef();
  private shouldPaint: boolean = false;

  constructor(props: IStackedFeatureProps) {
    super(props);

    this.state = { hoveredBin: null };
    this.paint = this.paint.bind(this);
    this.getHeight = this.getHeight.bind(this);
  }

  public paint(svg: SVGSVGElement | null = this.svgRef.current) {
    if (svg) {
      const { data, className, style, svgStyle, xScale, ...rest } = this.props;
      drawStackedNumerical(svg, data, { xScale, ...rest });
      this.shouldPaint = false;
    }
  }

  public getHeight() {
    const {pixel, data} = this.props;
    const margin = getMargin(this.props.margin);
    return pixel * data.length + margin.top + margin.bottom;
  }

  public componentDidMount() {
    this.paint();
  }

  public componentDidUpdate(
    prevProps: IStackedFeatureProps,
    prevState: IStackedFeatureState
  ) {
    const excludedProperties = new Set(["style", "svgStyle", "className"]);
    if (!shallowCompare(this.props, prevProps, excludedProperties)) {
      this.shouldPaint = true;
      const delayedPaint = () => {
        if (this.shouldPaint) this.paint();
      };
      window.setTimeout(delayedPaint, DELAY_PAINT_TIME);
    }
    // }
  }

  public render() {
    const { style, className, width } = this.props;
    return (
        <svg
          className={className ? `${className} stacked-feature` : 'stacked-feature'}
          style={style}
          ref={this.svgRef}
          width={width}
          height={this.getHeight()}
        />
    );
  }

}

export default StackedFeature;
