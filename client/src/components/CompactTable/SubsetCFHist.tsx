import * as d3 from 'd3';
import * as React from 'react';
import * as _ from "lodash";
import memoizeOne from "memoize-one";


import { shallowCompare, number2string, decile2precision, assert } from '../../common/utils';
import { IMargin, defaultCategoricalColor, getChildOrAppend, defaultMarginBottom } from '../visualization/common';
import Histogram, { drawGroupedHistogram, getNBinsRange } from '../visualization/histogram';
import { CFNumericalColumn, CFCategoricalColumn, getRowLabels, getAllRowLabels, filterUndefined, CFTableColumn, isNumericalCFColumn, isArrays } from './common';
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
    drawAxis?: boolean;
}

export interface ISubsetCFHistProps extends SubsetChartProps {
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
    drawSankey: boolean;
}

export interface SankeyBins {
    x00: number,
    x01: number,
    x10: number,
    x11: number,
    count: number,
    topTotalCounts?: number,
    bottomTotalCounts?: number,
    topPrevCounts?: number,
    bottomPrevCounts?: number,
    catTopTotalCount?: number,
    catBottomTotalCount?: number,
    value?: number[]
}

export default class SubsetCFHist extends React.PureComponent<ISubsetCFHistProps, ISubsetCFHistState> {

    private originData?: number[] | number[][];
    private cfData?: number[] | number[][];
    private sankeyBins?: SankeyBins[][][];
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
        this.state = { selectedRange: column.dataRange, drawSankey: false };
        this.updateParams(props);

        this.onHoverRange = this.onHoverRange.bind(this);
        this.onSelectRange = this.onSelectRange.bind(this);
        this.paint = this.paint.bind(this);
        this.drawLineChart = this.drawLineChart.bind(this);
        this.drawHandle = this.drawHandle.bind(this);
        this.getGini = this.getGini.bind(this);
        this.getSankeyBins = this.getSankeyBins.bind(this);
        this.onSwitchLink = this.onSwitchLink.bind(this);
        this.shouldPaint = false;
    }

    componentDidMount() {
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

        this.sankeyBins = this.getSankeyBins();
        console.log(column.name, this.sankeyBins);
    }

    paint() {
        const { width, height, margin, histogramType, column, k: key, drawLineChart, drawHandle, drawAxis } = this.props;
        const { drawSankey } = this.state
        const { rangeNotation, lineChart, marginBottom } = SubsetCFHist.layout;
        const histHeight = (height - rangeNotation - lineChart - marginBottom - (drawSankey?20:3)) / 2;
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
                        drawAxis: drawAxis
                    });

            }
            else {
                throw Error("data empty");
            }
            if (drawHandle)
                this.drawHandle(node);
                
            const sankeyBase = getChildOrAppend<SVGGElement, SVGSVGElement>(root, "g", "cf-sankey-base")
                .attr("transform", `translate(${margin.left}, ${histHeight + rangeNotation + margin.top})`);
            const sankeyNode = sankeyBase.node();
            if (sankeyNode)
                this.drawSankey(sankeyNode);

            const cfHistBase = getChildOrAppend<SVGGElement, SVGSVGElement>(root, "g", "cf-hist-base")
                .attr("transform", `translate(0, ${histHeight + rangeNotation + (drawSankey?20:3)})`);
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
                .attr("transform", `translate(${margin.left}, ${histHeight * 2 + rangeNotation + (drawSankey?20:3)})`);
            const lineChartNode = lineChartBase.node()
            if (drawLineChart && lineChartNode) {
                this.drawLineChart(lineChartNode);
            }
            // const hint = getChildOrAppend(root, "g", "hint")
            //     .attr("transform", `translate(${width - 5}, ${margin.top + 5})`);
            // const r = getChildOrAppend(hint, "circle", "hint-outer")
            //     .attr("r", 5)
            // const c = getChildOrAppend(hint, "circle", "hint-inner")
            //     .attr("r", );
                

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

    getTicks() {
        const { protoColumn, column, width } = this.props;
        const dmcData = protoColumn ? protoColumn.series.toArray() : this.originData;
        const [min, max] = getNBinsRange(width, 7, 9);
        const tickNum = Math.min(max, Math.max(min, d3.thresholdSturges(_.flatten(dmcData))))
        const ticks = this.getXScale().ticks(tickNum);
        return ticks;
    }

    getSankeyBins() {
        const { column, groupByColumn } = this.props;
        const x = this.getXScale();
        const ticks = this.getTicks();
        const histogram = d3
            .histogram()
            .domain(x.domain() as [number, number])
            .thresholds(ticks);

        const originData = column.series.toArray();
        const cfData = column.cf?.toArray();
        const validArray: boolean[] = column.valid ? column.valid : _.range(originData.length).map(() => true);
        const labelArray: any[] | undefined = groupByColumn?.series.toArray();
        if (cfData) {

            if (groupByColumn && labelArray) {
                const bins: SankeyBins[][][] = groupByColumn.categories!.map((d, i) =>
                    _.range(ticks.length - 1).map((d, topIndex) =>
                        _.range(ticks.length - 1).map((d, bottomIndex) => ({
                            x00: ticks[topIndex],
                            x01: ticks[topIndex + 1],
                            x10: ticks[bottomIndex],
                            x11: ticks[bottomIndex + 1],
                            count: 0,
                            values: []
                        }))));
                _.range(originData.length).forEach((d, i) => {
                    if (!validArray[i]) return;
                    const catIndex = groupByColumn.categories!.indexOf(labelArray[i]);
                    const topBinIndex = ticks.indexOf(ticks.find(tick => tick >= originData[i])!);
                    const bottomBinIndex = ticks.indexOf(ticks.find(tick => tick >= cfData[i])!);
                    bins[catIndex][Math.max(topBinIndex - 1, 0)][Math.max(bottomBinIndex - 1, 0)].count += 1;
                });
                bins.forEach((binMat, i) => {
                    _.range(ticks.length - 1).forEach(topIndex => {
                        let topBinCount = 0;
                        _.range(ticks.length - 1).forEach(bottomIndex => {
                            binMat[topIndex][bottomIndex].topPrevCounts = topBinCount;
                            topBinCount += binMat[topIndex][bottomIndex].count;
                        })
                        _.range(ticks.length - 1).forEach(bottomIndex => {
                            binMat[topIndex][bottomIndex].topTotalCounts = topBinCount;
                        })
                    });
                    _.range(ticks.length - 1).forEach(bottomIndex => {
                        let bottomBinCount = 0;
                        _.range(ticks.length - 1).forEach(topIndex => {
                            binMat[topIndex][bottomIndex].topPrevCounts = bottomBinCount;
                            bottomBinCount += binMat[topIndex][bottomIndex].count;
                        })
                        _.range(ticks.length - 1).forEach(topIndex => {
                            binMat[topIndex][bottomIndex].topTotalCounts = bottomBinCount;
                        })
                    });
                })

                _.range(ticks.length - 1).forEach(topIndex => _.range(ticks.length - 1).forEach(bottomIndex => {
                    let catTopTotalCount = 0;
                    let catBottomTotalCount = 0;
                    _.range(groupByColumn.categories!.length).forEach((catIndex) => {
                        bins[catIndex][topIndex][bottomIndex].catTopTotalCount = catTopTotalCount;
                        catTopTotalCount += bins[catIndex][topIndex][bottomIndex].topTotalCounts!;

                        bins[catIndex][topIndex][bottomIndex].catBottomTotalCount = catBottomTotalCount;
                        catBottomTotalCount += bins[catIndex][topIndex][bottomIndex].catBottomTotalCount!;
                    })

                }))
                return bins;
            }
            return undefined

        }
        return undefined
    }

    drawSankey(root: SVGGElement) {
        const {width, margin} = this.props;
        const {drawSankey} = this.state;
        const _root = d3.select(root);
        const x = this.getXScale();
        const countMax = d3.max(_.flatten(_.flatten(this.sankeyBins)).map(d => d.count));
        const binWidth = (width - margin.left - margin.right) / (this.getTicks().length - 1) - 1;
        if (this.sankeyBins && drawSankey) {
            _root.selectAll("g.place-holder").remove()
            const linkCatGroup = _root.selectAll("g.link-cat-group")
                .data(this.sankeyBins)
                .join(enter => enter.append("g")
                    .attr("class", "link-cat-group"))
                // .attr("transform", (d, i) => `translate(${i*3}, 0)`)
                .style("stroke", (d, i) => defaultCategoricalColor(i));

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
                    const x0 = (x(d.x00)+x(d.x01))/2;
                    const x1 = (x(d.x10)+x(d.x11))/2;
                    const y0 = 0;
                    const y1 = 20;
                    return `M${x0},0 C${x0},${10} ${x1},${10} ${x1},20`;
                })
                // .attr("d", d => `M${x(d.x00)},0 L${x(d.x10)}, 20`)
                // .style("display", d => d.count > 0 && (d.x00 !== d.x10 || d.x01 !== d.x11)?"block": "none")
                .style("display", d => d.count > 0 ? "block" : "none")
                // .style("opacity", d => d.topTotalCounts ? d.count / d.topTotalCounts : 1)
                // .style("stroke-width", d => countMax ? d.count / countMax * 3 : 1);
                .style("opacity", d => countMax ? d.count / countMax : 1)
                .style("stroke-width", d => d.topTotalCounts ? d.count / d.topTotalCounts * 3 : 1)
                // .style("stroke-width", d => 1)
                .style("fill", "none");
            const base = getChildOrAppend(_root, "rect", "link-base")
                .attr("width", (width - margin.left - margin.right))
                .attr("height", 20)
                .style("opacity", 0)
                .on("click", this.onSwitchLink);
        }
        else {
            _root.selectAll("g.link-cat-group").remove();
            const placeHolder = getChildOrAppend(_root, "g", "place-holder")
            getChildOrAppend(placeHolder, "rect", "place-holder")
                .attr("width", (width - margin.left - margin.right))
                .attr("height", 3)
                .style("opacity", 0)
                .on("click", this.onSwitchLink)
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

    onSwitchLink(){
        const {drawSankey} = this.state;
        this.setState({drawSankey: !drawSankey});
    }

    _groupByArgs(): undefined | [number[], number[]] {
        const { groupByColumn } = this.props;
        return groupByColumn && getRowLabels(groupByColumn);
    }

    onHoverRange(hoveredBin?: [number, number]) {
        const bin = this._checkBins(hoveredBin);
        this.setState({ selectedRange: bin && [bin[0], bin[1]] });
    };

    onSelectRange(hoveredBin?: [number, number]) {
        const { onUpdateFilter, onSelect } = this.props;
        const bin = this._checkBins(hoveredBin);
        onUpdateFilter && onUpdateFilter(bin);
        // onSelect && onSelect();
        this.setState({ selectedRange: bin && [bin[0], bin[1]] });
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

    private getGeneralGini(x: number[]) {
        const { groupByColumn, column } = this.props;
        const data = column.series.toArray();
        const cf = column.cf?.toArray();
        const groupArgs = groupByColumn && getRowLabels(groupByColumn);
        const validFilter = column.valid && ((idx: number) => column.valid![idx]);

        if (x[0] > column.extent[0]) {
            x.splice(0, 0, column.extent[0]);
        }
        if (x[1] < column.extent[1]){
            x.push(column.extent[1]);
        }
        const bins = _.range(x.length-1);
    }

}
