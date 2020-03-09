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
import "./histogram.css";
import { shallowCompare } from "../../common/utils";
import memoizeOne from "memoize-one";

export interface IHistogramOptions extends ChartOptions {
  innerPadding: number;
  rectStyle?: CSSPropertiesFn<SVGRectElement, d3.Bin<number, number>>;
  onRectMouseOver?: d3.ValueFn<any, d3.Bin<number, number>, void>;
  onRectMouseMove?: d3.ValueFn<any, d3.Bin<number, number>, void>;
  onRectMouseLeave?: d3.ValueFn<any, d3.Bin<number, number>, void>;
  onSelectRange?: (range?: [number, number]) => any;
  xScale?: d3.ScaleLinear<number, number>;
  selectedRange?: [number, number];
  allData?: ArrayLike<number>;
}

export const defaultOptions: IHistogramOptions = {
  width: 300,
  height: 200,
  margin: 0,
  innerPadding: 1
};

function getNBinsRange(width: number): [number, number] {
  return [Math.ceil(width / 9), Math.floor(width / 7)];
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
    rectStyle,
    innerPadding,
    onRectMouseOver,
    onRectMouseMove,
    onRectMouseLeave,
    onSelectRange,
    xScale,
    selectedRange,
    allData,
  } = opts;

  const margin = getMargin(opts.margin);

  const xRange = [0, width - margin.right - margin.left] as [number, number];
  const yRange = [height - margin.top - margin.bottom, 0];
  // console.debug("Rendering histogram", xRange, yRange);

  const x = xScale ? xScale : getScaleLinear(allData || data, ...xRange);

  const root = d3.select(svg);

  // set the parameters for the 
  const nBins = d3.thresholdSturges(allData || data);
  const [min, max] = getNBinsRange(width);
  const ticks = x.ticks(Math.min(Math.max(min, nBins), max));

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
    d3.max(allBins || bins, function(d) {
      return d.length;
    }) as number
  ]); // d3.hist has to be called before the Y axis obviously


  let rangeBrushing: [number, number] | null = null;
  if (selectedRange) {
    const startIndex = bins.findIndex(({x1}) => x1 !== undefined && selectedRange[0] < x1);
    const endIndex = _.findLastIndex(bins, ({x0}) => x0 !== undefined && x0 < selectedRange[1]);
    rangeBrushing = [startIndex, endIndex];
  }
  // console.debug("brushed Range", rangeBrushing);
  let brushing: boolean = false;

  const gBase = getChildOrAppend<SVGGElement, SVGElement>(root, "g", "base")
    .attr(
      "transform",
      `translate(${margin.left}, ${margin.top})`
    );

  gBase.selectAll("rect.bar")
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
  const g = getChildOrAppend<SVGGElement, SVGElement>(root, "g", "rects").attr(
    "transform",
    `translate(${margin.left}, ${margin.top})`
  );
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
          ? (Math.min(...rangeBrushing) <= idx && idx <= Math.max(...rangeBrushing))
          : false
      );
  };

  const merged2 = renderShades();

  merged2
    .on("mouseover", function(data, idx, groups) {
      onRectMouseOver && onRectMouseOver(data, idx, groups);
      if (brushing && rangeBrushing) {
        rangeBrushing[1] = idx;
        renderShades();
      }
    })
    .on("mousemove", (onRectMouseMove || null) as null)
    .on("mouseleave", (onRectMouseLeave || null) as null);

  merged2
    .on("mousedown", function(data, idx) {
      brushing = true;
      if (rangeBrushing === null)
        rangeBrushing = [idx, idx];
      else rangeBrushing = null;
    })
    .on("mouseup", function(data, idx) {
      if (rangeBrushing) {
        rangeBrushing[1] = idx;
        console.debug("select range:", rangeBrushing);
        const b1 = bins[Math.min(...rangeBrushing)], b2 = bins[Math.max(...rangeBrushing)];
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

export interface IHistogramProps extends IHistogramOptions {
  data: ArrayLike<number>;
  allData?: ArrayLike<number>;
  style?: React.CSSProperties;
  svgStyle?: React.CSSProperties;
  className?: string;
  extent?: [number, number];
}

export interface IHistogramState {
  hoveredBin: [number, number] | null;
}

export class Histogram extends React.PureComponent<
  IHistogramProps,
  IHistogramState
> {
  static defaultProps = { ...defaultOptions };
  private svgRef: React.RefObject<SVGSVGElement> = React.createRef();
  private shouldPaint: boolean = false;

  constructor(props: IHistogramProps) {
    super(props);

    this.state = { hoveredBin: null };
    this.paint = this.paint.bind(this);
    this.onMouseOverBar = this.onMouseOverBar.bind(this);
    this.onMouseLeaveBar = this.onMouseLeaveBar.bind(this);
  }

  public paint(svg: SVGSVGElement | null = this.svgRef.current) {
    if (svg) {
      const { data, className, style, svgStyle, height, ...rest } = this.props;
      const xScale = rest.xScale || this.getXScale();
      drawHistogram(svg, data, {
        height: height - 24,
        ...rest,
        xScale,
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
    prevProps: IHistogramProps,
    prevState: IHistogramState
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

  memoizedXScaler = memoizeOne(getScaleLinear);

  getXScale = () => {
    const { data, width } = this.props;
    const margin = getMargin(this.props.margin);
    return this.memoizedXScaler(data, 0, width - margin.left - margin.right);
  };

  public render() {
    const { style, svgStyle, className, width, height, extent } = this.props;
    const { hoveredBin } = this.state;
    return (
      <div className={(className || "") + " histogram"} style={style}>
        <svg
          ref={this.svgRef}
          style={{ ...svgStyle, marginTop: 4 }}
          width={width}
          height={height - 24}
        />
        <div className="info">
          {hoveredBin
            ? `${hoveredBin[0]} - ${hoveredBin[1]}`
            : (extent && `${extent[0]} - ${extent[1]}`)
          }
        </div>
      </div>
    );
  }

  onMouseOverBar: NonNullable<IHistogramOptions["onRectMouseOver"]> = (
    data,
    index
  ) => {
    const { x0, x1 } = data;
    this.setState({
      hoveredBin: [
        x0 === undefined ? -Infinity : x0,
        x1 === undefined ? Infinity : x1
      ]
    });
  };

  onMouseLeaveBar: NonNullable<IHistogramOptions["onRectMouseOver"]> = (
    data,
    index
  ) => {
    this.setState({ hoveredBin: null });
  };
}

export default Histogram;
