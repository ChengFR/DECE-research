import * as d3 from "d3";
// import {scaleOrdinal, scaleLinear} from 'd3-scale';
import * as React from "react";
import _ from "lodash";
import ReactEcharts from "echarts-for-react";

import { getMargin, ChartOptions, getChildOrAppend } from "./common";
import { shallowCompare } from "../../common/utils";
import { MarginType, DELAY_PAINT_TIME, isStringArray } from "./common";
import "./stackedFeature.css";
import { rgb } from "d3";

export interface IStackedFeatureOptions extends ChartOptions {
  pixel: number;
}

export const defaultOptions = {
  width: 100,
  height: 200,
  margin: 0
};

export function drawStackedNumerical(
  svg: SVGElement,
  data: number[],
  xScale: d3.ScaleLinear<number, number>,
  options: Omit<IStackedFeatureOptions, keyof typeof defaultOptions> &
    Partial<Pick<IStackedFeatureOptions, keyof typeof defaultOptions>>
) {
  const opts = { ...defaultOptions, ...options };
  const { pixel } = opts;

  const margin = getMargin(opts.margin);

  const root = d3.select(svg);

  // append the bar rectangles to the svg element
  const g = getChildOrAppend<SVGGElement, SVGElement>(
    root,
    "g",
    "feature-numeric"
  ).attr("transform", `translate(${margin.left}, ${margin.top})`);

  g.selectAll("path")
    .data(data)
    .join<SVGPathElement>(enter => {
      return enter.append("path");
    })
    .attr("d", (d, i) => `M 0,${i * pixel} h ${xScale(d)}`)
    .style("stroke-width", pixel);
}

export function drawStackedCategorical(
  svg: SVGElement,
  data: string[],
  xScale: d3.ScaleBand<string>,
  options: Omit<IStackedFeatureOptions, keyof typeof defaultOptions> &
    Partial<Pick<IStackedFeatureOptions, keyof typeof defaultOptions>>
) {
  const opts = { ...defaultOptions, ...options };
  const { pixel } = opts;

  const margin = getMargin(opts.margin);

  const root = d3.select(svg);

  // append the bar rectangles to the svg element
  const g = getChildOrAppend<SVGGElement, SVGElement>(
    root,
    "g",
    "feature-categorical"
  ).attr("transform", `translate(${margin.left}, ${margin.top})`);

  g.selectAll("rect")
    .data(data)
    .join<SVGRectElement>(enter => {
      return enter.append("rect");
    })
    .attr("x", d => xScale(d) || 0)
    .attr("width", xScale.bandwidth())
    .attr("y", (d, i) => pixel * i)
    .attr("height", pixel);
}

export interface IStackedFeatureProps {
  data: number[] | string[];
  startIndex: number;
  endIndex: number;
  width: number;
  height: number;
  pixel: number;
  margin: MarginType;
  xScale: d3.ScaleLinear<number, number> | d3.ScaleBand<string>;
  style?: React.CSSProperties;
  svgStyle?: React.CSSProperties;
  className?: string;
}

export interface IStackedFeatureState {}

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
      const {
        data,
        startIndex,
        endIndex,
        className,
        style,
        svgStyle,
        xScale,
        ...rest
      } = this.props;
      if (isStringArray(data)) {
        drawStackedCategorical(
          svg,
          data.slice(startIndex, endIndex),
          xScale as d3.ScaleBand<string>,
          rest
        );
      } else {
        drawStackedNumerical(
          svg,
          data.slice(startIndex, endIndex),
          xScale as d3.ScaleLinear<number, number>,
          rest
        );
      }
      this.shouldPaint = false;
    }
  }

  public getHeight() {
    const { pixel, startIndex, endIndex } = this.props;
    const margin = getMargin(this.props.margin);
    return pixel * (endIndex - startIndex) + margin.top + margin.bottom;
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
    const { style, data, className, width, height, xScale } = this.props;
    return (
      // <svg
      //   className={className ? `${className} stacked-feature` : 'stacked-feature'}
      //   style={style}
      //   ref={this.svgRef}
      //   width={width}
      //   height={this.getHeight()}
      // />
      <ReactEcharts
        option={
          isStringArray(data)
            ? this.getOptionCategorical(data, xScale as d3.ScaleBand<string>)
            : this.getOptionNumerical(
                data,
                xScale as d3.ScaleLinear<number, number>
              )
        }
        style={{ ...style, width, height }}
      />
    );
  }

  public getOptionNumerical(
    data: number[],
    xScale: d3.ScaleLinear<number, number>
  ) {
    const { startIndex, endIndex, margin } = this.props;
    const domain = xScale.domain();
    return {
      series: [
        {
          type: "bar",
          data: data.slice(startIndex, endIndex).map(d => d - domain[0]),
          // Set `large` for large data amount
          large: true,
          itemStyle: {
            color: "rgb(155, 179, 206)"
          }
        }
      ],
      xAxis: {
        type: "value",
        min: 0,
        max: domain[1] - domain[0],
        show: false,
        boundaryGap: ["0%", "0%"],
      },
      yAxis: {
        type: "category",
        show: false,
        boundaryGap: false,
        axisLine:{
          onZero: false,
        },
        data: _.range(startIndex, endIndex).reverse()
      },
      grid: getMargin(margin)
    };
  }

  public getOptionCategorical(data: string[], xScale: d3.ScaleBand<string>) {
    const { startIndex, endIndex, margin } = this.props;
    const domain = xScale.domain();
    const range = xScale.range();
    const bandwidth = xScale.bandwidth();
    const str2idx: {[k: string]: number} = {};
    domain.forEach((s, i) => {
      str2idx[s] = i;
    });
    const options = {
      series: domain.map((category, idx) => ({
        type: 'scatter',
        data: [] as [number, number][],
        symbol: 'rect',
        symbolSize: [bandwidth, 1],
        large: true
      })),
      xAxis: {
        type: "value",
        min: 0,
        max: range[1] - range[0],
        show: false,
        boundaryGap: ["0%", "0%"],
      },
      yAxis: {
        type: "category",
        show: false,
        boundaryGap: false,
        axisLine:{
          onZero: false,
        },
        data: _.range(startIndex, endIndex).reverse()
      },
      grid: getMargin(margin)

    };
    
    data.slice(startIndex, endIndex).forEach((s, i) => {
      options.series[str2idx[s]].data.push([bandwidth / 2 + (xScale(s) || 0), i]);
    });
    // console.log(options);
    // console.log(bandwidth);

    return options;
  }
}

export default StackedFeature;
