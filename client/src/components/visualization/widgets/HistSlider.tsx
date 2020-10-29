import * as _ from "lodash";
import * as d3 from "d3";
import * as React from "react";
import { Slider, InputNumber, Row, Col, Divider, Icon } from 'antd';

import {drawSimpleHistogram, HistOption} from './naiveHistogram'

import { IColumn, INumColumn } from "data";
import { ChartOptions, getMargin, getChildOrAppend, getScaleLinear } from "../common";

import './HistSlider.scss'
import './slider.scss'

export interface HistSliderProps extends LinearSliderOptions, HistOption{
    column: INumColumn
    style?: React.CSSProperties;
    svgStyle?: React.CSSProperties;
    className?: string;
    defaultInstanceValue?: number,
    defaultInstanceRange?: [number, number],
    cfValue?: number;
    editable: boolean;
    drawInput: boolean;
    onRangeChange: (newRange: [number, number]) => void;
    onValueChange: (newValue: number) => void;
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
        const { column, defaultInstanceRange, defaultInstanceValue, xScale } = props;
        this.state = {
            instanceValue: defaultInstanceValue ? defaultInstanceValue : xScale!.domain()[0],
            range: defaultInstanceRange ? defaultInstanceRange : xScale!.domain() as [number, number],
        };
        this.onInstanceValueChange = this.onInstanceValueChange.bind(this);
        this.onRangeChange = this.onRangeChange.bind(this);
        this.paint = this.paint.bind(this);
    }

    public componentDidMount() {
        this.paint();
    }

    public componentDidUpdate(prevProps: HistSliderProps) {
        const {column, defaultInstanceValue, xScale, defaultInstanceRange} = this.props;
        if (column.name !== prevProps.column.name) {
            this.setState({
                instanceValue: defaultInstanceValue ? defaultInstanceValue : xScale!.domain()[0],
                range: defaultInstanceRange ? defaultInstanceRange : xScale!.domain() as [number, number],
            });
        }
        window.setTimeout(this.paint, 50);
    }

    public paint() {
        const histNode = this.histSvgGRef.current;
        const sliderNode = this.sliderSvgGRef.current;
        const { ticks, width, height, margin, xScale } = this.props;
        const { instanceValue, range } = this.state;
        const { column } = this.props;
        if (histNode) {
            drawSimpleHistogram(histNode,
                {range,ticks, width, height, margin, xScale},
                column.series.toArray()
            )
        }
        if (sliderNode) {
            drawLinearSlider(sliderNode,
                {
                    defaultValue: instanceValue,
                    defaultRange: range,
                    onRangeOneSideChange: this.onRangeChange,
                    onValueChange: this.onInstanceValueChange,
                    ticks, width, height, margin, xScale,
                    drawRange: true,
                    drawTick: true,
                    precision: column.precision
                },
                column.series.toArray())
        }
    }

    public render() {
        const { style, svgStyle, className, width, height, cfValue, drawInput, column } = this.props;
        const { instanceValue, range } = this.state;
        return (
            <div className={(className || "") + " histslides"} style={{ ...style, width: width + 250 }}>
                <div style={{ width: width, float: "left" }}>
                    <svg
                        ref={this.svgRef}
                        style={svgStyle}
                        width={width}
                        height={height}
                        className='hist-slider'
                    >
                        <g ref={this.histSvgGRef} />
                        <g ref={this.sliderSvgGRef} />
                    </svg>
                </div>
                {drawInput &&
                    <div className="controller-contrainer" style={{ width: 200, height: height, float: "left" }}>
                        <Row className="row-text">
                            <span className="feature-name">{column.name}</span>
                        </Row>
                        <Divider style={{ marginTop: 5, marginBottom: 5 }} />
                        <Row className="row-range">
                            <InputNumber
                                size="small"
                                className="range-input-left"
                                style={{ width: 60, float: "left" }}
                                value={Math.min(range[0], range[1])}
                                precision={column.precision ? column.precision : 0}
                            />
                            <div className="connector" />
                            <InputNumber
                                size="small"
                                className="range-input-right"
                                style={{ width: 60, float: "left" }}
                                value={Math.max(range[0], range[1])}
                                precision={column.precision ? column.precision : 0}
                            />
                        </Row>
                        <Row className="row-value">
                            <InputNumber
                                size="small"
                                className="instance-input"
                                style={{ width: 60, float: "left" }}
                                value={instanceValue}
                                precision={column.precision ? column.precision : 0}
                            />
                            {/* <SwapRightOutline /> */}
                            <div className="place-holder" />
                            <InputNumber
                                size="small"
                                className="cf-input"
                                style={{ width: 60, float: "left" }}
                                value={cfValue ? cfValue : instanceValue}
                                precision={column.precision ? column.precision : 0}
                            />
                        </Row>
                    </div>}
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

export interface LinearSliderOptions extends ChartOptions {
    defaultValue?: number;
    defaultRange?: [number, number];
    onRangeOneSideChange?: (index: number, newValue: number) => void;
    onValueChange?: (newValue: number) => void;
    xScale?: d3.ScaleLinear<number, number>
    ticks: number;
    drawRange: boolean;
    drawTick: boolean;
    precision: number;
}

export function drawLinearSlider(
    rootEle: SVGElement | SVGGElement,
    sliderOption: LinearSliderOptions,
    data: ArrayLike<number>
) {
    const options = { ...sliderOption };
    const { width, height, xScale, ticks, defaultValue, onValueChange, onRangeOneSideChange, drawRange, drawTick, precision } = options;
    const margin = getMargin(options.margin);
    const _width = width - margin.left - margin.right;
    const _height = height - margin.top - margin.bottom;

    const xRange = [0, width - margin.right - margin.left] as [number, number];
    const x = xScale ? xScale : getScaleLinear(xRange[0], xRange[1], data);

    const defaultRange = options.defaultRange ? options.defaultRange : x.domain()

    const root = d3.select(rootEle);

    const base = getChildOrAppend<SVGGElement, SVGElement | SVGGElement>(root, "g", "slider-base")
        .attr("transform", `translate(${margin.left}, ${margin.top + _height + 2})`);

    getChildOrAppend(base, "line", "track")
        .attr("x1", -2)
        .attr("x2", _width + 2);

    getChildOrAppend(base, "line", "track-inside")
        .attr("x1", -2)
        .attr("x2", _width + 2);

    const xticks = x.ticks(ticks);
    if (drawTick) {
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
    }


    if (drawRange) {
        getChildOrAppend(base, "line", "track-selected")
            .attr("x1", defaultRange ? x(defaultRange[0]) : x.range()[0])
            .attr("x2", defaultRange ? x(defaultRange[1]) : x.range()[1]);

        const dragRangeHandle = d3.drag<SVGGElement, any>()
            .on("drag", (d, i, n) => {
                const newxPos = Math.min(xRange[1], Math.max(d3.event.x, xRange[0]));
                d3.select(n[i]).attr("transform", `translate(${newxPos}, ${0})`);
                getChildOrAppend(base, "line", "track-selected")
                    .attr(`x${i + 1}`, newxPos);
                const xPos = Math.min(xRange[1], Math.max(d3.event.x, xRange[0]));
                const xValue = Math.round(x.invert(xPos) / 10**(-precision)) * 10**(-precision);
                onRangeOneSideChange && onRangeOneSideChange(i, xValue);
            })
            .on("end", (d, i, n) => {
                const xPos = Math.min(xRange[1], Math.max(d3.event.x, xRange[0]));
                // const xValue = x.invert(xPos);
                const xValue = Math.round(x.invert(xPos) / 10**(-precision)) * 10**(-precision);
                let newxPos = xPos;
                if ((xticks[1] - xticks[0]) <= 0.5) {
                    newxPos = Math.round(xPos*10)/10;
                }
                else{
                const leftTick = xticks.find(d => d <= xValue) || xticks[0];
                const rightTick = xticks.find(d => d > xValue) || xticks[xticks.length - 1];
                newxPos = x(((xValue - leftTick) < (rightTick - xValue)) ? leftTick : rightTick);
                }
                // d3.select(n[i]).attr("transform", `translate(${newxPos}, ${0})`);
                onRangeOneSideChange && onRangeOneSideChange(i, x.invert(newxPos));
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

        getChildOrAppend<SVGCircleElement, SVGGElement>(rangeHandleBase, "circle", "range-handle")
    }

    const dragHandle = d3.drag<SVGGElement, any>()
        .on("drag", (d, i, n) => {
            d3.select(n[i]).attr("transform", `translate(${Math.min(xRange[1], Math.max(d3.event.x, xRange[0]))}, ${0})`)
            const xPos = Math.min(xRange[1], Math.max(d3.event.x, xRange[0]));
            const xValue = Math.round(x.invert(xPos) / 10**(-precision)) * 10**(-precision);
            onValueChange && onValueChange(xValue);
        })
        .on("end", (d, i, n) => {
            let xPos = Math.min(xRange[1], Math.max(d3.event.x, xRange[0]));
            const xValue = Math.round(x.invert(xPos) / 10**(-precision)) * 10**(-precision);
            xPos = x.invert(xValue);
            onValueChange && onValueChange(xValue);
        });

    const handleBase = getChildOrAppend<SVGGElement, SVGGElement>(base, "g", "handle-base")
        .attr("transform", `translate(${defaultValue ? x(defaultValue) : 0}, ${0})`)
        .call(dragHandle);

    const handle = getChildOrAppend<SVGCircleElement, SVGGElement>(handleBase, "circle", "handle");
    getChildOrAppend<SVGCircleElement, SVGGElement>(handleBase, "rect", "handle-back")
        .attr("transform", "translate(-5, 12)")
        .attr("width", 10)
        .attr("height", 10)
        .attr("fill", "white")
    getChildOrAppend<SVGCircleElement, SVGGElement>(handleBase, "text", "handle-text")
        .attr("dy", 20)
        .text(defaultValue ? defaultValue.toFixed(precision) : 0);
}