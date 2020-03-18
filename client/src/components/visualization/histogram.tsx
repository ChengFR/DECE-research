import * as d3 from "d3";
import * as _ from "lodash";
// import {scaleOrdinal, scaleLinear} from 'd3-scale';
import * as React from "react";
import {
  getMargin,
  CSSPropertiesFn,
  ChartOptions,
  getChildOrAppend,
  getScaleLinear
} from "./common";
import { shallowCompare, WithDefault, number2string } from '../../common/utils';
import memoizeOne from "memoize-one";
import { isArray } from "util";
import { defaultCategoricalColor } from './common';
import "./histogram.scss";

function isArrays<T>(a:T[] | T[][]): a is T[][] {
  return a.length > 0 && isArray(a[0]);
}

export interface IHistogramOptions extends ChartOptions {
  innerPadding: number;
  drawAxis: boolean,
  rectStyle?: CSSPropertiesFn<SVGRectElement, d3.Bin<number, number>>;
  onRectMouseOver?: d3.ValueFn<any, d3.Bin<number, number>, void>;
  // onRectMouseMove?: d3.ValueFn<any, d3.Bin<number, number>, void>;
  onRectMouseLeave?: d3.ValueFn<any, d3.Bin<number, number>, void>;
  onSelectRange?: (range?: [number, number]) => any;
  xScale?: d3.ScaleLinear<number, number>;
  selectedRange?: [number, number];
  nBinsMin?: number,
  nBinsMax?: number,
  barWidthMin?: number,
  barWidthMax?: number
}

export const defaultOptions = {
  width: 300,
  height: 200,
  margin: 0,
  innerPadding: 1,
  drawAxis: false,
};

function getNBinsRange(width: number, minWidth: number = 7, maxWidth: number = 9): [number, number] {
  return [Math.ceil(width / maxWidth), Math.floor(width / minWidth)];
}

export function drawHistogram(
  svg: SVGElement,
  data: ArrayLike<number>,
  allData?: ArrayLike<number>,
  options?: Partial<IHistogramOptions>
) {
  const opts: Partial<IHistogramOptions> & Pick<IHistogramOptions, keyof typeof defaultOptions> = { ...defaultOptions, ...options };
  const {
    width,
    height,
    rectStyle,
    innerPadding,
    onRectMouseOver,
    // onRectMouseMove,
    onRectMouseLeave,
    onSelectRange,
    xScale,
    drawAxis,
    selectedRange,
    nBinsMin,
    nBinsMax,
    barWidthMin,
    barWidthMax
  } = opts;

  const margin = getMargin(opts.margin);

  const xRange = [0, width - margin.right - margin.left] as [number, number];
  const yRange = [height - margin.top - margin.bottom, 0];
  // console.debug("Rendering histogram", xRange, yRange);

  const x = xScale ? xScale : getScaleLinear(allData || data, ...xRange);

  const root = d3.select(svg);

  // set the parameters for the 

  const _nBins = d3.thresholdSturges(allData || data);
  const _nBinsMin = nBinsMin ? nBinsMin : _nBins;
  const _nBinsMax = nBinsMax ? nBinsMax : _nBins;
  const nBins = Math.min(Math.max(_nBins, _nBinsMin), _nBinsMax);
  const [min, max] = getNBinsRange(width, barWidthMin, barWidthMax);
  const ticks = x.ticks(Math.min(Math.max(min, nBins), max));
  // const ticks = x.ticks(nBins)

  const histogram = d3
    .histogram()
    .domain(x.domain() as [number, number])
    .thresholds(ticks);

  const bins = histogram(data);
  const allBins = allData && histogram(allData);

  // Y axis: scale and draw:
  const y = d3.scaleLinear().range(yRange);

  y.domain([
    0,
    d3.max(allBins || bins, function (d) {
      return d.length;
    }) as number
  ]); // d3.hist has to be called before the Y axis obviously

  let rangeBrushing: [number, number] | null = null;
  if (selectedRange) {
    const startIndex = bins.findIndex(
      ({ x1 }) => x1 !== undefined && selectedRange[0] < x1
    );
    const endIndex = _.findLastIndex(
      bins,
      ({ x0 }) => x0 !== undefined && x0 < selectedRange[1]
    );
    rangeBrushing = [startIndex, endIndex];
  }
  // console.debug("brushed Range", rangeBrushing);
  let brushing: boolean = false;

  const gBase = getChildOrAppend<SVGGElement, SVGElement>(root, "g", "base")
    .attr(
      "transform",
      `translate(${margin.left}, ${margin.top})`
    ).attr("fill", "rgb(109, 160, 202)");

  if (drawAxis) {
    const axisBase = getChildOrAppend<SVGGElement, SVGElement>(root, "g", "axis-base")
      .attr(
        "transform",
        `translate(${margin.left}, ${height - margin.bottom})`
      );
      axisBase.call(d3.axisBottom(x))
  }

  gBase
    .selectAll("rect.bar")
    .data(allBins || [])
    .join<SVGRectElement>(enter => {
      return enter
        .append("rect")
        .attr("x", innerPadding)
        .attr("class", "bar");
    })
    .attr("transform", d => `translate(${x(d.x0 as number)}, ${y(d.length)})`)
    .attr("width", d => {
      return Math.max(0, x(d.x1 as number) - x(d.x0 as number) - 1);
    })
    .attr("height", d => {
      return yRange[0] - y(d.length) + 0.01;
    });

  // append the bar rectangles to the svg element
  const g = getChildOrAppend<SVGGElement, SVGElement>(root, "g", "current").attr(
    "transform",
    `translate(${margin.left}, ${margin.top})`
  ).attr("fill", "rgb(109, 160, 202)");
  const merged = g
    .selectAll("rect.bar")
    .data(bins)
    .join<SVGRectElement>(enter => {
      return enter
        .append("rect")
        .attr("x", innerPadding)
        .attr("class", "bar");
    })
    .attr("transform", d => `translate(${x(d.x0 as number)}, ${y(d.length)})`)
    .attr("width", d => {
      return Math.max(0, x(d.x1 as number) - x(d.x0 as number) - 1);
    })
    .attr("height", d => {
      return yRange[0] - y(d.length) + 0.01;
    });

  const g2 = getChildOrAppend<SVGGElement, SVGElement>(
    root,
    "g",
    "shades"
  ).attr("transform", `translate(${margin.left}, ${margin.top})`);

  const renderShades = () => {
    return g2
      .selectAll("rect.shade")
      .data(bins)
      .join<SVGRectElement>(enter => {
        return enter
          .append("rect")
          .attr("class", "shade")
          .attr("y", yRange[1]);
      })
      .attr("x", d => x(d.x0 as number))
      .attr("width", d => {
        // console.debug("update width to", x(d.x1 as number) - x(d.x0 as number) - 1);
        return Math.max(0, x(d.x1 as number) - x(d.x0 as number));
      })
      .attr("height", yRange[0])
      .classed("show", (d, idx) =>
        rangeBrushing
          ? Math.min(...rangeBrushing) <= idx &&
            idx <= Math.max(...rangeBrushing)
          : false
      );
  };

  const merged2 = renderShades();

  merged2
    .on("mouseover", function (data, idx, groups) {
      onRectMouseOver && onRectMouseOver(data, idx, groups);
      if (brushing && rangeBrushing) {
        rangeBrushing[1] = idx;
        renderShades();
      }
    })
    // .on("mousemove", (onRectMouseMove || null) as null)
    .on("mouseleave", (onRectMouseLeave || null) as null);

  merged2
    .on("mousedown", function (data, idx) {
      brushing = true;
      if (rangeBrushing === null) rangeBrushing = [idx, idx];
      else rangeBrushing = null;
    })
    .on("mouseup", function (data, idx) {
      if (rangeBrushing) {
        rangeBrushing[1] = idx;
        // console.debug("select range:", rangeBrushing);
        const b1 = bins[Math.min(...rangeBrushing)],
          b2 = bins[Math.max(...rangeBrushing)];
        onSelectRange && onSelectRange([b1.x0 as number, b2.x1 as number]);
      } else {
        onSelectRange && onSelectRange();
      }
      renderShades();
      brushing = false;
    });

  if (rectStyle) {
    Object.keys(rectStyle).forEach(key => {
      merged.style(
        key,
        (rectStyle[key as keyof typeof rectStyle] || null) as null
      );
    });
  }
}

export type IHistogramProps = (IHistogramOptions | IGHistogramOptions) & {
  data: number[] | number[][];
  allData?: number[] | number[][];
  style?: React.CSSProperties;
  svgStyle?: React.CSSProperties;
  className?: string;
  extent?: [number, number];
  drawRange?: boolean;
  onHoverRange?: (range?: [number, number]) => any;
}

const defaultProps = {
  ...defaultOptions,
  drawAxis: false,
  drawRange: false
}

export interface IHistogramState {
  hoveredBin: [number, number] | null;
}

export class Histogram extends React.PureComponent<
  IHistogramProps,
  IHistogramState
  > {
  static defaultProps = { ...defaultProps };
  private svgRef: React.RefObject<SVGSVGElement> = React.createRef();
  private shouldPaint: boolean = false;

  constructor(props: IHistogramProps) {
    super(props);

    this.state = { hoveredBin: null };
    this.paint = this.paint.bind(this);
    this.onMouseOverBin = this.onMouseOverBin.bind(this);
    this.onMouseOverBins = this.onMouseOverBins.bind(this);
    this.onMouseLeaveBin = this.onMouseLeaveBin.bind(this);
    this.onMouseLeaveBins = this.onMouseLeaveBins.bind(this);
  }

  public paint(svg: SVGSVGElement | null = this.svgRef.current) {
    if (svg) {
      console.debug("paint histogram");
      const { data, allData, className, style, svgStyle, height, drawRange, ...rest } = this.props;
      const xScale = rest.xScale || this.getXScale();
      const chartHeight = drawRange ? (height - 24) : (height - 4);
      if (isArrays(data)) {
        if (allData && !isArrays(allData)) throw "Mismatched array form between data and allData";
        drawGroupedHistogram(svg, data, allData, {
          height: chartHeight,
          ...rest,
          xScale,
          onRectMouseOver: this.onMouseOverBins,
          onRectMouseLeave: this.onMouseLeaveBins,
          innerPadding: 0,
        });
      } else {
        if (allData && isArrays(allData)) throw "Mismatched array form between data and allData";
        drawHistogram(svg, data, allData, {
          height: chartHeight,
          ...rest,
          xScale,
          onRectMouseOver: this.onMouseOverBin,
          onRectMouseLeave: this.onMouseLeaveBin
        });
      }
      
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
    const excludedProperties = new Set(["style", "svgStyle", "className"]);
    if (!shallowCompare(this.props, prevProps, excludedProperties, true)) {
      this.shouldPaint = true;
      const delayedPaint = () => {
        if (this.shouldPaint) this.paint();
      };
      window.setTimeout(delayedPaint, 100);
    }

    // }
  }

  // public shouldRePaint(prevProps: IHistogramProps, prevState: IHistogramState) {
  //   const excludedProperties = new Set(["style", "svgStyle", "className"]);
  //   !shallowCompare(this.props, prevProps, excludedProperties);
  // }

  memoizedXScaler = memoizeOne(getScaleLinear);

  getXScale = () => {
    const { data, width } = this.props;
    const margin = getMargin(this.props.margin);
    return this.memoizedXScaler(isArrays(data) ? _.flatten(data) : data, 0, width - margin.left - margin.right);
  };

  public render() {
    const { style, svgStyle, className, width, height, drawAxis, drawRange, extent } = this.props;
    const { hoveredBin } = this.state;
    return (
      <div className={(className || "") + " histogram"} style={style}>
        <svg
          ref={this.svgRef}
          style={{ marginTop: 4, ...svgStyle }}
          width={width}
          height={drawRange ? (height - 24) : (height - 4)}
        />
        {drawRange && <div className="info">
          {hoveredBin
            ? `${hoveredBin[0]} - ${hoveredBin[1]}`
            : (extent && `${number2string(extent[0],3)} - ${number2string(extent[1],3)}`)
          }
        </div>}

      </div>
    );
  }

  onMouseOverBin: d3.ValueFn<any, d3.Bin<number, number>, void> = (
    data,
    index,
    groups
  ) => {
    const { x0, x1 } = data;
    const hoveredBin: [number, number] = [
      x0 === undefined ? -Infinity : x0,
      x1 === undefined ? Infinity : x1
    ];
    const {onHoverRange} = this.props;
    onHoverRange && onHoverRange(hoveredBin);
    this.setState({hoveredBin});
  };

  onMouseOverBins: d3.ValueFn<any, d3.Bin<number, number>[], void> = (
    data,
    index
  ) => {
    // console.log(data);
    const { x0, x1 } = data[0];
    const hoveredBin: [number, number] = [
      x0 === undefined ? -Infinity : x0,
      x1 === undefined ? Infinity : x1
    ];
    const {onHoverRange} = this.props;
    onHoverRange && onHoverRange(hoveredBin);
    this.setState({hoveredBin});
  };

  onMouseLeaveBin: d3.ValueFn<any, d3.Bin<number, number>, void> = (
    data,
    index
  ) => {
    this.props.onHoverRange && this.props.onHoverRange();
    this.setState({ hoveredBin: null });
  };

  onMouseLeaveBins: d3.ValueFn<any, d3.Bin<number, number>[], void> = (
    data,
    index
  ) => {
    this.props.onHoverRange && this.props.onHoverRange();
    this.setState({ hoveredBin: null });
  };
}

export type IGHistogramOptions = Omit<IHistogramOptions, "onRectMouseOver" | "onRectMouseMove" | "onRectMouseLeave"> & {
  onRectMouseOver?: d3.ValueFn<any, d3.Bin<number, number>[], void>;
  // onRectMouseMove: d3.ValueFn<any, d3.Bin<number, number>[], void>;
  onRectMouseLeave?: d3.ValueFn<any, d3.Bin<number, number>[], void>;
  color?: (x: number) => string;
}

export function drawGroupedHistogram(
  svg: SVGElement,
  data: number[][],
  allData?: number[][],
  options?: Partial<IGHistogramOptions>
) {
  const opts: Partial<IGHistogramOptions> & Pick<IGHistogramOptions, keyof typeof defaultOptions> = { ...defaultOptions, ...options };
  const {
    width,
    height,
    rectStyle,
    innerPadding,
    onRectMouseOver,
    // onRectMouseMove,
    onRectMouseLeave,
    onSelectRange,
    xScale,
    selectedRange
  } = opts;

  const nGroups = data.length;
  if (nGroups == 0) throw "data length equals to 0";
  const binPad = 1;

  const margin = getMargin(opts.margin);
  const color = opts.color || defaultCategoricalColor;

  const xRange = [0, width - margin.right - margin.left] as [number, number];
  const yRange = [height - margin.top - margin.bottom, 0];
  const flatX = (allData && _.flatten(allData)) || _.flatten(data);

  const x = xScale || getScaleLinear(flatX, ...xRange);

  const root = d3.select(svg);

  // set the parameters for the
  const nBins = d3.thresholdSturges(flatX);
  const [min, max] = getNBinsRange(width, 9, 12);
  const ticks = x.ticks(Math.min(Math.max(min, nBins), max));
  if (ticks[ticks.length - 1] === x.domain()[1]) ticks.splice(ticks.length - 1, 1);

  const histogram = d3
    .histogram()
    .domain(x.domain() as [number, number])
    .thresholds(ticks);

  const bins = data.map(d => histogram(d));
  const allBins = allData && allData.map(d => histogram(d));

  const xs = bins[0].map(bin => x(bin.x0 as number));
  const step = xs[1] - xs[0];
  const innerStep = (step - binPad + innerPadding) / nGroups;
  const bandwidth = innerStep - innerPadding;
  xs.push(x(bins[0][bins[0].length - 1].x1 as number));

  const yMax = d3.max(allBins || bins, function(bs) {
    return d3.max(bs, d => d.length);
  });
  if (yMax === undefined) throw "Invalid bins";
  const y = d3.scaleLinear().range(yRange).domain([0, yMax]);

  let rangeBrushing: [number, number] | null = null;
  if (selectedRange) {
    const startIndex = bins[0].findIndex(
      ({ x1 }) => x1 !== undefined && selectedRange[0] < x1
    );
    const endIndex = _.findLastIndex(
      bins[0],
      ({ x0 }) => x0 !== undefined && x0 < selectedRange[1]
    );
    rangeBrushing = [startIndex, endIndex];
  }
  // console.debug("brushed Range", rangeBrushing);
  let brushing: boolean = false;

  // Render the base histogram (with all data)
  const base = getChildOrAppend<SVGGElement, SVGElement>(
    root,
    "g",
    "base"
  ).attr("transform", `translate(${margin.left}, ${margin.top})`);

  const baseGs = base.selectAll<SVGGElement, d3.Bin<number, number>[]>("g.groups")
    .data(allBins || [])
    .join<SVGGElement>(enter => {
      return enter
        .append("g")
        .attr("class", "groups");
    })
    .attr("transform", (_, i) => `translate(${innerStep * i + binPad / 2},0)`)
    .attr("fill", (d, i) => color(i));

  baseGs
    .selectAll<SVGRectElement, d3.Bin<number, number>>("rect.bar")
    .data(d => d)
    .join<SVGRectElement>(enter => {
      return enter
        .append("rect")
        .attr("class", "bar");
    })
    .attr("transform", (d, i) => `translate(${xs[i]}, ${y(d.length)})`)
    .attr("width", bandwidth)
    .attr("height", d => {
      return yRange[0] - y(d.length);
    });

  // Render the current histogram (with filtered data)

  const current = getChildOrAppend<SVGGElement, SVGElement>(root, "g", "current").attr(
    "transform",
    `translate(${margin.left}, ${margin.top})`
  );
  const gs = current.selectAll<SVGGElement, d3.Bin<number, number>[]>("g.groups")
    .data(bins)
    .join<SVGGElement>(enter => {
      return enter
        .append("g")
        .attr("class", "groups");
    })
    .attr("transform", (_, i) => `translate(${innerStep * i + binPad / 2},0)`)
    .attr("fill", (d, i) => color(i));

  const merged = gs
    .selectAll("rect.bar")
    .data(d => d)
    .join<SVGRectElement>(enter => {
      return enter
        .append("rect")
        .attr("class", "bar");
    })
    .attr("transform", (d, i) => `translate(${xs[i]}, ${y(d.length)})`)
    .attr("width", bandwidth)
    .attr("height", d => {
      return yRange[0] - y(d.length);
    });

  // Render the shades for highlighting selected regions
  const gShades = getChildOrAppend<SVGGElement, SVGElement>(
    root,
    "g",
    "shades"
  ).attr("transform", `translate(${margin.left}, ${margin.top})`);

  const renderShades = () => {
    return gShades
      .selectAll("rect.shade")
      .data(bins[0])
      .join<SVGRectElement>(enter => {
        return enter
          .append("rect")
          .attr("class", "shade")
          .attr("y", yRange[1]);
      })
      .attr("x", (d, i) => xs[i])
      .attr("width", step)
      .attr("height", yRange[0])
      .classed("show", (d, idx) =>
        rangeBrushing
          ? Math.min(...rangeBrushing) <= idx &&
            idx <= Math.max(...rangeBrushing)
          : false
      );
  };

  const merged2 = renderShades();

  merged2
    .on("mouseover", function(data, idx, groups) {
      // console.log(bins, idx);
      onRectMouseOver && onRectMouseOver(bins.map(bs => bs[idx]), idx, groups);
      if (brushing && rangeBrushing) {
        rangeBrushing[1] = idx;
        renderShades();
      }
    })
    // .on("mousemove", (onRectMouseMove || null) as null)
    .on("mouseleave", (onRectMouseLeave || null) as null);

  merged2
    .on("mousedown", function(data, idx) {
      brushing = true;
      if (rangeBrushing === null) rangeBrushing = [idx, idx];
      else rangeBrushing = null;
    })
    .on("mouseup", function(data, idx) {
      if (rangeBrushing) {
        rangeBrushing[1] = idx;
        console.debug("select range:", rangeBrushing);
        const x0 = bins[0][Math.min(...rangeBrushing)].x0,
          x1 = bins[0][Math.max(...rangeBrushing)].x1;
        onSelectRange && onSelectRange([x0 as number, x1 as number]);
      } else {
        onSelectRange && onSelectRange();
      }
      renderShades();
      brushing = false;
    });

  if (rectStyle) {
    Object.keys(rectStyle).forEach(key => {
      merged.style(
        key,
        (rectStyle[key as keyof typeof rectStyle] || null) as null
      );
    });
  }
}

export default Histogram;
