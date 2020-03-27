import * as React from "react";
import * as d3 from "d3";
import { Dataset, DataMeta, IColumn } from "../../data";
import { CounterFactual, Filter, QueryParams } from "../../api"
import {
    getMargin,
    CSSPropertiesFn,
    ChartOptions,
    getChildOrAppend,
    getScaleLinear
} from "./common";
import "./pcp.css"

export interface PcpOptions extends ChartOptions {
    y: d3.ScaleLinear<number, number>,
    x: (d3.ScaleBand<string> | d3.ScaleLinear<number, number>)[],
    onHover?: (index: number) => void;
    onSelect?: (index: number) => void;
}

export function drawPcp(node: SVGGElement | SVGGElement,
    data: CounterFactual[],
    options: PcpOptions,
) {
    const margin = getMargin(options.margin);
    const { x, y } = options;
    const root = d3.select(node);
    const base = getChildOrAppend(root, "g", "pcp-base")
        .attr("transform", `translate(${margin.left}, ${margin.top})`);
    const polylines = base.selectAll("path.polyline")
        .data(data)
        .join(
            enter => enter.append("path")
                .attr("class", "polyline")
        );
    const lineGenerator = d3.line();
    polylines.attr("d", cf => lineGenerator(cf.map((d, i) =>
        [typeof d === 'string' ? (x[i] as d3.ScaleBand<string>)(d)!
            : (x[i] as d3.ScaleLinear<number, number>)(d), y(i)])))
}

// export default class PCP extends React.Component<PcpOptions, {}>{

// }