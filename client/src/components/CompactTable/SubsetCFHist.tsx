import * as d3 from 'd3';
import * as React from 'react';
import * as _ from "lodash";
import memoizeOne from "memoize-one";


import { shallowCompare, number2string, decile2precision, assert } from '../../common/utils';
import { IMargin, defaultCategoricalColor, getChildOrAppend, defaultMarginBottom, defaultMarginRight } from '../visualization/common';
import Histogram, { drawGroupedHistogram, getNBinsRange } from '../visualization/histogram';
import { CFNumericalColumn, CFCategoricalColumn, getRowLabels, getAllRowLabels, filterUndefined, CFTableColumn, isNumericalCFColumn, isArrays } from './common';
import { gini } from 'common/science';
import { Icon } from 'antd';
import { drawLink } from '../visualization/link'
import { runInThisContext } from 'vm';
import { columnMargin } from 'components/Table';

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
    focusedCategory?: number;
    drawAxis?: boolean;
    selected: boolean;
    layout?: 'header' | 'subset';
    color?: (x: number) => string;
    onSelect?: () => void;
    expandable: boolean;
}

export interface ISubsetCFHistProps extends SubsetChartProps {
    column: CFNumericalColumn;
    protoColumn?: CFNumericalColumn;

    onUpdateFilter?: (extent?: [number, number], categories?: string[]) => void;
    onUpdateCFFilter?: (extent?: [number, number]) => void;
    histogramType: 'side-by-side' | 'stacked';
    drawLineChart?: boolean;
    drawHandle?: boolean;
}

export interface ISubsetCFHistState {
    selectedRange?: [number, number];
    selectedCFRange?: [number, number];
    drawSankey: boolean;
    drawTooltip: boolean;
}

export interface SankeyBins<T> {
    x00: T,
    x01: T,
    x10: T,
    x11: T,
    count: number,
    topTotalCounts?: number,
    bottomTotalCounts?: number,
    topPrevCounts?: number,
    bottomPrevCounts?: number,
    catTopTotalCount?: number,
    catBottomTotalCount?: number,
    value?: T[]
}

export default class SubsetCFHist extends React.PureComponent<ISubsetCFHistProps, ISubsetCFHistState> {

    private originData?: number[][];
    private cfData?: number[][];
    private allOriginData?: number[][];
    private allCfData?: number[][];
    private sankeyBins?: SankeyBins<number>[][][];
    private svgRef: React.RefObject<SVGSVGElement> = React.createRef();
    private shouldPaint: boolean;
    static subsetLayout = {
        rangeNotation: 20,
        lineChart: 10,
        marginBottom: 10,
    }
    static headerLayout = {
        // rangeNotation: 20,
        axisBottom: 15,
        marginBottom: 10,
    }

    constructor(props: ISubsetCFHistProps) {
        super(props);
        const { column } = this.props;
        this.state = { selectedRange: column.dataRange, drawSankey: false, drawTooltip: false };
        this.updateParams(props);

        this.onHoverRange = this.onHoverRange.bind(this);
        this.onSelectRange = this.onSelectRange.bind(this);
        this.onSelectCFRange = this.onSelectCFRange.bind(this);
        this.paint = this.paint.bind(this);
        this.drawLineChart = this.drawLineChart.bind(this);
        this.drawHandle = this.drawHandle.bind(this);
        this.getGini = this.getGini.bind(this);
        this.getSankeyBins = this.getSankeyBins.bind(this);
        this.onSwitchLink = this.onSwitchLink.bind(this);
        this.onHover = this.onHover.bind(this);
        this.onMouseLeave = this.onMouseLeave.bind(this);

        this.shouldPaint = false;
    }

    componentDidMount() {
        this.updateParams(this.props);
        this.paint();
    }

    componentDidUpdate(prevProps: ISubsetCFHistProps) {
        this.updateParams(this.props);

        // if (this.props.column !== prevProps.column) {
        //     this.setState({selectedRange: undefined, selectedCFRange: undefined});
        // }
        // console.log(this.props.column.dataRange);

        this.shouldPaint = true;
        const delayedPaint = () => {
            if (this.shouldPaint) this.paint();
        };
        window.setTimeout(delayedPaint, 100);
        // this.setState({...this.state, selectedRange: this.props.column.dataRange});
    }

    // shouldComponentUpdate(prevProps: ISubsetCFHistProps, prevState: ISubsetCFHistState){
    //     return prevProps.column !== this.props.column || this.state !== prevState || this.props !== prevProps;
    // }

    protected updateParams(props: ISubsetCFHistProps) {
        const { column, protoColumn, groupByColumn, layout, focusedCategory } = this.props;


        const groupArgs = groupByColumn && getRowLabels(groupByColumn);

        // const validFilter = column.selectedValid && ((idx: number) => column.selectedValid![idx]);
        // this.originData = groupArgs ? column.series.groupBy(groupArgs[0], groupArgs[1], validFilter) : [column.series.toArray()];
        // this.cfData = column.cf && (groupArgs ? column.cf.groupBy(groupArgs[0], groupArgs[1], validFilter) : [column.cf.toArray()]);

        if (layout && layout === 'header') {
            // const validFilter = column.selectedValid && ((idx: number) => column.selectedValid![idx]);
            this.originData = groupArgs ? column.series.groupBy(groupArgs[0], groupArgs[1]) : [column.series.toArray()];
            this.cfData = column.cf && (groupArgs ? column.cf.groupBy(groupArgs[0], groupArgs[1]) : [column.cf.toArray()]);
            // const allValidFilter = column.valid && ((idx: number) => column.valid![idx]);
            const allValidFilter = column.valid && ((idx: number) => true);
            const allGroupArgs = groupByColumn && getAllRowLabels(groupByColumn);
            this.allOriginData = column.prevSeries && (allGroupArgs ? column.prevSeries.groupBy(allGroupArgs[0], allGroupArgs[1], allValidFilter) : [column.prevSeries.toArray()]);
            this.allCfData = column.allCF && (allGroupArgs ? column.allCF.groupBy(allGroupArgs[0], allGroupArgs[1], allValidFilter) : [column.allCF.toArray()]);
        }
        else {
            const validFilter = column.selectedValid && ((idx: number) => column.selectedValid![idx]);
            this.originData = groupArgs ? column.series.groupBy(groupArgs[0], groupArgs[1], validFilter) : [column.series.toArray()];
            this.cfData = column.cf && (groupArgs ? column.cf.groupBy(groupArgs[0], groupArgs[1], validFilter) : [column.cf.toArray()]);
            this.allOriginData = groupArgs ? column.series.groupBy(groupArgs[0], groupArgs[1]) : [column.series.toArray()];
            this.allCfData = column.cf && (groupArgs ? column.cf.groupBy(groupArgs[0], groupArgs[1]) : [column.cf.toArray()]);
        }

        if (!this.dataEmpty())
            this.sankeyBins = this.getSankeyBins();

        if (focusedCategory !== undefined) {
            const index = focusedCategory;
            if (index !== undefined) {
                this.originData = this.originData && [this.originData[index]];
                this.cfData = this.cfData && [this.cfData[index]];
                this.allOriginData = this.allOriginData && [this.allOriginData[index]];
                this.allCfData = this.allCfData && [this.allCfData[index]];
            }
            else {
                throw Error(`focusing category invalid: ${focusedCategory}, which should be in ${groupByColumn?.categories}`)
            }
        }
    }

    dataEmpty() {
        return this.allOriginData && _.flatten(this.allOriginData).length === 0;
    }

    paint() {
        const { width, height, margin, histogramType, column, k: key, drawLineChart, drawHandle, drawAxis, layout } = this.props;
        const { drawSankey } = this.state
        // const { rangeNotation, lineChart, marginBottom } = SubsetCFHist.subsetLayout;
        const node = this.svgRef.current;
        const color = this.props.color || defaultCategoricalColor;
        if (node) {
            const root = d3.select(node);
            const originHistBase = getChildOrAppend<SVGGElement, SVGSVGElement>(root, "g", "origin-hist-base")
                .attr("transform", `translate(0, ${this.originHistY})`);;
            const originHistNode = originHistBase.node();
            if (originHistNode && this.originData && !this.dataEmpty()) {
                drawGroupedHistogram(originHistNode,
                    this.originData,
                    this.allOriginData,
                    // this.props.protoColumn && this.props.protoColumn.series.toArray(),
                    undefined,
                    {
                        width,
                        margin,
                        height: this.histHeight,
                        mode: histogramType,
                        onHoverRange: this.onHoverRange,
                        onSelectRange: this.onSelectRange,
                        rangeSelector: layout === 'header' ? 'bin-wise' : "as-a-whole",
                        selectedRange: this.state.selectedRange,
                        drawBand: true,
                        bandValueFn: this.getGini,
                        key: `${key}-${column.name}-origin`,
                        xScale: this.getXScale(),
                        ticks: this.getTicks(),
                        snapping: true,
                        drawAxis: drawAxis,
                        twisty: layout === 'header' ? 0 : this.getTwisty(),
                        color: color
                    });

            }
            if (drawHandle)
                this.drawHandle(node);

            const sankeyBase = getChildOrAppend<SVGGElement, SVGSVGElement>(root, "g", "cf-sankey-base")
                .attr("transform", `translate(${margin.left}, ${this.histHeight + this.originHistY})`);
            const sankeyNode = sankeyBase.node();
            if (sankeyNode && !this.dataEmpty())
                this.drawSankey(sankeyNode);

            const cfHistBase = getChildOrAppend<SVGGElement, SVGSVGElement>(root, "g", "cf-hist-base")
                .attr("transform", `translate(0, ${this.histHeight + this.originHistY + (drawSankey ? 20 : 3)})`);
            const cfHistNode = cfHistBase.node();
            if (cfHistNode && this.cfData && !this.dataEmpty())
                drawGroupedHistogram(cfHistNode,
                    this.cfData,
                    this.allCfData,
                    // this.props.protoColumn && this.props.protoColumn.series.toArray(),
                    undefined,
                    {
                        width,
                        margin,
                        height: this.histHeight,
                        mode: histogramType,
                        direction: 'down',
                        color: i => color(i ^ 1),
                        key: `${column.name}-cf`,
                        xScale: this.getXScale(),
                        ticks: this.getTicks(),
                        snapping: true,
                        onSelectRange: this.onSelectCFRange,
                        rangeSelector: this.props.onUpdateCFFilter ? "bin-wise" : undefined,
                        selectedRange: this.state.selectedCFRange,
                    });

            if (!this.dataEmpty()) {
                if (layout === 'header') {
                    const axisBase = getChildOrAppend<SVGGElement, SVGSVGElement>(root, "g", "line-chart-base")
                        .attr("transform", `translate(${margin.left}, ${this.histHeight * 2 + this.originHistY + (drawSankey ? 20 : 3)})`);
                    const bottomAxis = d3.axisBottom(this.getXScale()).ticks(this.getTicks().length / 2);
                    axisBase.call(bottomAxis);
                }
                else {
                    const lineChartBase = getChildOrAppend<SVGGElement, SVGSVGElement>(root, "g", "line-chart-base")
                        .attr("transform", `translate(${margin.left}, ${this.histHeight * 2 + this.originHistY + (drawSankey ? 20 : 3)})`);
                    const lineChartNode = lineChartBase.node()
                    if (drawLineChart && lineChartNode) {
                        this.drawLineChart(lineChartNode);
                    }
                }
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
        const { rangeNotation, lineChart, marginBottom } = SubsetCFHist.subsetLayout;
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

    getYScale() {
        const { margin } = this.props
        const ticks = this.getTicks();
        const x = this.getXScale();
        const histHeight = this.histHeight;
        const histogram = d3
            .histogram()
            .domain(x.domain() as [number, number])
            .thresholds(ticks);
        const bins = this.allOriginData ? this.allOriginData.map(d => histogram(d)) : this.originData?.map(d => histogram(d));
        if (bins) {
            const ymax = d3.max(_.flatten(bins).map(d => d.length));
            if (ymax)
                return d3.scaleLinear()
                    .domain([0, ymax])
                    .range([0, histHeight - margin.top - margin.bottom]);
        }
    }

    get histHeight() {
        const { height, layout } = this.props;
        const { drawSankey } = this.state;
        if (layout === 'header') {
            const { axisBottom, marginBottom } = SubsetCFHist.headerLayout;
            return (height - axisBottom - marginBottom - (drawSankey ? 20 : 3)) / 2;
        }
        else {
            const { rangeNotation, lineChart, marginBottom } = SubsetCFHist.subsetLayout
            return (height - rangeNotation - lineChart - marginBottom - (drawSankey ? 20 : 3)) / 2;
        }
    }

    get originHistY() {
        const { rangeNotation } = SubsetCFHist.subsetLayout;
        const { layout } = this.props;
        if (layout === 'header') {
            return 0
        }
        else {
            return rangeNotation;
        }
    }

    getTicks() {
        const { protoColumn, column, width, histogramType } = this.props;
        const dmcData = protoColumn ? protoColumn.series.toArray() : this.originData;
        const [min, max] = (histogramType === 'side-by-side' && this.originData!.length > 1) ? getNBinsRange(width, 10, 16) : getNBinsRange(width, 7, 9);
        const tickNum = Math.min(max, Math.max(min, d3.thresholdSturges(_.flatten(dmcData))))
        const ticks = this.getXScale().ticks(tickNum);
        return ticks;
    }

    getTwisty() {
        const range = this.state.selectedRange;
        if (this.originData && this.cfData && range) {
            const posNum = this.originData[0] ? this.originData[0].length : 0 + (this.cfData[1] ? this.cfData[1].filter(d => (d >= range[0] && d < range[1])).length : 0);
            const negNum = this.originData[1] ? this.originData[1].length : 0 + (this.cfData[0] ? this.cfData[0].filter(d => (d >= range[0] && d < range[1])).length : 0);
            const totalCount = posNum + negNum;
            return 1 - (posNum / totalCount) ** 2 - (negNum / totalCount) ** 2;
        }
        else {
            console.debug(this.originData, this.cfData, range);
            return 0;
        }
    }

    getSankeyBins() {
        const { column, groupByColumn, focusedCategory } = this.props;
        const x = this.getXScale();
        const ticks = this.getTicks();
        const histogram = d3
            .histogram()
            .domain(x.domain() as [number, number])
            .thresholds(ticks);

        const originData = column.series.toArray();
        const cfData = column.cf?.toArray();
        const validArray: boolean[] = column.selectedValid ? column.selectedValid : _.range(originData.length).map(() => true);
        const labelArray: any[] | undefined = groupByColumn?.series.toArray();
        if (cfData) {

            if (groupByColumn && labelArray) {
                const bins: SankeyBins<number>[][][] = groupByColumn.categories!.map((d, i) =>
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
                            binMat[topIndex][bottomIndex].bottomTotalCounts = bottomBinCount;
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
                return focusedCategory !== undefined ? [bins[focusedCategory]] : bins;
            }
            return undefined

        }
        return undefined
    }

    drawSankey(root: SVGGElement) {
        const { width, margin, histogramType, focusedCategory } = this.props;
        const { drawSankey } = this.state;
        if (this.sankeyBins)
            drawLink(root, this.sankeyBins, {
                height: 20,
                width: width,
                margin: margin,
                histogramType: focusedCategory === undefined ? histogramType : 'stacked',
                collapsed: !drawSankey,
                xScale: this.getXScale(),
                binWidth: this.binWidth,
                onSwitch: this.onSwitchLink,
                color: this.props.color,
            })
    }

    get binWidth() {
        const { width, margin, histogramType } = this.props;
        const groupWidth = (width - margin.left - margin.right) / (this.getTicks().length - 1) - 2;
        return histogramType === 'side-by-side' ? (groupWidth / this.originData!.length - 1) : groupWidth;
    }

    public render() {
        const { column, className, style, width, height, margin, onSelect, expandable, selected } = this.props;
        const { drawTooltip } = this.state;

        return <div className={className} style={{ width, ...style }} onMouseOver={this.onHover} onMouseLeave={this.onMouseLeave}>
            <div className={(className || "") + " histogram" + (selected ? " selected-column" : "")} style={style}>
                <svg style={{ height: height - 5, width: width }} ref={this.svgRef}>
                </svg>
            </div>
            {drawTooltip &&
                <Icon type="zoom-in" className='zoom-button' onClick={onSelect} />}
        </div>

    }

    onHover() {
        if (this.props.expandable)
            this.setState({ drawTooltip: true })
    }

    onMouseLeave() {
        this.setState({ drawTooltip: false })
    }

    onSwitchLink() {
        const { drawSankey } = this.state;
        this.setState({ drawSankey: !drawSankey });
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
        const { onUpdateFilter } = this.props;
        const bin = this._checkBins(hoveredBin);
        onUpdateFilter && onUpdateFilter(bin);
        // onSelect && onSelect();
        this.setState({ selectedRange: bin && [bin[0], bin[1]] });
    };

    onSelectCFRange(hoveredBin?: [number, number]) {
        const { onUpdateCFFilter } = this.props;
        const bin = this._checkBins(hoveredBin);
        onUpdateCFFilter && onUpdateCFFilter(bin);
        // onSelect && onSelect();
        this.setState({ selectedCFRange: bin && [bin[0], bin[1]] });
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
        const validFilter = column.selectedValid && ((idx: number) => column.selectedValid![idx]);

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
        const validFilter = column.selectedValid && ((idx: number) => column.selectedValid![idx]);

        if (x[0] > column.extent[0]) {
            x.splice(0, 0, column.extent[0]);
        }
        if (x[1] < column.extent[1]) {
            x.push(column.extent[1]);
        }
        const bins = _.range(x.length - 1);
    }

}
