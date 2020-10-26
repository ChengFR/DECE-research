import * as d3 from "d3";
import * as _ from "lodash";
// import {scaleOrdinal, scaleLinear} from 'd3-scale';
import * as React from "react";
import {
  getMargin,
  CSSPropertiesFn,
  ChartOptions,
  getChildOrAppend,
  getScaleLinear,
  MarginType,
  IMargin
} from "./common";
import { shallowCompare, WithDefault, number2string } from '../../common/utils';
import { transMax, argMin } from '../../common/math'
import memoizeOne from "memoize-one";
import { isArray } from "util";
import { defaultCategoricalColor } from './common';
import "./histogram.scss";

function isArrays<T>(a: T[] | T[][]): a is T[][] {
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
  yScale?: d3.ScaleLinear<number, number>;
  ticks?: number[];
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

export function getNBinsRange(width: number, minWidth: number = 7, maxWidth: number = 9): [number, number] {
  return [Math.ceil(width / maxWidth), Math.floor(width / minWidth)];
}
// deprecated
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
    yScale,
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

  const x = xScale ? xScale : getScaleLinear(xRange[0], xRange[1], allData || data);

  const root = d3.select(svg);

  const _nBins = d3.thresholdSturges(allData || data);
  const _nBinsMin = nBinsMin ? nBinsMin : _nBins;
  const _nBinsMax = nBinsMax ? nBinsMax : _nBins;
  const nBins = Math.min(Math.max(_nBins, _nBinsMin), _nBinsMax);
  const [min, max] = getNBinsRange(width, barWidthMin, barWidthMax);
  const ticks = opts.ticks ? opts.ticks : x.ticks(Math.min(Math.max(min, nBins), max));

  const histogram = d3
    .histogram()
    .domain(x.domain() as [number, number])
    .thresholds(ticks);

  const bins = histogram(data);
  const allBins = allData && histogram(allData);

  // Y axis: scale and draw:
  const y = yScale ? yScale : d3.scaleLinear().range(yRange);

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
  dmcData?: number[] | number[][];
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

    this.onHoverRange = this.onHoverRange.bind(this);
  }

  public paint(svg: SVGSVGElement | null = this.svgRef.current) {
    if (svg) {
      console.debug("paint histogram");
      const { data, allData, dmcData, className, style, svgStyle, height, drawRange, ...rest } = this.props;
      const xScale = rest.xScale || this.getXScale();
      const chartHeight = drawRange ? (height - 24) : (height - 4);
      drawGroupedHistogram({root: svg, data, allData, dmcData, options: {
        height: chartHeight,
        ...rest,
        xScale,
        onRectMouseOver: this.onMouseOverBins,
        onRectMouseLeave: this.onMouseLeaveBins,
        onHoverRange: this.onHoverRange,
        innerPadding: 0,
      }});

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
    // const excludedState = new Set(["hoveredBin"]);
    if (!shallowCompare(this.props, prevProps, excludedProperties, true)) {
      this.shouldPaint = true;
      const delayedPaint = () => {
        if (this.shouldPaint) this.paint();
      };
      window.setTimeout(delayedPaint, 100);
    }
  }

  memoizedXScaler = memoizeOne(getScaleLinear);

  getXScale = () => {
    const { data, width } = this.props;
    const margin = getMargin(this.props.margin);
    return this.memoizedXScaler(0, width - margin.left - margin.right, isArrays(data) ? _.flatten(data) : data);
  };

  public render() {
    const { style, svgStyle, className, width, height, drawAxis, drawRange, extent } = this.props;
    const { hoveredBin } = this.state;
    return (
      <div className={(className || "") + " histogram"} style={style}>
        <svg
          ref={this.svgRef}
          style={{ ...svgStyle }}
          width={width}
          height={drawRange ? (height - 20) : height}
        />
        {drawRange && <div className="info">
          {hoveredBin
            ? `${number2string(hoveredBin[0])} - ${number2string(hoveredBin[1])}`
            : (extent && `${number2string(extent[0], 3)} - ${number2string(extent[1], 3)}`)
          }
        </div>}

      </div>
    );
  }

  onHoverRange (range: [number, number]) {
    const { onHoverRange } = this.props;
    onHoverRange && onHoverRange(range);
    // this.setState({hoveredBin: range});
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
    const { onHoverRange } = this.props;
    onHoverRange && onHoverRange(hoveredBin);
    this.setState({ hoveredBin });
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
    const { onHoverRange } = this.props;
    onHoverRange && onHoverRange(hoveredBin);
    this.setState({ hoveredBin });
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
  key: string,
  onRectMouseOver?: d3.ValueFn<any, d3.Bin<number, number>[], void>;
  // onRectMouseMove: d3.ValueFn<any, d3.Bin<number, number>[], void>;
  onRectMouseLeave?: d3.ValueFn<any, d3.Bin<number, number>[], void>;
  onHoverRange: (range: [number, number]) => void;
  color?: (x: number) => string;
  mode?: "side-by-side" | "stacked",
  rangeSelector?: "bin-wise" | "as-a-whole" | "none",
  direction?: "up" | "down",
  snapping?: boolean,
  drawBand?: boolean,
  bandValueFn?: (x: number) => number,
  // bandColor?: 
  twisty?: number,
}

export function drawGroupedHistogram(param: {
  root: SVGElement | SVGGElement,
  data: number[] | number[][],
  allData?: number[] | number[][],
  dmcData?: number[] | number[][],
  options?: Partial<IGHistogramOptions>}
) {
  const {root, data, allData, dmcData, options} = param;
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
    onHoverRange,
    xScale,
    yScale,
    ticks,
    selectedRange,
    rangeSelector,
    direction,
    drawAxis,
    drawBand,
    bandValueFn,
    key,
    snapping,
    twisty
  } = opts;
  const mode = opts.mode ? opts.mode : "side-by-side";
  const nGroups = data.length;
  if (nGroups == 0) throw "data length equals to 0";
  const binPad = 1;

  const margin = getMargin(opts.margin);
  const color = opts.color || defaultCategoricalColor;

  const layout = new HistogramLayout({
    data: data,
    mode: mode,
    width: width,
    height: height,
    margin: margin,
    dmcData: dmcData || allData || data,
    xScale: xScale,
    yScale: yScale,
    ticks: ticks,
    innerPadding: innerPadding,
    direction:direction
  });

  const bins = layout.layout;

  const allDataLayout = allData ? new HistogramLayout({
    data: allData,
    mode: mode,
    width: width,
    height: height,
    margin: margin,
    dmcData: dmcData || allData,
    xScale: xScale,
    yScale: yScale,
    ticks: ticks,
    innerPadding: innerPadding,
    direction:direction
  }) : undefined;

  const allBins = allDataLayout && allDataLayout.layout;
  const xRange = layout.xRange;
  const yRange = layout.yRange;

  console.debug(bins[0].map(bin => ({ width: bin.width, height: bin.height, x: bin.x, y: bin.y })));

  const _root = d3.select(root);

  // Render the base histogram (with all data)
  const base = getChildOrAppend<SVGGElement, SVGElement>(
    _root,
    "g",
    "base"
  ).attr(
    "transform",
    `translate(${margin.left}, ${margin.top})`
  )

  const baseGs = base.selectAll<SVGGElement, BarLayout[]>("g.groups")
    .data(allBins || [])
    .join<SVGGElement>(enter => {
      return enter
        .append("g")
        .attr("class", "groups");
    })
    .attr("fill", (d, i) => color(i));

  baseGs
    .selectAll<SVGRectElement, BarLayout>("rect.bar")
    .data(d => d)
    .join<SVGRectElement>(enter => {
      return enter
        .append("rect")
        .attr("class", "bar");
    })
    .attr("transform", (d, i) => `translate(${d.x}, ${d.y})`)
    .attr("width", d => d.width)
    .attr("height", d => d.height);

  // Render the current histogram (with filtered data)

  const current = getChildOrAppend<SVGGElement, SVGElement>(_root, "g", "current")
    .attr(
      "transform",
      `translate(${margin.left}, ${margin.top})`
    )

  const gs = current.selectAll<SVGGElement, BarLayout[]>("g.groups")
    .data(bins)
    .join<SVGGElement>(enter => {
      return enter
        .append("g")
        .attr("class", "groups");
    })
    .attr("fill", (d, i) => color(i));

  const merged = gs
    .selectAll("rect.bar")
    .data(d => d)
    .join<SVGRectElement>(enter => {
      return enter
        .append("rect")
        .attr("class", "bar");
    })
    .attr("transform", (d, i) => `translate(${d.x}, ${d.y})`)
    .attr("width", d => d.width)
    .attr("height", d => d.height)
    .append("title")
      .text(d => d.length);

  const yreverse = d3.scaleLinear().domain(layout.y.domain()).range([layout.y.range()[1], layout.y.range()[0]])
  if (drawAxis) {
    base.call(d3.axisLeft(yreverse).ticks(2));
  }

  // Render the shades for highlighting selected regions
  if (rangeSelector === 'bin-wise') {
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

    const gShades = getChildOrAppend<SVGGElement, SVGElement>(
      _root,
      "g",
      "shades"
    ).attr(
      "transform",
      `translate(${margin.left}, ${margin.top})`
    )

    const renderShades = () => {
      return gShades
        .selectAll("rect.shade")
        .data(bins[0])
        .join<SVGRectElement>(enter => {
          return enter
            .append("rect")
            .attr("class", "shade")
            .attr("y", yRange[0]);
        })
        .attr("x", (d, i) => d.x)
        .attr("width", d => layout.x(d.x1 as number) - layout.x(d.x0 as number))
        .attr("height", yRange[1])
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
        onRectMouseOver && onRectMouseOver(bins.map(bs => bs[idx]), idx, groups);
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
        console.debug("brushing start", rangeBrushing);
      })
      .on("mouseup", function (data, idx) {
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
        console.debug("brushing end");
      });
  }
  else if (rangeSelector === 'as-a-whole') {
    const selectorBase = getChildOrAppend<SVGGElement, SVGElement>(_root, "g", "selector-base")
      .attr(
        "transform",
        `translate(${margin.left}, ${margin.top})`
      );

    const selectorSheet = getChildOrAppend<SVGRectElement, SVGGElement>(selectorBase, "rect", "selector-sheet")
      .attr("x", xRange[0])
      .attr("y", xRange[0])
      .attr("width", xRange[1] - xRange[0])
      .attr("height", yRange[1] - yRange[0])

    let _selectedRange: [number, number] = selectedRange ? [layout.x(selectedRange[0]), layout.x(selectedRange[1])]: [0, 0];
    let handling: 'left' | 'right' = 'left';

    const updateSelectorBox = (range: [number, number]) => {

      return getChildOrAppend(selectorBase, "rect", "selector")
      .attr("x", Math.min(range[1], range[0]))
      .attr("y", yRange[0])
      .attr("width", Math.abs(range[1] - range[0]))
      .attr("height", yRange[1] - yRange[0])
      .style("fill", d3.interpolateReds(twisty?twisty:0))
      // .on("click", () => updateSelectorBox([0, 0])); 
    }

    updateSelectorBox(_selectedRange);

    const selector = d3.drag<SVGRectElement, any>()
      .on("start", (d, i, n) => {
        let [x, y] = d3.mouse(n[i]);
        x = Math.max(xRange[0], Math.min(x, xRange[1]));
        if (Math.abs(_selectedRange[0] - x) < Math.abs(_selectedRange[1] - x)){
          _selectedRange = [x, _selectedRange[1]]
          handling = 'left';
        }
        else {
          _selectedRange = [_selectedRange[0], x]
          handling = 'right'
        }
        updateSelectorBox(_selectedRange);
      })
      .on("drag", (d, i, n) => {
        let [x, y] = d3.mouse(n[i]);
        x = Math.max(xRange[0], Math.min(x, xRange[1]));
        if (handling === 'left')
          _selectedRange = [x, _selectedRange[1]]
        else {
          _selectedRange = [_selectedRange[0], x]
        }
        updateSelectorBox(_selectedRange);
        onHoverRange && onHoverRange([layout.x.invert(_selectedRange[0]), layout.x.invert(_selectedRange[1])]);
      })
      .on("end", (d, i, n) => {
        let [x, y] = d3.mouse(n[i]);
        if (snapping) {
          const dist = layout.ticks.map(d => Math.abs(layout.x(d) - x));
          x = layout.x(layout.ticks[argMin(dist)]);
        }
        x = Math.max(xRange[0], Math.min(x, xRange[1]));
        if (handling === 'left')
          _selectedRange = [x, _selectedRange[1]]
        else {
          _selectedRange = [_selectedRange[0], x]
        }
        updateSelectorBox(_selectedRange);
        onSelectRange && onSelectRange([layout.x.invert(_selectedRange[0]), layout.x.invert(_selectedRange[1])]);
        
      });

    selectorSheet.call(selector)
  }

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

interface HistogramLayoutProps extends ChartOptions {
  data: number[] | number[][],
  mode: 'side-by-side' | 'stacked',
  dmcData?: number[] | number[][],
  innerPadding?: number,
  groupInnerPadding?: number,
  xScale?: d3.ScaleLinear<number, number>,
  yScale?: d3.ScaleLinear<number, number>,
  ticks?: number[],
  direction?: 'up' | 'down',
}

interface BarLayout extends d3.Bin<number, number> {
  x: number,
  y: number,
  width: number,
  height: number,
}

export class HistogramLayout {
  private _data: number[][];
  private _dmcData: number[][];
  private _mode: 'side-by-side' | 'stacked';
  private _width: number;
  private _height: number;
  private _margin: IMargin;
  private _innerPadding: number;
  private _groupInnerPadding: number;
  private _xScale: d3.ScaleLinear<number, number>;
  private _yScale: d3.ScaleLinear<number, number>;
  private _ticks: number[];
  private _direction: 'up' | 'down';

  constructor(props: HistogramLayoutProps) {
    const { data, dmcData, mode, width, height, innerPadding, groupInnerPadding, xScale, margin, yScale, ticks, direction } = props;
    this._data = isArrays(data) ? data : [data];
    this._dmcData = dmcData ? (isArrays(dmcData) ? dmcData : [dmcData]) : this._data;
    this._mode = mode;
    // this._mode = 'side-by-side';
    this._width = width;
    this._height = height;
    this._margin = getMargin(margin);
    this._direction = direction?direction:'up';
    this._innerPadding = innerPadding ? innerPadding : 1;
    this._groupInnerPadding = groupInnerPadding ? groupInnerPadding : (this._data.length === 1 ? 0 : 0);

    this._xScale = this.getXScale(xScale);
    const [min, max] = mode === 'side-by-side'? getNBinsRange(width, 10, 16): getNBinsRange(width, 7, 9);
    const tickNum = Math.min(max, Math.max(min, d3.thresholdSturges(_.flatten(this._dmcData))))
    this._ticks = ticks ? ticks : this.x.ticks(tickNum);
    this._yScale = this.getYScales(yScale);
  }

  private getXScale(xScale?: d3.ScaleLinear<number, number>): d3.ScaleLinear<number, number> {
    return xScale ? xScale : getScaleLinear(this.xRange[0], this.xRange[1], _.flatten(this._dmcData));
    // return getScaleLinear(_.flatten(this._dmcData), ...this.xRange);
  }

  private getYScales(xScale?: d3.ScaleLinear<number, number>, yScale?: d3.ScaleLinear<number, number>):
    d3.ScaleLinear<number, number> {
    const histogram = d3
      .histogram()
      .domain(this.x.domain() as [number, number])
      .thresholds(this._ticks);

    const dmcBins = this._dmcData.map(d => histogram(d));
    // const dmcBins = this.gBins;
    const yMax = this._mode === 'side-by-side' ? d3.max(dmcBins, function (bs) {
      return d3.max(bs, d => d.length);
    }) : d3.max(transMax(dmcBins), function (bs) {
      return d3.sum(bs, d => d.length);
    });
    if (yMax === undefined) throw "Invalid bins";
    const _yScale = yScale ? yScale : d3.scaleLinear().range(this.yRange).domain([0, yMax]);
    return _yScale;
  }

  public get xRange(): [number, number] {
    // return [this._margin.left, this._width - this._margin.right];
    return [0, this._width - this._margin.left - this._margin.right]
  }

  public get yRange(): [number, number] {
    // return [this._margin.top, this._height - this._margin.bottom];
    return [0, this._height - this._margin.bottom - this._margin.top];
  }

  public get x(): d3.ScaleLinear<number, number> {
    return this._xScale;
  }

  public get y(): d3.ScaleLinear<number, number> {
    return this._yScale;
  }

  public get gBins(): d3.Bin<number, number>[][] {
    const histogram = d3
      .histogram()
      .domain(this.x.domain() as [number, number])
      .thresholds(this._ticks);
    return this._data.map(d => histogram(d));
  }

  // public get flattenData() {
  //   return this._data.
  // }
  public xScale(newx: d3.ScaleLinear<number, number>) {
    this._xScale = newx;
    return this;
  }

  public yScale(newy: d3.ScaleLinear<number, number>) {
    this._yScale = newy;
    return this;
  }

  public get ticks() {
    return this._ticks;
  }

  public get groupedBarWidth() {
    const nBins = this.gBins[0].length;
    return (this.xRange[1] - this.xRange[0]) / nBins;
  }

  public get barWidth() {
    const nGroups = this.gBins.length;
    const groupedBarWidth = this.groupedBarWidth - this._innerPadding;
    return Math.max(this._mode === 'side-by-side' ? (groupedBarWidth / nGroups - this._groupInnerPadding) : groupedBarWidth, 1)
  }

  public get layout(): BarLayout[][] {
    const gBins = this.gBins;
    const nGroups = gBins.length;
    const nBins = gBins[0].length;

    const barWidth = this.barWidth;
    const dx: number[][] = _.range(nGroups).map((d, i) => _.range(nBins).map(() => this._mode === 'side-by-side' ? i * (barWidth + this._groupInnerPadding) : 0));
    const dy: number[][] = _.range(nGroups).map((d, groupId) => _.range(nBins).map((d, binId) => this._mode === 'side-by-side' ? 0 :
      this.y(d3.sum(
        gBins.map(bins => bins[binId].length).filter((d, i) => i < groupId)
      )) + (groupId > 0 ? this.yRange[0] : 0)
    ));

    return this.gBins.map((bins, groupId) => bins.map((bin, binId) => {
      const Layout: BarLayout = {
        ...bin,
        x: this.x(bin.x0 as number) + dx[groupId][binId],
        y: this._direction === 'up' ? (this.yRange[1] - dy[groupId][binId] - this.y(bin.length)): dy[groupId][binId],
        width: barWidth,
        height: this.y(bin.length) - this.y(0),
      } as BarLayout;
      return Layout;
    }))
  }
}