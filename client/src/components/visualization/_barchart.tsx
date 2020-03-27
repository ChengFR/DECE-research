import * as d3 from "d3";
import * as _ from "lodash";
// import {SwapRightOutlined} from '@ant-design/icons';
import {
    getMargin,
    CSSPropertiesFn,
    ChartOptions,
    getChildOrAppend,
    countCategories,
    getScaleBand
} from "./common";
import './_barchart.scss'

export interface BarOption extends ChartOptions {
    selectedBars?: string[];
    xScale?: d3.ScaleBand<string>;
    innerPadding?: number
}

export function drawSimpleBarchart(
    rootEle: SVGElement | SVGGElement,
    sliderOption: BarOption,
    data: ArrayLike<string>) {
    const options = { ...sliderOption };
    const { width, height, xScale, innerPadding } = options;
    const margin = getMargin(options.margin);

    const xRange = [0, width - margin.right - margin.left] as [number, number];
    const yRange = [0, height - margin.top - margin.bottom] as [number, number];
    const x = xScale ? xScale : getScaleBand(data, ...xRange);
    const categoryData = countCategories(data, x.domain())
    const y = d3.scaleLinear()
        .range(yRange)
        .domain([0, d3.max(categoryData.map(d => d.count)) as number])

    // const defaultRange = options.range ? options.range : x.domain()
    // const range = [Math.min(defaultRange[0], defaultRange[1]), Math.max(defaultRange[0], defaultRange[1])];
    const root = d3.select(rootEle);

    const barBase = getChildOrAppend<SVGGElement, SVGElement>(root, "g", "barchart-base")
        .attr("transform", `translate(${margin.left}, ${margin.top})`);

    barBase.selectAll<SVGRectElement, d3.Bin<number, number>>("rect.bar")
        .data(categoryData)
        .join(enter => {
            return enter.append("rect")
                .attr("class", "bar");
        })
        .attr("transform", d => `translate(${x(d.name)! - x.bandwidth()/2}, ${yRange[1] - y(d.count)})`)
        .attr("width", d => {
            return x.bandwidth();
        })
        .attr("height", d => {
            return y(d.count) - yRange[0] + 0.01;
        });

    // histBase.selectAll<SVGRectElement, d3.Bin<number, number>>("rect.bar")
    //     .classed("selected-bar", d => ((d.x1 as number > range[0]) && (d.x0 as number < range[1])))
}