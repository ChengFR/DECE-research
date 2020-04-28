import * as d3 from 'd3';
import * as React from 'react';
import * as _ from "lodash";
import memoizeOne from "memoize-one";

import { IMargin, defaultCategoricalColor, getChildOrAppend, defaultMarginBottom, getScaleBand } from '../visualization/common';
// import Histogram, { drawGroupedHistogram } from '../visualization/histogram';
import { drawBarChart } from '../visualization/barchart'
import { CFNumericalColumn, CFCategoricalColumn, getRowLabels, getAllRowLabels, filterUndefined, CFTableColumn, isNumericalCFColumn } from './common';
import { Icon } from 'antd';

import SubsetCFHist, { SubsetChartProps, SankeyBins } from './SubsetCFHist'
import { columnMargin } from 'components/Table';
import { drawLink } from 'components/visualization/link';

export interface ISubsetCFBarProps extends SubsetChartProps {

    column: CFCategoricalColumn;
    protoColumn?: CFCategoricalColumn;
    onUpdateFilter?: (categories?: string[]) => void;
    onUpdateCFFilter?: (categories?: string[]) => void;
    histogramType: 'side-by-side' | 'stacked';
    drawHandle?: boolean;
}

export interface ISubsetCFBarState {
    selectedCategories?: string[],
    selectedCFCategories?: string[],
    drawSankey: boolean,
    drawTooltip: boolean,
}

export default class SubsetCFBar extends React.PureComponent<ISubsetCFBarProps, ISubsetCFBarState> {

    private originData?: string[][];
    private cfData?: string[][];
    private allOriginData?: string[][];
    private allCfData?: string[][];
    private sankeyBins?: SankeyBins<string>[][][];
    private svgRef: React.RefObject<SVGSVGElement> = React.createRef();
    private shouldPaint: boolean;

    constructor(props: ISubsetCFBarProps) {
        super(props);
        const { column, layout } = this.props;
        this.state = {
            selectedCategories: layout === 'header' ? [] : column.dataRange,
            selectedCFCategories: layout === 'header' ? [] : undefined,
            drawSankey: false, drawTooltip: false
        };
        this.updateParams(props);

        this.paint = this.paint.bind(this);
        this.onSelectCategories = this.onSelectCategories.bind(this);
        this.drawHandle = this.drawHandle.bind(this);

        this.onHover = this.onHover.bind(this);
        this.onMouseLeave = this.onMouseLeave.bind(this);
        this.onSelectCategories = this.onSelectCategories.bind(this);
        this.onSelectCFCategories = this.onSelectCFCategories.bind(this);
        this.onSwitchLink = this.onSwitchLink.bind(this);

        this.twisty = this.twisty.bind(this);

        this.shouldPaint = false;
    }

    componentDidMount() {
        this.paint();
    }

    componentDidUpdate(prevProps: ISubsetCFBarProps) {
        this.updateParams(this.props);

        this.shouldPaint = true;
        const delayedPaint = () => {
            if (this.shouldPaint) this.paint();
        };
        window.setTimeout(delayedPaint, 100);
    }

    protected updateParams(props: ISubsetCFBarProps) {
        // const { column, protoColumn, groupByColumn } = this.props;

        // const groupArgs = groupByColumn && getRowLabels(groupByColumn);
        // // const allGroupArgs = groupByColumn && getAllRowLabels(groupByColumn);
        // // const protoGroupArgs = protoColumnGroupBy && protoColumn && getAllRowLabels(protoColumnGroupBy);

        // const validFilter = column.valid && ((idx: number) => column.valid![idx]);

        // if (groupArgs) {
        //     this.originData = column.series.groupBy(groupArgs[0], groupArgs[1], validFilter);
        //     this.cfData = column.cf && (groupArgs ? column.cf.groupBy(groupArgs[0], groupArgs[1], validFilter) : column.cf.toArray());
        //     // const allRawData = column.prevSeries && (allGroupArgs ? column.prevSeries.groupBy(...allGroupArgs) : column.prevSeries.toArray());
        //     // const allCFData = column.allCF && (groupArgs ? column.allCF.groupBy(groupArgs[0], groupArgs[1], validFilter) : column.allCF.toArray());
        // }
        // else {
        //     this.originData = column.series.toArray();
        //     this.cfData = column.cf && column.cf.toArray();
        // }
        const { column, protoColumn, groupByColumn, layout, focusedCategory } = this.props;


        const groupArgs = groupByColumn && getRowLabels(groupByColumn);

        const validFilter = column.selectedValid && ((idx: number) => column.selectedValid![idx]);
        this.originData = groupArgs ? column.series.groupBy(groupArgs[0], groupArgs[1], validFilter) : [column.series.toArray()];
        this.cfData = column.cf && (groupArgs ? column.cf.groupBy(groupArgs[0], groupArgs[1], validFilter) : [column.cf.toArray()]);

        if (!this.dataEmpty())
            this.sankeyBins = this.getSankeyBins();
        if (layout && layout === 'header') {
            const allValidFilter = column.valid && ((idx: number) => column.valid![idx]);
            const allGroupArgs = groupByColumn && getAllRowLabels(groupByColumn);
            this.allOriginData = column.prevSeries && (allGroupArgs ? column.prevSeries.groupBy(allGroupArgs[0], allGroupArgs[1], allValidFilter) : [column.prevSeries.toArray()]);
            this.allCfData = column.allCF && (allGroupArgs ? column.allCF.groupBy(allGroupArgs[0], allGroupArgs[1], allValidFilter) : [column.allCF.toArray()]);
        }
        else {
            this.allOriginData = groupArgs ? column.series.groupBy(groupArgs[0], groupArgs[1]) : [column.series.toArray()];
            this.allCfData = column.cf && (groupArgs ? column.cf.groupBy(groupArgs[0], groupArgs[1]) : [column.cf.toArray()]);
        }

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

    twisty(idx: number) {
        const {groupByColumn, column} = this.props;
        if (groupByColumn && this.originData && this.cfData) {
            const cat = column.categories[idx];
            const pos = (this.originData[0]?this.originData[0].filter(d => d === cat).length:0) + (this.cfData[1]?this.cfData[1].filter(d => d === cat).length:0);
            const neg = (this.originData[1]?this.originData[1].filter(d => d === cat).length:0) + (this.cfData[0]?this.cfData[0].filter(d => d === cat).length:0);
            const sum = pos + neg;
            if (sum > 0) {
                return (1 - (pos / sum) ** 2 - (neg / sum) ** 2);
            }
            else
                return 0
        }
        else {
            return 0;
        }
    }

    paint() {
        const { width, height, margin, histogramType, column, k: key, drawHandle, drawAxis, layout } = this.props;
        const { drawSankey, selectedCategories, selectedCFCategories } = this.state;
        const node = this.svgRef.current;
        const color = this.props.color || defaultCategoricalColor;
        if (node) {
            const root = d3.select(node);
            const originHistBase = getChildOrAppend<SVGGElement, SVGSVGElement>(root, "g", "origin-hist-base")
                .attr("transform", `translate(0, ${this.originHistY})`);;
            const originHistNode = originHistBase.node();
            if (originHistNode && this.originData) {
                drawBarChart(originHistNode,
                    this.originData,
                    this.allOriginData,
                    this.props.protoColumn && this.props.protoColumn.series.toArray(),
                    {
                        width,
                        margin,
                        height: this.histHeight,
                        selectedCategories: selectedCategories,
                        // onSelectCategories: 
                        xScale: this.getXScale(),
                        renderShades: true,
                        onSelectCategories: this.onSelectCategories,
                        drawAxis: drawAxis,
                        color: color,
                        twisty: layout !== 'header' ? this.twisty : undefined
                    });

            }
            else {
                throw Error("data empty");
            }

            if (drawHandle)
                this.drawHandle(node);

            const sankeyBase = getChildOrAppend<SVGGElement, SVGSVGElement>(root, "g", "cf-sankey-base")
                .attr("transform", `translate(${margin.left}, ${this.histHeight + this.originHistY})`);
            const sankeyNode = sankeyBase.node();
            if (sankeyNode && !this.dataEmpty())
                this.drawSankey(sankeyNode);

            const cfHistBase = getChildOrAppend<SVGGElement, SVGSVGElement>(root, "g", "cf-hist-base")
                .attr("transform", `translate(0, ${this.originHistY + this.histHeight + (drawSankey ? 20 : 3)})`);
            const cfHistNode = cfHistBase.node();
            if (cfHistNode && this.cfData) {
                drawBarChart(cfHistNode,
                    this.cfData,
                    this.allCfData,
                    this.props.protoColumn && this.props.protoColumn.series.toArray(),
                    {
                        width,
                        margin,
                        height: this.histHeight,
                        direction: 'down',
                        color: i => color(i ^ 1),
                        xScale: this.getXScale(),
                        renderShades: layout === 'header',
                        onSelectCategories: this.onSelectCFCategories,
                        selectedCategories: selectedCFCategories
                    });
            }
            // if (!this.dataEmpty()) {
            if (layout === 'header') {
                const axisBase = getChildOrAppend<SVGGElement, SVGSVGElement>(root, "g", "line-chart-base")
                    .attr("transform", `translate(${margin.left}, ${this.histHeight * 2 + this.originHistY + (drawSankey ? 20 : 3)})`);
                const bottomAxis = d3.axisBottom(this.getXScale());
                axisBase.call(bottomAxis);
            }
            //     else {
            //         const lineChartBase = getChildOrAppend<SVGGElement, SVGSVGElement>(root, "g", "line-chart-base")
            //             .attr("transform", `translate(${margin.left}, ${this.histHeight * 2 + this.originHistY + (drawSankey ? 20 : 3)})`);
            //         const lineChartNode = lineChartBase.node()
            //         if (drawLineChart && lineChartNode) {
            //             this.drawLineChart(lineChartNode);
            //         }
            //     }
            // }

        }

        this.shouldPaint = false;
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
                xScale: x => this.getXScale()(x)!,
                binWidth: this.binWidth,
                onSwitch: this.onSwitchLink,
                color: this.props.color,
            })
    }

    get binWidth() {
        const { histogramType } = this.props;
        const groupWidth = this.getXScale().bandwidth();
        return histogramType === 'side-by-side' ? (groupWidth / this.originData!.length - 1) : groupWidth;
    }

    onSwitchLink() {
        const { drawSankey } = this.state;
        this.setState({ drawSankey: !drawSankey });
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

    onSelectCategories(categories?: string[]) {
        const { onUpdateFilter, layout } = this.props;
        if (layout === 'header') console.log(categories);
        onUpdateFilter && onUpdateFilter(categories);
        this.setState({ selectedCategories: categories && [...categories] });
    }

    onSelectCFCategories(categories?: string[]) {
        const { onUpdateCFFilter } = this.props;
        onUpdateCFFilter && onUpdateCFFilter(categories);
        this.setState({ selectedCFCategories: categories && [...categories] });
    }

    drawHandle(root: SVGSVGElement) {
        const { margin, height } = this.props;
        const { selectedCategories } = this.state;
        const { rangeNotation, lineChart, marginBottom } = SubsetCFHist.subsetLayout;
        const _root = d3.select(root);
        const x = this.getXScale();
        if (selectedCategories !== undefined) {
            const handleBase = _root.selectAll("g.handle-base")
                .data(selectedCategories)
                .join(enter => enter.append("g")
                    .attr("class", "handle-base"),
                    update => update,
                    exit => { exit.remove() }
                )
                .attr("transform", d => `translate(${margin.left + x(d)!}, ${margin.top})`);

            getChildOrAppend(handleBase, "path", "handle-icon")
                .attr("d", "M-3,0 L3,0 L0,5 z")
                .attr("transform", `translate(${x.bandwidth() / 2}, ${rangeNotation - 5})`);
        }
    }

    getXScale() {
        const { column, width, margin } = this.props;
        return column.xScale || getScaleBand(column.series.toArray(), 0, width - margin.left - margin.right, column.categories);
    }

    getTicks() {
        const { column } = this.props;
        return column.categories;
    }

    getSankeyBins() {
        const { column, groupByColumn, focusedCategory } = this.props;
        const x = this.getXScale();
        const ticks = this.getTicks();

        const originData = column.series.toArray();
        const cfData = column.cf?.toArray();
        const validArray: boolean[] = column.selectedValid ? column.selectedValid : _.range(originData.length).map(() => true);
        const labelArray: any[] | undefined = groupByColumn?.series.toArray();
        if (cfData) {

            if (groupByColumn && labelArray) {
                const bins: SankeyBins<string>[][][] = groupByColumn.categories!.map((d, i) =>
                    _.range(ticks.length).map((d, topIndex) =>
                        _.range(ticks.length).map((d, bottomIndex) => ({
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
                    const topBinIndex = ticks.indexOf(originData[i]);
                    const bottomBinIndex = ticks.indexOf(cfData[i]);
                    bins[catIndex][Math.max(topBinIndex, 0)][Math.max(bottomBinIndex, 0)].count += 1;
                });
                bins.forEach((binMat, i) => {
                    _.range(ticks.length).forEach(topIndex => {
                        let topBinCount = 0;
                        _.range(ticks.length).forEach(bottomIndex => {
                            binMat[topIndex][bottomIndex].topPrevCounts = topBinCount;
                            topBinCount += binMat[topIndex][bottomIndex].count;
                        })
                        _.range(ticks.length).forEach(bottomIndex => {
                            binMat[topIndex][bottomIndex].topTotalCounts = topBinCount;
                        })
                    });
                    _.range(ticks.length).forEach(bottomIndex => {
                        let bottomBinCount = 0;
                        _.range(ticks.length).forEach(topIndex => {
                            binMat[topIndex][bottomIndex].topPrevCounts = bottomBinCount;
                            bottomBinCount += binMat[topIndex][bottomIndex].count;
                        })
                        _.range(ticks.length).forEach(topIndex => {
                            binMat[topIndex][bottomIndex].bottomTotalCounts = bottomBinCount;
                        })
                    });
                })

                _.range(ticks.length).forEach(topIndex => _.range(ticks.length).forEach(bottomIndex => {
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



    onHover() {
        if (this.props.expandable)
            this.setState({ drawTooltip: true })
    }

    onMouseLeave() {
        this.setState({ drawTooltip: false })
    }

    public render() {
        const { column, className, style, width, height, margin, onSelect, selected } = this.props;
        const { drawTooltip } = this.state;

        return <div className={className} style={{ width, ...style }} onMouseOver={this.onHover} onMouseLeave={this.onMouseLeave}>
            <div className={(className || "") + " bar-chart" + (selected ? " selected-column" : "")} style={style}>
                <svg style={{ height: height - 5, width: width }} ref={this.svgRef}>
                </svg>
            </div>
            {drawTooltip &&
                <Icon type="zoom-in" className='zoom-button' onClick={onSelect} />}
        </div>

    }

    validateCFs = memoizeOne(filterUndefined);
    validateAllCFs = memoizeOne(filterUndefined);

    _groupByArgs(): undefined | [number[], number[]] {
        const { groupByColumn } = this.props;
        return groupByColumn && getRowLabels(groupByColumn);
    }

}
