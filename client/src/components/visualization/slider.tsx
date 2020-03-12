import * as d3 from "d3";
import * as _ from "lodash";
import * as React from "react";
import { Slider, InputNumber, Row, Col, Divider, Icon } from 'antd';
// import {SwapRightOutlined} from '@ant-design/icons';
import {
    getMargin,
    CSSPropertiesFn,
    ChartOptions,
    getChildOrAppend,
    getScaleLinear
} from "./common";
import { defaultOptions, IHistogramProps, Histogram } from "./histogram";
import { FeatureDisc } from "../../data/dataset"
import './slider.css'

// const {SwapRightOutlined} = Icon

export interface SliderOptions extends ChartOptions {
    defaultValue?: number;
    defaultRange?: [number, number];
    onRangeOneSideChange?: (index: number, newValue: number) => void;
    onValueChange?: (newValue: number) => void;
    xScale?: d3.ScaleLinear<number, number>;
    ticks: number;
    // innerPadding: number;
}

export const defaultOption: SliderOptions = {
    width: 300,
    height: 200,
    margin: 5,
    ticks: 10,
    // innerPadding: 1,
}

export function drawSimpleSlider(
    rootEle: SVGElement | SVGGElement,
    sliderOption: SliderOptions,
    data: ArrayLike<number>
) {
    const options = { ...defaultOptions, ...sliderOption };
    const { width, height, xScale, ticks, defaultValue, onValueChange, onRangeOneSideChange } = options;
    const margin = getMargin(options.margin);
    const _width = width - margin.left - margin.right;
    const _height = height - margin.top - margin.bottom;

    const xRange = [0, width - margin.right - margin.left] as [number, number];
    const yRange = [0, height - margin.top - margin.bottom] as [number, number];
    const x = xScale ? xScale : getScaleLinear(data, ...xRange);
    const y = d3.scaleLinear().range(yRange);

    const histogram = d3
        .histogram()
        .domain(x.domain() as [number, number])
        .thresholds(ticks);
    const bins = histogram(data);
    const barWidth = _width / ticks;
    const defaultRange = options.defaultRange ? options.defaultRange : x.domain()
    const range = [Math.min(defaultRange[0], defaultRange[1]), Math.max(defaultRange[0], defaultRange[1])];

    y.domain([
        0,
        d3.max(bins, function (d) {
            return d.length;
        }) as number
    ]); // d3.hist has to be called before the Y axis obviously
    const xticks = x.ticks(ticks);

    const root = d3.select(rootEle);

    const histBase = getChildOrAppend<SVGGElement, SVGElement>(root, "g", "hist-base")
        .attr("transform", `translate(${margin.left}, ${margin.top})`);

    histBase.selectAll<SVGRectElement, d3.Bin<number, number>>("rect.bar")
        .data(bins)
        .join(enter => {
            return enter.append("rect")
                .attr("class", "bar");
        })
        .attr("transform", d => `translate(${x(d.x0 as number)}, ${yRange[1] - y(d.length)})`)
        .attr("width", d => {
            return Math.max(0, x(d.x1 as number) - x(d.x0 as number) - 1);
        })
        .attr("height", d => {
            return y(d.length) - yRange[0] + 0.01;
        });

    histBase.selectAll<SVGRectElement, d3.Bin<number, number>>("rect.bar")
        .classed("selected-bar", d => ((d.x1 as number > range[0]) && (d.x0 as number < range[1])))

    const base = getChildOrAppend<SVGGElement, SVGElement | SVGGElement>(root, "g", "slider-base")
        .attr("transform", `translate(${margin.left}, ${margin.top + _height + 2})`);

    getChildOrAppend(base, "line", "track")
        .attr("x1", -2)
        .attr("x2", _width + 2);

    getChildOrAppend(base, "line", "track-inside")
        .attr("x1", -2)
        .attr("x2", _width + 2);

    const tickBase = getChildOrAppend(base, "g", "tick-base");

    const tick = tickBase.selectAll("g.tick")
        .data(xticks)
        .join(
            enter => {
                return enter.append("g")
                    .attr("class", "tick");
            }
        )
        .attr("transform", d => `translate(${x(d)}, ${6})`);
    getChildOrAppend(tick, "line", "tick-line")
        .attr("y2", 6)
        .attr("class", "tick-line");
    getChildOrAppend(tick, "text", "tick-text")
        .text(d => d)
        .attr("dy", 12)
        .attr("class", "tick-text");

    getChildOrAppend(base, "line", "track-selected")
        .attr("x1", defaultRange ? x(defaultRange[0]) : x.range()[0])
        .attr("x2", defaultRange ? x(defaultRange[1]) : x.range()[1]);

    const dragHandle = d3.drag<SVGGElement, any>()
        .on("drag", (d, i, n) => {
            d3.select(n[i]).attr("transform", `translate(${Math.min(xRange[1], Math.max(d3.event.x, xRange[0]))}, ${0})`)
            const xPos = Math.min(xRange[1], Math.max(d3.event.x, xRange[0]));
            const xValue = x.invert(xPos);
            onValueChange && onValueChange(xValue);
        })
        .on("end", (d, i, n) => {
            const xPos = Math.min(xRange[1], Math.max(d3.event.x, xRange[0]));
            const xValue = x.invert(xPos);
            onValueChange && onValueChange(xValue);
        });

    const handleBase = getChildOrAppend<SVGGElement, SVGGElement>(base, "g", "handle-base")
        .attr("transform", `translate(${defaultValue ? x(defaultValue) : 0}, ${0})`)
        .call(dragHandle);

    const handle = getChildOrAppend<SVGCircleElement, SVGGElement>(handleBase, "circle", "handle");

    const dragRangeHandle = d3.drag<SVGGElement, any>()
        .on("drag", (d, i, n) => {
            const newxPos = Math.min(xRange[1], Math.max(d3.event.x, xRange[0]));
            d3.select(n[i]).attr("transform", `translate(${newxPos}, ${0})`);
            getChildOrAppend(base, "line", "track-selected")
                .attr(`x${i + 1}`, newxPos);
            const xPos = Math.min(xRange[1], Math.max(d3.event.x, xRange[0]));
            const xValue = x.invert(xPos);
            onRangeOneSideChange && onRangeOneSideChange(i, xValue);

        })
        .on("end", (d, i, n) => {
            const xPos = Math.min(xRange[1], Math.max(d3.event.x, xRange[0]));
            const xValue = x.invert(xPos);
            onRangeOneSideChange && onRangeOneSideChange(i, xValue);
        });

    const rangeHandleBase = base.selectAll<SVGGElement, any>("g.range-handle-base")
        .data(defaultRange ? defaultRange : x.domain())
        .join(
            enter => {
                return enter.append("g")
                    .attr("class", "range-handle-base")
            }
        )
        .attr("transform", d => `translate(${x(d)}, ${0})`)
        .call(dragRangeHandle);

    const rangeHandle = getChildOrAppend<SVGCircleElement, SVGGElement>(rangeHandleBase, "circle", "range-handle")

    // const trackOverlay = getChildOrAppend(base, "line", "track-inside")
    //     .attr("x1", 0)
    //     .attr("x2", _width)
}

export interface HistSliderProps extends SliderOptions {
    data: ArrayLike<number>;
    style?: React.CSSProperties;
    svgStyle?: React.CSSProperties;
    className?: string;
    defaultInstanceValue?: number,
    defaultInstanceRange?: [number, number],
    feature: FeatureDisc;
    cfValue?: number;
    editable: boolean;
    drawInput: boolean;
    onRangeChange: (newRange: [number, number]) => void;
}

export interface HistSliderState {
    instanceValue: number,
    range: [number, number],
}

export class HistSlider extends React.Component<HistSliderProps, HistSliderState>{
    private svgRef: React.RefObject<SVGSVGElement> = React.createRef();
    private histSvgGRef: React.RefObject<SVGGElement> = React.createRef();
    private sliderSvgGRef: React.RefObject<SVGGElement> = React.createRef();
    constructor(props: HistSliderProps) {
        super(props);
        const { data, defaultInstanceRange, defaultInstanceValue, feature } = props;
        this.state = {
            instanceValue: defaultInstanceValue ? defaultInstanceValue : feature.min!,
            range: defaultInstanceRange ? defaultInstanceRange : [feature.min!, feature.max!],
        };
        this.onInstanceValueChange = this.onInstanceValueChange.bind(this);
        this.onRangeChange = this.onRangeChange.bind(this);
        this.paint = this.paint.bind(this);
    }

    public componentDidMount() {
        this.paint();
    }

    public componentDidUpdate() {
        window.setTimeout(this.paint, 50);
    }

    public paint() {
        const node = this.sliderSvgGRef.current
        const { ticks, width, height, margin, xScale } = this.props;
        const { instanceValue, range } = this.state;
        const { data } = this.props;
        if (node) {
            drawSimpleSlider(node,
                {
                    defaultValue: instanceValue,
                    defaultRange: range,
                    onRangeOneSideChange: this.onRangeChange,
                    onValueChange: this.onInstanceValueChange,
                    ticks, width, height, margin, xScale
                },
                data)
        }
    }

    public render() {
        const { style, svgStyle, className, width, height, cfValue, feature, drawInput } = this.props;
        const { instanceValue, range } = this.state;
        return (
            <div className={(className || "") + " histslides"} style={{ ...style, width: width + 250 }}>
                {/* <div style={{width: 40, height: height, float: "left"}}>
                    <span></span>
                </div> */}
                <div style={{ width: width, float: "left" }}>
                    <svg
                        ref={this.svgRef}
                        style={svgStyle}
                        width={width}
                        height={height}
                    >
                        <g ref={this.histSvgGRef} />
                        <g ref={this.sliderSvgGRef} />
                    </svg>
                </div>
                {drawInput &&
                    <div className="controller-contrainer" style={{ width: 200, height: height, float: "left" }}>
                        <Row className="row-text">
                            <span className="feature-name">{feature.name}</span>
                        </Row>
                        <Divider style={{ marginTop: 5, marginBottom: 5 }} />
                        <Row className="row-range">
                            <InputNumber
                                size="small"
                                className="range-input-left"
                                style={{ width: 60, float: "left" }}
                                value={Math.min(range[0], range[1])}
                                precision={feature.precision ? feature.precision : 0}
                            />
                            <div className="connector" />
                            <InputNumber
                                size="small"
                                className="range-input-right"
                                style={{ width: 60, float: "left" }}
                                value={Math.max(range[0], range[1])}
                                precision={feature.precision ? feature.precision : 0}
                            />
                        </Row>
                        <Row className="row-value">
                            <InputNumber
                                size="small"
                                className="instance-input"
                                style={{ width: 60, float: "left" }}
                                value={instanceValue}
                                precision={feature.precision ? feature.precision : 0}
                            />
                            {/* <SwapRightOutline /> */}
                            <div className="place-holder" />
                            <InputNumber
                                size="small"
                                className="cf-input"
                                style={{ width: 60, float: "left" }}
                                value={cfValue ? cfValue : instanceValue}
                                precision={feature.precision ? feature.precision : 0}
                            />
                        </Row>
                    </div>}
                {/* <InputNumber
                    style={{ width: 60, float: "left", height: 30 }}
                /> */}
            </div>

        );
    }
    public onInstanceValueChange(newValue: number) {
        const { onValueChange } = this.props;
        this.setState({ instanceValue: newValue });
        onValueChange && onValueChange(newValue);
    }
    public onRangeChange(index: number, newValue: number) {
        // const { onRangeChange } = this.props;
        const range = this.state.range;
        range[index] = newValue;
        this.setState({ range: range });
        this.props.onRangeChange && this.props.onRangeChange([Math.min(range[0], range[1]), Math.max(range[0], range[1])]);
    }


}