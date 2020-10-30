import * as React from "react";
import * as d3 from "d3";
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
    validColor?: string;
    originalColor?: string;
}

export function drawPcp(node: SVGGElement | SVGGElement,
    goodResults: CounterFactual[],
    badResults: CounterFactual[],
    options: PcpOptions,
    originInstance?: CounterFactual,
) {
    const margin = getMargin(options.margin);
    const { x, y, validColor, originalColor } = options;
    const root = d3.select(node);
    const base = getChildOrAppend(root, "g", "pcp-base")
        .attr("transform", `translate(${margin.left}, ${margin.top})`);
    const tickBase = getChildOrAppend(base, "g", "tick-base");
    const lineGenerator = d3.line();
    
    const badPolylines = base.selectAll("path.bad-polyline")
        .data(badResults)
        .join(
            enter => enter.append("path")
                .attr("class", "bad-polyline")
        );
    badPolylines.attr("d", cf => lineGenerator(cf.map((d, i) =>
        [typeof d === 'string' ? (x[i] as d3.ScaleBand<string>)(d)!
            : (x[i] as d3.ScaleLinear<number, number>)(d), y(i)])));

    const polylines = base.selectAll("path.polyline")
        .data(goodResults)
        .join(
            enter => enter.append("path")
                .attr("class", "polyline")
        );
   
    polylines.attr("d", cf => lineGenerator(cf.map((d, i) =>
        [typeof d === 'string' ? (x[i] as d3.ScaleBand<string>)(d)!
            : (x[i] as d3.ScaleLinear<number, number>)(d), y(i)])))
        .on("mouseover", (d, i, n) => {
            d3.select(n[i]).classed("selected", true);
            drawTicks(i);
        })
        .on("mouseout", (d, i, n) => {
            d3.select(n[i]).classed("selected", false);
            drawTicks();
        })
    if (validColor) {
        polylines.style("stroke", validColor);
    }
    

    if (originInstance) {
        const originalLine = getChildOrAppend(base, "path", "origin-polyline")
            .datum(originInstance)
            .attr("d", cf => lineGenerator(cf.map((d, i) =>
                [typeof d === 'string' ? (x[i] as d3.ScaleBand<string>)(d)!
                    : (x[i] as d3.ScaleLinear<number, number>)(d), y(i)])));
        if (originalColor) {
            originalLine.style("stroke", originalColor);
        }
    }
    const drawTicks = (idx?: number) => {
        if (idx === undefined) {
            tickBase.selectAll("g.tick-g")
                .remove();
        }
        else {
            const tickGroup = tickBase.selectAll("g.tick-g")
                .data(goodResults[idx])
                .join(enter => enter.append("g")
                    .attr("class", "tick-g"))
                .attr("transform", (d, i) => `translate(${
                    typeof d === 'string' ? (x[i] as d3.ScaleBand<string>)(d) : (x[i] as d3.ScaleLinear<number, number>)(d)
                    }, ${y(i)})`)
            getChildOrAppend(tickGroup, "rect", "tick-back")
                .attr("transform", "translate(-5, 12)")
                .attr("width", 10)
                .attr("height", 10)
                .style("fill", d => typeof d === 'string' ? "none" : "white");
            getChildOrAppend(tickGroup, "text", "tick-text")
                .text(d => typeof d === 'string' ? "" : d)
                .attr("dy", 18);

        }
    }
}