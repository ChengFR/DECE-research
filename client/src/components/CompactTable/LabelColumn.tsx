import * as React from 'react';
import * as _ from "lodash";
import memoizeOne from "memoize-one";


import { shallowCompare, number2string, decile2precision, assert } from '../../common/utils';
import { IMargin, defaultCategoricalColor, getScaleBand, getChildOrAppend } from '../visualization/common';
import Histogram, { } from '../visualization/histogram';
import { CFNumericalColumn, CFCategoricalColumn, getRowLabels, getAllRowLabels, filterUndefined, CFTableColumn, isNumericalCFColumn } from './common';
import BarChart from '../visualization/barchart';
import { TableColumn, isNumericalVColumn } from '../Table/common';
import { ColumnSizer } from 'react-virtualized';
import * as d3 from 'd3';
import { timeHours } from 'd3';
import { timingSafeEqual } from 'crypto';

export interface ILabelColumnProps {
    width: number;
    height: number;
    margin: IMargin;
    targetColumn: CFCategoricalColumn;
    predColumn: CFCategoricalColumn;
    style?: React.CSSProperties;
    className?: string;
    histogramType: 'side-by-side' | 'stacked';
    color?: (n: number) => string
}

export interface ILabelColumnState {

}

export default class LabelColumn extends React.PureComponent<ILabelColumnProps, ILabelColumnState> {
    private svgRef: React.RefObject<SVGSVGElement> = React.createRef();
    private shouldPaint: boolean = false;
    static layout = {
        marginTop: 20,
        marginBottom: 20
    }
    constructor(props: ILabelColumnProps) {
        super(props);
        this.paint = this.paint.bind(this);
        this.paintBarChart = this.paintBarChart.bind(this);
        this.countNum = this.countNum.bind(this);
        this.getXScale = this.getXScale.bind(this);
    }

    protected updateParams() {

    }

    componentDidMount() {
        this.paint()
    }

    componentDidUpdate() {
        this.updateParams();

        this.shouldPaint = true;
        const delayedPaint = () => {
            if (this.shouldPaint) this.paint();
        };
        window.setTimeout(delayedPaint, 100);
    }

    paint() {
        const { margin } = this.props;
        const node = this.svgRef.current;
        const { marginBottom, marginTop } = LabelColumn.layout;
        if (node) {
            const root = d3.select(node);
            // const defs = getChildOrAppend(root, "defs", "pattern-container");
            // const posPattern = getChildOrAppend(defs, "pattern", "pattern-pos")
            //     .attr("id", "pattern-stripe-pos")
            //     .attr("width", 4)
            //     .attr("height", 4)
            //     .attr("patternTransform", "rotate(45)")
            // getChildOrAppend(posPattern, "rect", "stripe")
            //     .attr("width", 2)
            //     .attr("height", 4)
            //     .attr("fill", "write")
            const barChartBase = getChildOrAppend<SVGGElement, SVGSVGElement>(root, "g", "bar-chart-base")
                .attr("transform", `translate(0, ${marginTop})`);;
            const originHistNode = barChartBase.node();
            originHistNode && this.paintBarChart(originHistNode);
        }
    }

    paintBarChart(root: SVGGElement) {
        const { height, margin, width, predColumn, targetColumn } = this.props;
        const { marginBottom, marginTop } = LabelColumn.layout;
        const color = this.props.color ? this.props.color : defaultCategoricalColor;
        const _height = height - marginBottom - marginTop
        const _root = d3.select(root);
        const data: [string, string][][] = predColumn.categories.map(predCat => {
            const bin: [string, string][] = [];
            bin.push([predCat, predCat]);
            targetColumn.categories.forEach(targetCat => {
                if (targetCat !== predCat) {
                    bin.push([predCat, targetCat]);
                }
            })
            return bin;
        })
        const x = this.getXScale();
        const yMax = d3.max(predColumn.categories.map(predCat => d3.sum(targetColumn.categories.map(targetCat => this.countNum(predCat, targetCat)))));
        const y = d3.scaleLinear().domain([0, yMax!]).range([0, _height]);
        const barBases = _root.selectAll("g.bar-base")
            .data(data)
            .join(enter => enter.append("g")
                .attr("class", "bar-base")
            )
            .attr("transform", d => `translate(${margin.left + x(d[0][0])!}, ${margin.top})`)
        // .style("fill", (d, i) => color(i));
        const dy = (predCat: string, targetCat: string, idx: number) => {
            if (predCat === targetCat) return y(0);
            else return y(this.countNum(predCat, predCat));
            // return y(d3.sum(_.range(idx).map(i => this.countNum(predCat, targetColumn.categories[i])))) 
        };
        const bars = barBases.selectAll("rect.bar")
            .data(d => d)
            .join(enter => enter.append("rect")
                .attr("class", "bar")
            )
            // .attr("transform", d => `translate(0, ${})`);
            .attr("y", (d, i) => _height - y(this.countNum(...d)) - dy(d[0], d[1], i))
            .attr("height", (d, i) => y(this.countNum(...d)))
            .attr("width", x.bandwidth() - 1)
            .classed("false", d => d[0] !== d[1])
            .classed("pos", d => d[0] === predColumn.categories[0])
            .classed("neg", d => d[0] === predColumn.categories[1]);

        _root.selectAll("text.bar-text")
            .data(data)
            .join(enter => enter.append("text")
                .attr("class", "bar-text"))
            .attr("transform", d => `translate(${margin.left + x(d[0][0])!}, 0)`)
            .text(d => d3.sum(d.map(pairs => this.countNum(...pairs))))
                // .style("fill", (d, i) => color(i));


    }

    countNum(predLabel: string, targetLabel: string): number {
        const { predColumn, targetColumn } = this.props;
        const predArray = predColumn.series.toArray();
        const targetArray = targetColumn.series.toArray();
        const index = Array.from(_.range(predArray.length))
        return index.filter(d => predArray[d] === predLabel && targetArray[d] === targetLabel).length;
    }

    getXScale() {
        const { predColumn, width, margin } = this.props;
        return predColumn.xScale || getScaleBand(predColumn.series.toArray(), 0, width - margin.left - margin.right, predColumn.categories);
    }

    render() {
        const { className, style, width, height, margin } = this.props;

        return <div className={className} style={{ width, ...style }}>
            <div className={(className || "") + " label-chart"} style={style}>
                <svg style={{ height: height, width: width }} ref={this.svgRef}>
                    <defs>
                        <pattern id="pattern-stripe"
                            width="4" height="4"
                            patternUnits="userSpaceOnUse"
                            patternTransform="rotate(45)">
                            <rect width="2" height="4" transform="translate(0,0)" fill="white"></rect>
                        </pattern>
                        <mask id="mask-stripe">
                            <rect x="0" y="0" width="100%" height="100%" fill="url(#pattern-stripe)" />
                        </mask>
                    </defs>
                </svg>
            </div>
        </div>
    }


}
