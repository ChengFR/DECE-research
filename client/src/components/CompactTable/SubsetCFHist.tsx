import * as d3 from 'd3';
import * as React from 'react';
import * as _ from "lodash";
import memoizeOne from "memoize-one";


import { shallowCompare, number2string, decile2precision, assert } from '../../common/utils';
import { IMargin, defaultCategoricalColor, getChildOrAppend, defaultMarginBottom } from '../visualization/common';
import Histogram, { drawGroupedHistogram } from '../visualization/histogram';
import { CFNumericalColumn, CFCategoricalColumn, getRowLabels, getAllRowLabels, filterUndefined, CFTableColumn, isNumericalCFColumn } from './common';
import { gini } from 'common/science';
import { Icon } from 'antd';
import { randomLogNormal, line } from 'd3';

export interface SubsetChartProps {
    width: number;
    height: number;
    margin: IMargin;
    style?: React.CSSProperties;
    className?: string;
    k: string;

    column: CFTableColumn;
    protoColumn?: CFTableColumn;
    groupByColumn?: Readonly<CFTableColumn>;
}

export interface ISubsetCFHistProps extends SubsetChartProps{
    column: CFNumericalColumn;
    protoColumn?: CFNumericalColumn;

    onUpdateFilter?: (extent?: [number, number], categories?: string[]) => void;
    histogramType: 'side-by-side' | 'stacked';
    onSelect?: () => void;
    expandable: boolean;
    drawLineChart?: boolean;
    drawHandle?: boolean;
}

export interface ISubsetCFHistState {
    selectedRange?: [number, number];
}

export default class SubsetCFHist extends React.PureComponent<ISubsetCFHistProps, ISubsetCFHistState> {

    private originData?: number[] | number[][];
    private cfData?: number[] | number[][];
    private svgRef: React.RefObject<SVGSVGElement> = React.createRef();
    private shouldPaint: boolean;
    static layout = {
        rangeNotation: 20,
        lineChart: 10,
        marginBottom: 10,
    }

    constructor(props: ISubsetCFHistProps) {
        super(props);
        const { column } = this.props;
        this.state = { selectedRange: column.dataRange };
        this.updateParams(props);

        this.onHoverRange = this.onHoverRange.bind(this);
        this.onSelectRange = this.onSelectRange.bind(this);
        this.paint = this.paint.bind(this);
        this.drawLineChart = this.drawLineChart.bind(this);
        this.drawHandle = this.drawHandle.bind(this);
        this.getGini = this.getGini.bind(this);

        this.shouldPaint = false;
    }

    componentDidMount(){
        this.paint();
    }

    componentDidUpdate(prevProps: ISubsetCFHistProps) {
        this.updateParams(this.props);

        this.shouldPaint = true;
        const delayedPaint = () => {
            if (this.shouldPaint) this.paint();
        };
        window.setTimeout(delayedPaint, 100);
    }

    protected updateParams(props: ISubsetCFHistProps) {
        const { column, protoColumn, groupByColumn } = this.props;

        const groupArgs = groupByColumn && getRowLabels(groupByColumn);
        // const allGroupArgs = groupByColumn && getAllRowLabels(groupByColumn);
        // const protoGroupArgs = protoColumnGroupBy && protoColumn && getAllRowLabels(protoColumnGroupBy);

        const validFilter = column.valid && ((idx: number) => column.valid![idx]);

        if (groupArgs) {
            this.originData = column.series.groupBy(groupArgs[0], groupArgs[1], validFilter);
            this.cfData = column.cf && (groupArgs ? column.cf.groupBy(groupArgs[0], groupArgs[1], validFilter) : column.cf.toArray());
            // const allRawData = column.prevSeries && (allGroupArgs ? column.prevSeries.groupBy(...allGroupArgs) : column.prevSeries.toArray());
            // const allCFData = column.allCF && (groupArgs ? column.allCF.groupBy(groupArgs[0], groupArgs[1], validFilter) : column.allCF.toArray());
        }
        else {
            this.originData = column.series.toArray();
            this.cfData = column.cf && column.cf.toArray();
        }
    }

    paint() {
        const { width, height, margin, histogramType, column, k: key, drawLineChart, drawHandle } = this.props;
        const {rangeNotation, lineChart, marginBottom} = SubsetCFHist.layout;
        const histHeight = (height - rangeNotation - lineChart - marginBottom) / 2;
        const node = this.svgRef.current;
        if (node) {
            const root = d3.select(node);
            const originHistBase = getChildOrAppend<SVGGElement, SVGSVGElement>(root, "g", "origin-hist-base")
                .attr("transform", `translate(0, ${rangeNotation})`);;
            const originHistNode = originHistBase.node();
            if (originHistNode && this.originData) {
                drawGroupedHistogram(originHistNode,
                    this.originData,
                    undefined,
                    this.props.protoColumn && this.props.protoColumn.series.toArray(),
                    {
                        width,
                        margin,
                        height: histHeight,
                        mode: histogramType,
                        onHoverRange: this.onHoverRange,
                        onSelectRange: this.onSelectRange,
                        rangeSelector: "as-a-whole",
                        selectedRange: this.state.selectedRange,
                        drawBand: true,
                        bandValueFn: this.getGini,
                        key: `${key}-${column.name}-origin`,
                        xScale: this.getXScale(),
                        snapping: true,
                    });
                
            }
            else {
                throw Error("data empty");
            }
            if (drawHandle)
                this.drawHandle(node);

            const cfHistBase = getChildOrAppend<SVGGElement, SVGSVGElement>(root, "g", "cf-hist-base")
                .attr("transform", `translate(0, ${histHeight + rangeNotation})`);
            const cfHistNode = cfHistBase.node();
            if (cfHistNode && this.cfData)
                drawGroupedHistogram(cfHistNode,
                    this.cfData,
                    undefined,
                    this.props.protoColumn && this.props.protoColumn.series.toArray(),
                    {
                        width,
                        margin,
                        height: histHeight,
                        mode: histogramType,
                        direction: 'down',
                        color: i => defaultCategoricalColor(i ^ 1),
                        key: `${column.name}-cf`,
                        xScale: this.getXScale()
                    });

            const lineChartBase = getChildOrAppend<SVGGElement, SVGSVGElement>(root, "g", "line-chart-base")
                .attr("transform", `translate(${margin.left}, ${histHeight * 2 + rangeNotation})`);
            const lineChartNode = lineChartBase.node()
            if (drawLineChart && lineChartNode) {
                this.drawLineChart(lineChartNode);
            }

        }

        this.shouldPaint = false;
    }

    drawLineChart(root: SVGGElement) {
        const { width, height, margin, column, k: key } = this.props;
        // const lineChartBase = getChildOrAppend<SVGGElement, SVGSVGElement>(_root, "g", "line-chart-base")
        //     .attr("transform", `translate(${margin.left}, ${histHeight * 2})`);
        const lineChartBase = d3.select(root);
        const _width = width - margin.left - margin.right
        const x = this.getXScale();
        const y = d3.scaleLinear()
            .domain([0, 0.5])
            .range([0, 10]);
        const line = d3.line()
            .x(d => x(d[0]))
            .y(d => y(d[1]))
            .curve(d3.curveMonotoneX);
        const data: [number, number][] = _.range(0, _width, 5).map(d => x.invert(d)).map(x => [x, this.getGini(x)]);
        const svgDefs = getChildOrAppend(lineChartBase, 'defs', 'color-defs');
        const colorGradient = getChildOrAppend(svgDefs, 'linearGradient', 'color-gradient')
            .attr('id', `gini-gradient-${key}`)

        colorGradient.selectAll("stop")
            .data(data)
            .join<SVGStopElement>(enter => {
                return enter.append("stop")
                    .attr("class", "color-stops")
            })
            .attr("offset", d => (d[0] - x.domain()[0]) / (x.domain()[1] - x.domain()[0] + 0.000001))
            .attr("stop-color", d => d3.interpolateGreens(1 - d[1] * 2))

        getChildOrAppend(lineChartBase, "path", "line")
            .datum(data)
            .attr("d", line)
            .style("stroke", `url(#gini-gradient-${key})`);
    }

    drawHandle(root: SVGSVGElement) {
        const { margin, height } = this.props;
        const { selectedRange } = this.state;
        const { rangeNotation, lineChart, marginBottom } = SubsetCFHist.layout;
        const _root = d3.select(root);
        const x = this.getXScale();
        if (selectedRange) {
            const leftHandleBase = getChildOrAppend(_root, 'g', 'right-hand-base')
                .attr("transform", `translate(${margin.left + x(selectedRange[0])}, ${margin.top})`);
            getChildOrAppend(leftHandleBase, 'line', 'handle-line')
                .attr("x1", 0)
                .attr("x2", 0)
                .attr("y1", rangeNotation)
                .attr("y2", height - lineChart - marginBottom);

            getChildOrAppend(leftHandleBase, 'path', 'handle-icon')
                .attr("d", "M-3,0 L3,0 L0,5 z")
                .attr("transform", `translate(0, ${rangeNotation - 5})`);;

            getChildOrAppend(leftHandleBase, 'text', 'handle-text')
                .text(selectedRange[0])
                .attr("dy", 10)
                .attr("dx", -2);

            const rightHandleBase = getChildOrAppend(_root, 'g', 'left-hand-base')
                .attr("transform", `translate(${margin.left + x(selectedRange[1])}, ${margin.top})`);
            getChildOrAppend(rightHandleBase, 'line', 'handle-line')
                .attr("x1", 0)
                .attr("x2", 0)
                .attr("y1", rangeNotation)
                .attr("y2", height - lineChart - marginBottom);

            getChildOrAppend(rightHandleBase, 'path', 'handle-icon')
                .attr("d", "M-3,0 L3,0 L0,5 z")
                .attr("transform", `translate(0, ${rangeNotation - 5})`);;

            getChildOrAppend(rightHandleBase, 'text', 'handle-text')
                .text(selectedRange[1])
                .attr("dy", 10)
                .attr("dx", -5);
        }
    }

    getXScale() {
        const { column, width, margin } = this.props;
        return column.xScale || d3.scaleLinear()
            .domain(column.extent)
            .range([0, width - margin.left - margin.right]);
    }

    public render() {
        const { column, className, style, width, height, margin, onSelect, expandable } = this.props;
        const { selectedRange: hoveredBin } = this.state;

        const precision = decile2precision(Math.max.apply(null, column.series.toArray()), column.precision)

        return <div className={className} style={{ width, ...style }}>
            <div className={(className || "") + " histogram"} style={style}>
                <svg style={{ height: height, width: width }} ref={this.svgRef}>
                </svg>
            </div>
            {/* {expandable &&
                <Icon type="zoom-in" className='zoom-button' onClick={onSelect} />} */}
        </div>

    }

    _groupByArgs(): undefined | [number[], number[]] {
        const { groupByColumn } = this.props;
        return groupByColumn && getRowLabels(groupByColumn);
    }

    onHoverRange(hoveredBin?: [number, number]) {
        const bin = this._checkBins(hoveredBin);
        this.setState({ selectedRange: bin && [bin[0], bin[1]]});
    };

    onSelectRange(hoveredBin?: [number, number]) {
        const { onUpdateFilter, onSelect } = this.props;
        const bin = this._checkBins(hoveredBin);
        onUpdateFilter && onUpdateFilter(bin);
        // onSelect && onSelect();
        this.setState({ selectedRange: bin && [bin[0], bin[1]]});
    };

    private _checkPrecision(num: number): number {
        const precision = this.props.column.precision;

        if (precision !== undefined) {
            num = Math.round((num + Number.EPSILON) * 10 ** precision) / (10 ** precision);
        }
        return num;
    }

    private _checkBins(bin?: [number, number]): [number, number] | undefined {
        if (bin) {
            return [this._checkPrecision(bin[0]), this._checkPrecision(bin[1])];
        }
        else return bin
    }

    private getGini(x: number) {
        const { groupByColumn, column } = this.props;
        const data = column.series.toArray();
        const cf = column.cf?.toArray();
        const groupArgs = groupByColumn && getRowLabels(groupByColumn);
        const validFilter = column.valid && ((idx: number) => column.valid![idx]);

        // const geqValidFilter = validFilter && ((idx: number) => idx >= x && validFilter(idx));
        // const lessValidFilter = validFilter && ((idx: number) => idx < x && validFilter(idx));
        if (groupArgs) {
            const labels = groupArgs[0];
            const geqData: number[][] = [];
            const lessData: number[][] = [];
            groupArgs[1].forEach(d => { geqData[d] = []; lessData[d] = [] });
            data.forEach((d, i) => {
                if (validFilter === undefined || validFilter(i)) {
                    if (d >= x) geqData[labels[i]].push(d);
                    else lessData[labels[i]].push(d);
                }
            })
            cf && cf.forEach((d, i) => {
                if (validFilter === undefined || validFilter(i)) {
                    if (d >= x) geqData[labels[i] ^ 1].push(d);
                    else lessData[labels[i] ^ 1].push(d);
                }
            })
            const geqGini = gini(geqData);
            const lessGini = gini(lessData);
            const geqGroupCount = d3.sum(geqData.map(d => d.length));
            const lessGroupCount = d3.sum(lessData.map(d => d.length));

            const totalCount = (geqGroupCount + lessGroupCount);
            const ret = geqGroupCount / totalCount * geqGini + lessGroupCount / totalCount * lessGini;
            return ret;
        }
        else {
            return 0;
        }
    }

}
