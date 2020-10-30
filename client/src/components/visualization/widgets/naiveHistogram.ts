// TODO: remove this component and use histogram.tsx instead.

import * as d3 from "d3";
import * as _ from "lodash";
import {
    getMargin,
    CSSPropertiesFn,
    ChartOptions,
    getChildOrAppend,
    getScaleLinear
} from "../common";
import './naiveHistogram.scss'

export interface HistOption extends ChartOptions {
    range?: [number, number];
    xScale?: d3.ScaleLinear<number, number>;
    ticks: number;
}

export function drawSimpleHistogram(
    rootEle: SVGElement | SVGGElement,
    sliderOption: HistOption,
    data: ArrayLike<number>) {
    const options = { ...sliderOption };
    const { width, height, xScale, ticks } = options;
    const margin = getMargin(options.margin);

    const xRange = [0, width - margin.right - margin.left] as [number, number];
    const yRange = [0, height - margin.top - margin.bottom] as [number, number];
    const x = xScale ? xScale : getScaleLinear(xRange[0], xRange[1], data);
    const y = d3.scaleLinear().range(yRange);

    const _ticks = d3.thresholdSturges(data);

    const histogram = d3
        .histogram()
        .domain(x.domain() as [number, number])
        .thresholds(ticks);
    const bins = histogram(data);
    y.domain([0, d3.max(bins.map(d => d.length)) as number])

    const defaultRange = options.range ? options.range : x.domain()
    const range = [Math.min(defaultRange[0], defaultRange[1]), Math.max(defaultRange[0], defaultRange[1])];
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
}