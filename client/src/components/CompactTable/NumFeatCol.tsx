import * as d3 from 'd3';
import * as React from 'react';
import * as _ from "lodash";
import memoizeOne from "memoize-one";


import { IMargin, defaultCategoricalColor, getChildOrAppend, defaultMarginBottom, defaultMarginRight } from '../visualization/common';
import Histogram, { drawGroupedHistogram, getNBinsRange } from '../visualization/Histogram';
import { getRowLabels, FeatureColumnProps, SankeyBins } from './common';
import { gini } from 'common/science';
import { Icon } from 'antd';
import { drawLink } from '../visualization/link'
import { columnMargin, NumTableColumn, CatTableColumn, TableColumn } from 'components/Table';

export interface NumFeatColProps extends FeatureColumnProps {
    column: NumTableColumn;
    CFColumn: NumTableColumn;
    protoColumn?: NumTableColumn;

    histogramType: 'side-by-side' | 'stacked';
    drawAxis?: boolean;
}

export interface NumHeaderFeatColProps extends NumFeatColProps {
    allColumn: NumTableColumn;
    allCFColumn: NumTableColumn;
    allLabelColumn: Readonly<CatTableColumn>;

    onUpdateFilter?: (extent?: [number, number]) => void;
    onUpdateCFFilter?: (extent?: [number, number]) => void;
}

export interface NumSubsetFeatColProps extends NumFeatColProps {
    selectedRange: [number, number];
    onUpdateSelectedRange?: (extent?: [number, number]) => void;

    selected: boolean;
    onSelect?: () => void;
}

export interface NumFeatColState { }

export interface NumHeaderFeatColState extends NumFeatColState { }

export interface NumSubsetFeatColState extends NumFeatColState {
    selectedRange?: [number, number];
    drawSankey: boolean;
    drawTooltip: boolean;
}

export class NumFeatCol<P extends NumFeatColProps, V extends NumFeatColState> extends React.PureComponent<P, V> {
    protected originData?: number[][];
    protected cfData?: number[][];
    protected svgRef: React.RefObject<SVGSVGElement> = React.createRef();
    protected shouldPaint: boolean;


    constructor(props: P) {
        super(props);


        this.paint = this.paint.bind(this);
        this.updateParams(props);
        this.shouldPaint = false;
    }

    static getHeight(histHeight: number) {
        return histHeight * 2 + 3;
    }

    protected updateParams(props: P) {
        const { column, CFColumn, labelColumn, focusedCategory, validFilter } = props;

        const groupArgs = getRowLabels(labelColumn);
        this.originData = column.series.groupBy(groupArgs[0], groupArgs[1], validFilter);
        this.cfData = CFColumn.series.groupBy(groupArgs[0], groupArgs[1], validFilter);

        if (focusedCategory !== undefined) {
            const index = focusedCategory;
            if (index !== undefined) {
                this.originData = this.originData && [this.originData[index]];
                this.cfData = this.cfData && [this.cfData[index]];
            }
            else {
                throw Error(`focusing category invalid: ${focusedCategory}, which should be in ${labelColumn?.categories}`)
            }
        }
    }

    dataEmpty() {
        return this.originData && _.flatten(this.originData).length === 0;
    }

    componentDidMount() {
        this.updateParams(this.props);
        this.paint();
    }

    componentDidUpdate(prevProps: P) {
        this.updateParams(this.props);

        this.shouldPaint = true;
        const delayedPaint = () => {
            if (this.shouldPaint) this.paint();
        };
        window.setTimeout(delayedPaint, 100);
    }

    paint() {
        const { width, histHeight, margin, histogramType, column, k: key, drawAxis } = this.props;
        const node = this.svgRef.current;
        const color = this.props.color || defaultCategoricalColor;
        if (!node || this.dataEmpty()) {
            this.shouldPaint = false;
            return
        }
        const root = d3.select(node);
        const originHistBase = getChildOrAppend<SVGGElement, SVGSVGElement>(root, "g", "origin-hist-base")
            .attr("transform", `translate(0, 0)`);
        const originHistNode = originHistBase.node();
        if (originHistNode && this.originData) {
            drawGroupedHistogram({
                root: originHistNode,
                data: this.originData,
                options: {
                    width,
                    margin,
                    height: histHeight,
                    mode: histogramType,
                    rangeSelector: 'bin-wise',
                    drawBand: true,
                    key: `${key}-${column.name}-origin`,
                    xScale: this.getXScale(),
                    ticks: this.getTicks(),
                    snapping: true,
                    drawAxis: drawAxis,
                    twisty: 0,
                    color: color
                }
            });
        }
        const cfHistBase = getChildOrAppend<SVGGElement, SVGSVGElement>(root, "g", "cf-hist-base")
            .attr("transform", `translate(0, ${histHeight + 3})`);
        const cfHistNode = cfHistBase.node();
        if (cfHistNode && this.cfData)
            drawGroupedHistogram({
                root: cfHistNode,
                data: this.cfData,
                options: {
                    width,
                    margin,
                    height: histHeight,
                    mode: histogramType,
                    direction: 'down',
                    color: i => color!(i ^ 1),
                    key: `${column.name}-cf`,
                    xScale: this.getXScale(),
                    ticks: this.getTicks(),
                    snapping: true,
                }
            });

        this.shouldPaint = false;
    }

    getXScale() {
        const { column, width, margin } = this.props;
        return column.xScale || d3.scaleLinear()
            .domain(column.extent)
            .range([0, width - margin.left - margin.right]);
    }

    getYScale() {
        const { margin, histHeight } = this.props
        const ticks = this.getTicks();
        const x = this.getXScale();
        const histogram = d3
            .histogram()
            .domain(x.domain() as [number, number])
            .thresholds(ticks);
        const bins = this.originData?.map(d => histogram(d));
        if (bins) {
            const ymax = d3.max(_.flatten(bins).map(d => d.length));
            if (ymax)
                return d3.scaleLinear()
                    .domain([0, ymax])
                    .range([0, histHeight - margin.top - margin.bottom]);
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


    public render() {
        const { column, className, style, width, histHeight, margin } = this.props;
        // const { drawTooltip } = this.state;

        return <div className={className} style={{ width, ...style }} >
            <div className={(className || "") + " histogram"} style={style}>
                <svg style={{ height: NumFeatCol.getHeight(histHeight), width: width }} ref={this.svgRef}>
                </svg>
            </div>
        </div>

    }

    _groupByArgs(): undefined | [number[], number[]] {
        const { labelColumn: groupByColumn } = this.props;
        return groupByColumn && getRowLabels(groupByColumn);
    }

    protected _checkPrecision(num: number): number {
        const precision = this.props.column.precision;

        if (precision !== undefined) {
            num = Math.round((num + Number.EPSILON) * 10 ** precision) / (10 ** precision);
        }
        return num;
    }

    protected _checkBins(bin?: [number, number]): [number, number] | undefined {
        if (bin) {
            return [this._checkPrecision(bin[0]), this._checkPrecision(bin[1])];
        }
        else return bin
    }

}

export class NumHeaderFeatCol extends NumFeatCol<NumHeaderFeatColProps, NumHeaderFeatColState> {
    static layout = { axisHeight: 25 };

    private allOriginData?: number[][];
    private allCfData?: number[][];

    constructor(props: NumHeaderFeatColProps) {
        super(props);
        this.onSelectRange = this.onSelectRange.bind(this);
        this.onSelectCFRange = this.onSelectCFRange.bind(this);
        this.updateParams(props);

        this.shouldPaint = false;
    }

    static getHeight(histHeight: number) {
        return histHeight * 2 + 3 + NumHeaderFeatCol.layout.axisHeight;
    }

    protected updateParams(props: NumHeaderFeatColProps) {
        const { column, CFColumn, allColumn, allCFColumn, labelColumn, allLabelColumn, focusedCategory, validFilter } = this.props;


        const groupArgs = getRowLabels(labelColumn);
        this.originData = column.series.groupBy(...groupArgs);
        this.cfData = CFColumn.series.groupBy(...groupArgs);

        const allGroupArgs = getRowLabels(allLabelColumn);
        this.allOriginData = allColumn.series.groupBy(...allGroupArgs);
        this.allCfData = allCFColumn.series.groupBy(...allGroupArgs);

        if (focusedCategory !== undefined) {
            const index = focusedCategory;
            if (index !== undefined) {
                this.originData = this.originData && [this.originData[index]];
                this.cfData = this.cfData && [this.cfData[index]];
                this.allOriginData = this.allOriginData && [this.allOriginData[index]];
                this.allCfData = this.allCfData && [this.allCfData[index]];
            }
            else {
                throw Error(`focusing category invalid: ${focusedCategory}, which should be in ${allLabelColumn?.categories}`)
            }
        }
    }

    paint() {
        const { width, histHeight, margin, histogramType, column, CFColumn, k: key, drawAxis } = this.props;
        // const { rangeNotation, lineChart, marginBottom } = SubsetCFHist.subsetLayout;
        const node = this.svgRef.current;
        const color = this.props.color || defaultCategoricalColor;
        if (!node || this.dataEmpty()) {
            this.shouldPaint = false;
            return;
        }
        const root = d3.select(node);
        const originHistBase = getChildOrAppend<SVGGElement, SVGSVGElement>(root, "g", "origin-hist-base");
        const originHistNode = originHistBase.node();
        if (originHistNode && this.originData) {
            drawGroupedHistogram({
                root: originHistNode,
                data: this.originData,
                allData: this.allOriginData,
                // this.props.protoColumn && this.props.protoColumn.series.toArray(),
                options: {
                    width,
                    margin,
                    height: histHeight,
                    mode: histogramType,
                    // onHoverRange: this.onHoverRange,
                    onSelectRange: this.onSelectRange,
                    rangeSelector: 'bin-wise',
                    selectedRange: column.filter,
                    drawBand: true,
                    key: `${key}-${column.name}-origin`,
                    xScale: this.getXScale(),
                    ticks: this.getTicks(),
                    snapping: true,
                    drawAxis: drawAxis,
                    color: color
                }
            });

        }

        const cfHistBase = getChildOrAppend<SVGGElement, SVGSVGElement>(root, "g", "cf-hist-base")
            .attr("transform", `translate(0, ${histHeight + 3})`);
        const cfHistNode = cfHistBase.node();
        if (cfHistNode && this.cfData)
            drawGroupedHistogram({
                root: cfHistNode,
                data: this.cfData,
                allData: this.allCfData,
                // this.props.protoColumn && this.props.protoColumn.series.toArray(),
                options: {
                    width,
                    margin,
                    height: histHeight,
                    mode: histogramType,
                    direction: 'down',
                    color: i => color(i ^ 1),
                    key: `${column.name}-cf`,
                    xScale: this.getXScale(),
                    ticks: this.getTicks(),
                    snapping: true,
                    onSelectRange: this.onSelectCFRange,
                    rangeSelector: this.props.onUpdateCFFilter ? "bin-wise" : undefined,
                    selectedRange: CFColumn.filter,
                }
            });

        const axisBase = getChildOrAppend<SVGGElement, SVGSVGElement>(root, "g", "axis-base")
            .attr("transform", `translate(${margin.left}, ${histHeight * 2 + 3})`);
        const bottomAxis = d3.axisBottom(this.getXScale()).ticks(this.getTicks().length / 2);
        axisBase.call(bottomAxis);
        this.shouldPaint = false;

    }

    public render() {
        const { column, className, style, width, histHeight, margin } = this.props;
        // const { drawTooltip } = this.state;

        return <div className={className} style={{ width, ...style }} >
            <div className={(className || "") + " histogram"} style={style}>
                <svg style={{ height: NumHeaderFeatCol.getHeight(histHeight), width: width }} ref={this.svgRef}>
                </svg>
            </div>
        </div>

    }

    onSelectRange(hoveredBin?: [number, number]) {
        const { onUpdateFilter } = this.props;
        const bin = this._checkBins(hoveredBin);
        onUpdateFilter && onUpdateFilter(bin);
    };

    onSelectCFRange(hoveredBin?: [number, number]) {
        const { onUpdateCFFilter } = this.props;
        const bin = this._checkBins(hoveredBin);
        onUpdateCFFilter && onUpdateCFFilter(bin);
    };
}

export class NumSubsetFeatCol extends NumFeatCol<NumSubsetFeatColProps, NumSubsetFeatColState> {
    static layout = { handleAnn: 20, lineHeight: 10, innerMarginBottom: 10, sankeyHeight: 20 };

    private allOriginData?: number[][];
    private allCfData?: number[][];
    protected sankeyBins?: SankeyBins<number>[][][];

    static getHeight(histHeight: number) {
        const { handleAnn, lineHeight, innerMarginBottom } = NumSubsetFeatCol.layout
        return histHeight * 2 + 3 + handleAnn + lineHeight + innerMarginBottom;
    }

    constructor(props: NumSubsetFeatColProps) {
        super(props);

        const { selectedRange } = this.props;
        this.state = { drawSankey: false, drawTooltip: false, selectedRange };
        this.updateParams(props);

        this.onHoverRange = this.onHoverRange.bind(this);
        this.onSelectRange = this.onSelectRange.bind(this);
        this.drawLineChart = this.drawLineChart.bind(this);
        this.drawHandle = this.drawHandle.bind(this);
        this.getGini = this.getGini.bind(this);
        this.getSankeyBins = this.getSankeyBins.bind(this);
        this.onSwitchLink = this.onSwitchLink.bind(this);
        this.onHover = this.onHover.bind(this);
        this.onMouseLeave = this.onMouseLeave.bind(this);

        this.shouldPaint = false;
    }

    public componentWillReceiveProps(nextProps: NumSubsetFeatColProps){
        // new props
        if (nextProps != this.props) {
            const { selectedRange } = nextProps;
            this.setState({ drawSankey: false, drawTooltip: false, selectedRange });
            this.updateParams(this.props);
        }
    }

    protected updateParams(props: NumSubsetFeatColProps) {
        const { column, CFColumn, labelColumn, focusedCategory, validFilter } = props;


        const groupArgs = getRowLabels(labelColumn);
        // const validFilter = (idx: number) => column.series.at(idx) !== CFColumn.series.at(idx);
        this.originData = column.series.groupBy(groupArgs[0], groupArgs[1], validFilter);
        this.cfData = CFColumn.series.groupBy(groupArgs[0], groupArgs[1], validFilter);
        this.allOriginData = column.series.groupBy(groupArgs[0], groupArgs[1]);
        this.allCfData = CFColumn.series.groupBy(groupArgs[0], groupArgs[1]);

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
                throw Error(`focusing category invalid: ${focusedCategory}, which should be in ${labelColumn?.categories}`)
            }
        }
    }

    getSankeyBins() {
        const { column, CFColumn, labelColumn: groupByColumn, focusedCategory } = this.props;
        const ticks = this.getTicks();

        const originData = column.series.toArray();
        const cfData = CFColumn.series.toArray();
        const validArray: boolean[] = _.range(originData.length).map((d) => originData[d] !== cfData[d]);
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

    get impurity() {
        const { selectedRange: range } = this.state;
        if (this.originData && this.cfData && range) {
            const posNum = (this.originData[0] ? this.originData[0].length : 0) 
                + (this.cfData[1] ? this.cfData[1].filter(d => (d >= range[0] && d < range[1])).length : 0);
            const negNum = (this.originData[1] ? this.originData[1].length : 0) 
                + (this.cfData[0] ? this.cfData[0].filter(d => (d >= range[0] && d < range[1])).length : 0);
            const totalCount = posNum + negNum;
            return 1 - (posNum / totalCount) ** 2 - (negNum / totalCount) ** 2;
        }
        else {
            console.debug(this.originData, this.cfData, range);
            return 0;
        }
    }

    public render() {
        const { className, style, width, histHeight, selected, onSelect } = this.props;
        const { drawTooltip } = this.state;

        return <div className={className} style={{ width, ...style }} onMouseOver={this.onHover} onMouseLeave={this.onMouseLeave}>
            <div className={(className || "") + " histogram" + (selected ? " selected-column" : "")} style={style}>
                <svg style={{ height: NumSubsetFeatCol.getHeight(histHeight), width: width }} ref={this.svgRef}>
                </svg>
            </div>
            {drawTooltip &&
                <Icon type="zoom-in" className='zoom-button' onClick={onSelect} />}
        </div>
    }

    paint() {
        const { width, histHeight, margin, histogramType, column, k: key, drawAxis } = this.props;
        const { drawSankey } = this.state
        const { handleAnn, sankeyHeight } = NumSubsetFeatCol.layout;
        // const { rangeNotation, lineChart, marginBottom } = SubsetCFHist.subsetLayout;
        const node = this.svgRef.current;
        const color = this.props.color || defaultCategoricalColor;
        if (!node) {
            this.shouldPaint = false;
            return;
        }
        const root = d3.select(node);
        const originHistBase = getChildOrAppend<SVGGElement, SVGSVGElement>(root, "g", "origin-hist-base")
            .attr("transform", `translate(0, ${handleAnn})`);;
        const originHistNode = originHistBase.node();
        if (originHistNode && this.originData && this.allOriginData) {
            drawGroupedHistogram({
                root: originHistNode,
                data: this.originData,
                allData: this.allOriginData,
                dmcData: this.allOriginData,
                options: {
                    width,
                    margin,
                    height: histHeight,
                    mode: histogramType,
                    onHoverRange: this.onHoverRange,
                    onSelectRange: this.onSelectRange,
                    rangeSelector: "as-a-whole",
                    selectedRange: this.props.selectedRange,
                    drawBand: true,
                    bandValueFn: this.getGini,
                    key: `${key}-${column.name}-origin`,
                    xScale: this.getXScale(),
                    ticks: this.getTicks(),
                    snapping: true,
                    drawAxis: drawAxis,
                    twisty: this.impurity,
                    color: color
                }
            });

        }
        this.drawHandle(node);

        const sankeyBase = getChildOrAppend<SVGGElement, SVGSVGElement>(root, "g", "cf-sankey-base")
            .attr("transform", `translate(${margin.left}, ${histHeight + handleAnn})`);
        const sankeyNode = sankeyBase.node();
        if (sankeyNode && !this.dataEmpty())
            this.drawSankey(sankeyNode);

        const cfHistBase = getChildOrAppend<SVGGElement, SVGSVGElement>(root, "g", "cf-hist-base")
            .attr("transform", `translate(0, ${histHeight + handleAnn + (drawSankey ? sankeyHeight : 3)})`);
        const cfHistNode = cfHistBase.node();
        if (cfHistNode && this.cfData && this.allCfData)
            drawGroupedHistogram({
                root: cfHistNode,
                data: this.cfData,
                allData: this.allCfData,
                dmcData: this.allCfData,
                options: {
                    width,
                    margin,
                    height: histHeight,
                    mode: histogramType,
                    direction: 'down',
                    color: i => color(i ^ 1),
                    key: `${column.name}-cf`,
                    xScale: this.getXScale(),
                    ticks: this.getTicks(),
                    snapping: true,
                }
            });

        const lineChartBase = getChildOrAppend<SVGGElement, SVGSVGElement>(root, "g", "line-chart-base")
            .attr("transform", `translate(${margin.left}, ${histHeight * 2 + handleAnn + (drawSankey ? sankeyHeight : 3)})`);
        const lineChartNode = lineChartBase.node()
        if (lineChartNode) {
            this.drawLineChart(lineChartNode);
        }

        this.shouldPaint = false;
    }

    drawLineChart(root: SVGGElement) {
        const { width, margin, column, k: key } = this.props;
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
        const { margin, histHeight, column } = this.props;
        const { selectedRange } = this.state;
        const { handleAnn } = NumSubsetFeatCol.layout;
        const _root = d3.select(root);
        const x = this.getXScale();
        if (selectedRange) {
            const leftHandleBase = getChildOrAppend(_root, 'g', 'right-hand-base')
                .attr("transform", `translate(${margin.left + x(selectedRange[0])}, ${margin.top})`);
            getChildOrAppend(leftHandleBase, 'line', 'handle-line')
                .attr("x1", 0)
                .attr("x2", 0)
                .attr("y1", handleAnn)
                .attr("y2", 2 * histHeight + 3);

            getChildOrAppend(leftHandleBase, 'path', 'handle-icon')
                .attr("d", "M-3,0 L3,0 L0,5 z")
                .attr("transform", `translate(0, ${handleAnn - 5})`);;

            getChildOrAppend(leftHandleBase, 'text', 'handle-text')
                .text(selectedRange[0])
                .attr("dy", 10)
                .attr("dx", -2);

            const rightHandleBase = getChildOrAppend(_root, 'g', 'left-hand-base')
                .attr("transform", `translate(${margin.left + x(selectedRange[1])}, ${margin.top})`);
            getChildOrAppend(rightHandleBase, 'line', 'handle-line')
                .attr("x1", 0)
                .attr("x2", 0)
                .attr("y1", handleAnn)
                .attr("y2", 2 * histHeight + 3);

            getChildOrAppend(rightHandleBase, 'path', 'handle-icon')
                .attr("d", "M-3,0 L3,0 L0,5 z")
                .attr("transform", `translate(0, ${handleAnn - 5})`);;

            getChildOrAppend(rightHandleBase, 'text', 'handle-text')
                .text(selectedRange[1].toFixed(column.precision))
                .attr("dy", 10)
                .attr("dx", -5);
        }
    }

    drawSankey(root: SVGGElement) {
        const { width, margin, histogramType, focusedCategory } = this.props;
        const { drawSankey } = this.state;
        if (this.sankeyBins)
            drawLink(root, this.sankeyBins, {
                height: NumSubsetFeatCol.layout.sankeyHeight,
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

    private getGini(x: number) {
        const { labelColumn, column, CFColumn } = this.props;
        const data = column.series.toArray();
        const cf = CFColumn.series.toArray();
        const validArray: boolean[] = _.range(data.length).map((d) => data[d] !== cf[d]);
        const groupArgs = labelColumn && getRowLabels(labelColumn);
        // const validFilter = column.selectedValid && ((idx: number) => column.selectedValid![idx]);

        // const geqValidFilter = validFilter && ((idx: number) => idx >= x && validFilter(idx));
        // const lessValidFilter = validFilter && ((idx: number) => idx < x && validFilter(idx));
        if (groupArgs) {
            const labels = groupArgs[0];
            const geqData: number[][] = [];
            const lessData: number[][] = [];
            groupArgs[1].forEach(d => { geqData[d] = []; lessData[d] = [] });
            data.forEach((d, i) => {
                if (validArray[i]) {
                    if (d >= x) geqData[labels[i]].push(d);
                    else lessData[labels[i]].push(d);
                }
            })
            cf && cf.forEach((d, i) => {
                if (validArray[i]) {
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

    onHover() {
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
        const { labelColumn: groupByColumn } = this.props;
        return groupByColumn && getRowLabels(groupByColumn);
    }

    onHoverRange(hoveredBin?: [number, number]) {
        const bin = this._checkBins(hoveredBin);
        this.setState({ selectedRange: bin && [bin[0], bin[1]] });
        // onUpdateFilter && bin && onUpdateFilter([bin[0], bin[1]]);
    };

    onSelectRange(hoveredBin?: [number, number]) {
        const { onUpdateSelectedRange } = this.props;
        const bin = this._checkBins(hoveredBin);

        this.setState({ selectedRange: bin && [bin[0], bin[1]] });
        onUpdateSelectedRange && onUpdateSelectedRange(this.state.selectedRange);
    };

}
