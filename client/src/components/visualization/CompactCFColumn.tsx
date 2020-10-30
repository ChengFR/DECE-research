import * as d3 from "d3";
// import {scaleOrdinal, scaleLinear} from 'd3-scale';
import * as React from "react";
import _ from "lodash";

import { getMargin, ChartOptions, getChildOrAppend, defaultCategoricalColor } from './common';
import { shallowCompare } from "../../common/utils";
import { MarginType, DELAY_PAINT_TIME, isStringArray } from "./common";
import "./CompactCFColumn.css";
import { Recoverable } from "repl";
import { on } from "cluster";

export interface ICompactCFOptions extends ChartOptions {
  pixel: number;
  categoricalColor?: (i: number) => string;
  onHoverRow?: (rowIndex: number | null) => any;
  onClickRow?: (rowIndex: number) => any;
}

export const defaultOptions = {
  width: 100,
  height: 200,
  margin: 0,
  // categoricalColor: defaultCategoricalColor
};

export function drawCFNumerical(
  svg: SVGElement,
  data: number[],
  cfData: (number | undefined)[],
  xScale: d3.ScaleLinear<number, number>,
  options: Omit<ICompactCFOptions, keyof typeof defaultOptions> &
    Partial<Pick<ICompactCFOptions, keyof typeof defaultOptions>>
) {
  const opts = { ...defaultOptions, ...options };
  const { pixel, width, onHoverRow, onClickRow } = opts;

  const margin = getMargin(opts.margin);

  const root = d3.select(svg);

  // append the bar rectangles to the svg element
  const g = getChildOrAppend<SVGGElement, SVGElement>(root, "g", "cf-numerical").attr(
    "transform",
    `translate(${margin.left}, ${margin.top})`
  );

  const cf = g
    .selectAll("g.cf")
    .data(data)
    .join<SVGGElement>(enter => {
      const ret = enter.append("g").attr("class", "cf");
      // base
      ret.append("rect")
        .attr("class", "row-base");

      ret
        .append("path")
        .attr("class", "base")
        .style("stroke-width", 1);
      // diff
      ret
        .append("rect")
        .attr("class", "diff")
        .attr("height", pixel);
      return ret;
    })
    .attr("transform", (d, i) => `translate(0,${i * pixel})`);

  cf.select("rect.row-base")
    .attr("width", width - margin.left - margin.right)
    .attr("height", pixel)
    .on("mouseover", (d, i) => {
      onHoverRow && onHoverRow(i);
    })
    .on("mousemove", d => {
      onHoverRow && onHoverRow(null);
    })
    .on("click", (d, i) => {
        onClickRow && onClickRow(i);
    })

  cf.select("path.base").attr("d", d => `M ${xScale(d)},0 v ${pixel}`);
  cf.select("rect.diff")
    .attr("x", (d, i) => {
      const cf = cfData[i];
      return cf !== undefined ? (cf < d ? xScale(cf) : xScale(d)) : 0;
    })
    .attr("width", (d, i) => {
      const cf = cfData[i];
      return cf !== undefined ? Math.abs(xScale(cf) - xScale(d)) : 0;
    })
    .attr("class", (d, i) => `diff ${cfData[i] !== undefined ? (cfData[i]! < d ? "decrease" : "increase") : ''}`);
}

export function drawCFCategorical(
  svg: SVGElement,
  data: string[],
  cfData: (string | undefined)[],
  xScale: d3.ScaleBand<string>,
  options: Omit<ICompactCFOptions, keyof typeof defaultOptions> &
    Partial<Pick<ICompactCFOptions, keyof typeof defaultOptions>>
) {
  const opts = { ...defaultOptions, ...options };
  const { pixel, categoricalColor: color } = opts;

  const margin = getMargin(opts.margin);

  const root = d3.select(svg);

  // append the bar rectangles to the svg element
  const g = getChildOrAppend<SVGGElement, SVGElement>(root, "g", "cf-categorical").attr(
    "transform",
    `translate(${margin.left}, ${margin.top})`
  );

  const cf = g
    .selectAll("g.cf")
    .data(data)
    .join<SVGGElement>(enter => {
      const ret = enter.append("g").attr("class", "cf");
      // base
      ret
        .append("rect")
        .attr("class", "base")
        .attr("height", pixel);
      // diff
      ret
        .append("rect")
        .attr("class", "diff")
        .attr("height", pixel);
      return ret;
    })
    .attr("transform", (d, i) => `translate(0,${i * pixel})`);

  const bandwidth = xScale.bandwidth();
  const cat2idx: {[key: string]: number} = {}; 
  xScale.domain().forEach((x, i) => cat2idx[x] = i);

  cf.select("rect.base")
    .attr("x", d => xScale(d) || 0)
    .attr("width", bandwidth)
  if (color)
    cf.select("rect.base")
      .style("fill", d => color(cat2idx[d]));
    
  cf.select("rect.diff")
    .attr("x", (d, i) => cfData[i] ? (xScale(cfData[i]!) || 0) : 0)
    .attr("width", (_, i) => cfData[i] ? bandwidth : 0)
  if (color)
    cf.select("rect.diff")
    .style("fill", (d, i) => cfData[i] ? color(cat2idx[cfData[i]!]) : '#ccc');

}

export interface ICompactCFColumnProps {
  data: number[] | string[];
  cfData?: (number | undefined)[] | (string | undefined)[];
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
  onHoverRow?: (rowIndex: number | null) => any;
  onClickRow?: (rowIndex: number) => any;
  categoricalColor?: (i: number) => string;
}

export interface ICompactCFColumnState {}

export class CompactCFColumn extends React.Component<
  ICompactCFColumnProps,
  ICompactCFColumnState
> {
  static defaultProps = { ...defaultOptions };
  private svgRef: React.RefObject<SVGSVGElement> = React.createRef();
  private shouldPaint: boolean = false;
  private hoveredIndex: number | null = null;

  constructor(props: ICompactCFColumnProps) {
    super(props);

    this.state = { hoveredBin: null };
    this.paint = this.paint.bind(this);
    this.getHeight = this.getHeight.bind(this);
    // this.afterRender = this.afterRender.bind(this);
  }

  public shouldComponentUpdate(nextProps: ICompactCFColumnProps) {
    if (shallowCompare(nextProps, this.props, new Set(["onHoverRow"])))
      return false;
    return true;
  }

  public paint(svg: SVGSVGElement | null = this.svgRef.current) {
    if (svg) {
      const {
        data,
        cfData,
        startIndex,
        endIndex,
        className,
        style,
        svgStyle,
        xScale,
        ...rest
      } = this.props;
      if (isStringArray(data)) {
        drawCFCategorical(
          svg,
          data.slice(startIndex, endIndex),
          cfData ? cfData.slice(startIndex, endIndex) as (string | undefined)[] : [],
          xScale as d3.ScaleBand<string>,
          rest
        );
      } else {
        drawCFNumerical(
          svg, 
          data.slice(startIndex, endIndex),
          cfData ? cfData.slice(startIndex, endIndex) as (number | undefined)[] : [],
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
    // this.afterRender();
  }

  public componentDidUpdate(
    prevProps: ICompactCFColumnProps,
    prevState: ICompactCFColumnState
  ) {
    const excludedProperties = new Set(["style", "svgStyle", "className"]);
    if (!shallowCompare(this.props, prevProps, excludedProperties)) {
      this.shouldPaint = true;
      const delayedPaint = () => {
        if (this.shouldPaint) this.paint();
      };
      window.setTimeout(delayedPaint, DELAY_PAINT_TIME);
    }
    // this.afterRender();
    // }
  }

  onEvents = {
    updateAxisPointer: (e: any) => {
      const {onHoverRow, startIndex} = this.props;
      let index: number | null = typeof e.dataIndex === 'number' ? (e.dataIndex + startIndex) : null
      // console.debug("hover", e, index);
      if (index !== this.hoveredIndex) {
        onHoverRow && onHoverRow(index);
        this.hoveredIndex = index;
      }
    },
    click: (e: any) => {
      const {onClickRow, startIndex} = this.props;
      let index: number | null = (e.data as (undefined | [number, number])) ? (e.data[1] + startIndex) : null;
      console.debug("click", e);
      onClickRow && index !== null && onClickRow(index);
    },
    contextmenu: (e: any) => {
      console.debug("rightclick", e);
    }
  };

  public render() {
    const { style, className, width } = this.props;
    return (
      <svg
        className={
          className ? `${className} compact-cf` : "compact-cf"
        }
        style={style}
        ref={this.svgRef}
        width={width}
        height={this.getHeight()}
      />
    );
  }
}

export default CompactCFColumn;
