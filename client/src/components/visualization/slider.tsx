import * as d3 from "d3";
import * as _ from "lodash";
import { d3CheckBox } from "./checkBox"
import {
    getMargin,
    CSSPropertiesFn,
    ChartOptions,
    getChildOrAppend,
    getScaleLinear,
    getScaleBand
} from "./common";
import './slider.scss'

// const {SwapRightOutlined} = Icon

export interface LinearSliderOptions extends ChartOptions {
    defaultValue?: number;
    defaultRange?: [number, number];
    onRangeOneSideChange?: (index: number, newValue: number) => void;
    onValueChange?: (newValue: number) => void;
    xScale?: d3.ScaleLinear<number, number>
    ticks: number;
    drawRange: boolean;
    drawTick: boolean;
}

export function drawLinearSlider(
    rootEle: SVGElement | SVGGElement,
    sliderOption: LinearSliderOptions,
    data: ArrayLike<number>
) {
    const options = { ...sliderOption };
    const { width, height, xScale, ticks, defaultValue, onValueChange, onRangeOneSideChange, drawRange, drawTick } = options;
    const margin = getMargin(options.margin);
    const _width = width - margin.left - margin.right;
    const _height = height - margin.top - margin.bottom;

    const xRange = [0, width - margin.right - margin.left] as [number, number];
    const x = xScale ? xScale : getScaleLinear(data, ...xRange);

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
                const xValue = x.invert(xPos);
                onRangeOneSideChange && onRangeOneSideChange(i, xValue);
            })
            .on("end", (d, i, n) => {
                const xPos = Math.min(xRange[1], Math.max(d3.event.x, xRange[0]));
                const xValue = x.invert(xPos);
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
            const xValue = x.invert(xPos);
            if ((xticks[1] - xticks[0]) >= 5)
                onValueChange && onValueChange(Math.round(xValue))
            else if ((xticks[1] - xticks[0]) >= 0.5)
                onValueChange && onValueChange(Math.round(xValue*10)/10);
        })
        .on("end", (d, i, n) => {
            const xPos = Math.min(xRange[1], Math.max(d3.event.x, xRange[0]));
            const xValue = x.invert(xPos);
            if ((xticks[1] - xticks[0]) >= 5)
                onValueChange && onValueChange(Math.round(xValue))
            else if ((xticks[1] - xticks[0]) >= 0.5)
                onValueChange && onValueChange(Math.round(xValue*10)/10);
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
        .text(defaultValue ? defaultValue : 0);


    // const trackOverlay = getChildOrAppend(base, "line", "track-inside")
    //     .attr("x1", 0)
    //     .attr("x2", _width)
}



export interface BandSliderOptions extends ChartOptions {
    defaultValue?: string;
    onValueChange?: (newValue: string) => void;
    onSelectBand?: (band: number) => void;
    xScale?: d3.ScaleBand<string>
    barActivation: boolean[]
}

export function drawBandSlider(
    rootEle: SVGElement | SVGGElement,
    options: BandSliderOptions,
    data: ArrayLike<string>,
) {
    const { height, width, onSelectBand, onValueChange, defaultValue, barActivation } = options;
    const margin = getMargin(options.margin);
    const _width = width - margin.left - margin.right;
    const _height = height - margin.top - margin.bottom;
    const xRange = [0, width - margin.right - margin.left] as [number, number];
    const x = options.xScale ? options.xScale : getScaleBand(data, 0, _width)

    const root = d3.select(rootEle);
    const base = getChildOrAppend<SVGGElement, SVGElement | SVGGElement>(root, "g", "slider-base")
        .attr("transform", `translate(${margin.left}, ${margin.top + _height + 2})`);

    getChildOrAppend(base, "line", "track")
        .attr("x1", -2)
        .attr("x2", _width + 2);

    getChildOrAppend(base, "line", "track-inside")
        .attr("x1", -2)
        .attr("x2", _width + 2);

    // const xticks = x.ticks(ticks);
    const tickBase = getChildOrAppend(base, "g", "tick-base");

    const tick = tickBase.selectAll<SVGGElement, any>("g.tick")
        .data(x.domain())
        .join(
            enter => {
                return enter.append("g")
                    .attr("class", "tick");
            }
        )
        .attr("transform", d => `translate(${x(d) as number}, ${6})`);
    // getChildOrAppend(tick, "line", "tick-line")
    //     .attr("y2", 6)
    //     .attr("class", "tick-line");
    const checkboxes = x.domain().map((d, i) => d3CheckBox({ x: -7, defaultValue: barActivation[i], onClick: onSelectBand && (() => onSelectBand(i)) }));
    tick.each((d, i, n) => checkboxes[i](n[i] as SVGGElement))
    getChildOrAppend(tick, "text", "tick-text")
        .text(d => d)
        .attr("dy", 22)
        .attr("class", "tick-text");

    const dragHandle = d3.drag<SVGGElement, any>()
        .on("drag", (d, i, n) => {
            const xPos = Math.min(xRange[1], Math.max(d3.event.x, xRange[0]));
            d3.select(n[i]).attr("transform", `translate(${xPos}, ${0})`)

            // const xIndex = Math.round((xPos-xRange[0]) / x.bandwidth());
            // const xValue = x.domain()[xIndex];
            // onValueChange && onValueChange(xValue);
        })
        .on("end", (d, i, n) => {
            const xPos = Math.min(xRange[1], Math.max(d3.event.x, xRange[0]));
            const xIndex = Math.max(Math.round((xPos - x.range()[0] - x.step() / 2) / x.step()) - 1, 0);
            const xValue = x.domain()[xIndex];

            // d3.select(n[i]).attr("transform", `translate(${x(xValue)! + x.bandwidth() / 2}, ${0})`)
            onValueChange && onValueChange(xValue);
        });

    const handleBase = getChildOrAppend<SVGGElement, SVGGElement>(base, "g", "handle-base")
        .attr("transform", `translate(${defaultValue ? x(defaultValue) : 0}, ${0})`)
        .call(dragHandle);

    const handle = getChildOrAppend<SVGCircleElement, SVGGElement>(handleBase, "circle", "handle");
}