import * as d3 from 'd3';
import * as _ from "lodash";

import { IMargin, defaultCategoricalColor, getChildOrAppend, ChartOptions } from '../visualization/common';
import { SankeyBins } from 'components/CompactTable/common';

export interface LinkOptions<T> extends ChartOptions{
    histogramType: 'side-by-side'|'stacked';
    collapsed: boolean;
    xScale: (x: T) => number;
    binWidth: number,
    margin: IMargin;
    onSwitch: () => void;
    color?: (x: number) => string;
}

export function drawLink<T>(root: SVGGElement, data: SankeyBins<T>[][][], options: LinkOptions<T>) {
    const { width, margin, histogramType, collapsed, xScale:x, binWidth, onSwitch } = options;
    const _root = d3.select(root);
    const countMax = d3.max(_.flatten(_.flatten(data)).map(d => d.count));
    // const groupBinWidth = (width - margin.left - margin.right) / (ticks.length - 1) - 2;
    const color = options.color || defaultCategoricalColor;

    if (data && !collapsed) {
        _root.selectAll("g.place-holder").remove()
        const linkCatGroup = _root.selectAll("g.link-cat-group")
            .data(data)
            .join(enter => enter.append("g")
                .attr("class", "link-cat-group"))
            .attr("transform", (d, i) => histogramType === 'side-by-side' ? `translate(${i * binWidth}, 0)` : `translate(0, 0)`)
            .style("stroke", (d, i) => color(i));

        const linkGroup = linkCatGroup.selectAll("g.link-group")
            .data(d => d)
            .join(enter => enter.append("g")
                .attr("class", "link-group"));
        linkGroup.selectAll("path.link")
            .data(d => d)
            .join(enter => enter.append("path")
                .attr("class", "link"))
            // .attr("d", d => `M${(x(d.x00)+x(d.x01))/2},0 L${(x(d.x10)+x(d.x11))/2}, 20`)
            .attr("d", d => {
                const x0 = x(d.x00) + binWidth / 2;
                const x1 = x(d.x10) + binWidth / 2;
                const y0 = 0;
                const y1 = 20;
                return `M${x0},0 C${x0},${10} ${x1},${10} ${x1},20`;
            })
            .style("display", d => d.count > 0 ? "block" : "none")
            .style("opacity", d => countMax !== undefined ? d.count / countMax : 0.8)
            .style("stroke-width", d => d.topTotalCounts !== undefined ? d.count / d.topTotalCounts * binWidth : 1)
            // .style("stroke-width", d => 1)
            .style("fill", "none");
        const base = getChildOrAppend(_root, "rect", "link-base")
            .attr("width", (width - margin.left - margin.right))
            .attr("height", 20)
            .style("opacity", 0)
            .on("click", d => onSwitch());
    }
    else {
        _root.selectAll("g.link-cat-group").remove();
        const placeHolder = getChildOrAppend(_root, "g", "place-holder")
        getChildOrAppend(placeHolder, "rect", "place-holder")
            .attr("width", (width - margin.left - margin.right))
            .attr("height", 3)
            .style("opacity", 0)
            .on("click", d => onSwitch())
            .on("mouseover", (d, i, g) => {
                const me = d3.select(g[i]);
                me.style("fill", "black")
                    .style("opacity", 0.1);
            })
            .on("mousemove", (d, i, g) => {
                const me = d3.select(g[i]);
                me.style("fill", "black")
                    .style("opacity", 0);
            });
    }

}