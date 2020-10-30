import * as d3 from 'd3';
import * as React from 'react';
import * as _ from "lodash";

import { IMargin, defaultCategoricalColor, getChildOrAppend, getScaleBand } from '../visualization/common';
import { getRowLabels, FeatureColumnProps, SankeyBins } from './common';
import { gini } from 'common/science';
import { Icon } from 'antd';
import { drawLink } from '../visualization/link'
import { CatTableColumn } from 'components/Table';
import { drawBarChart } from 'components/visualization/Barchart';

export interface CatFeatColProps extends FeatureColumnProps {
    column: CatTableColumn;
    CFColumn: CatTableColumn;
    protoColumn?: CatTableColumn;

    histogramType: 'side-by-side' | 'stacked';
    drawAxis?: boolean;
}

export interface CatHeaderFeatColProps extends CatFeatColProps {
    allColumn: CatTableColumn;
    allCFColumn: CatTableColumn;
    allLabelColumn: Readonly<CatTableColumn>;

    onUpdateFilter?: (categories?: string[]) => void;
    onUpdateCFFilter?: (categories?: string[]) => void;
}

export interface CatSubsetFeatColProps extends CatFeatColProps {
    selectedCategories: Readonly<string[]>;
    onUpdateSelectedCategories?: (categories?: string[]) => void;

    selected: boolean;
    onSelect?: () => void;
}

export interface CatFeatColState { }

export interface CatHeaderFeatColState extends CatFeatColState { }

export interface CatSubsetFeatColState extends CatFeatColState {
    selectedCategories?: string[];
    drawSankey: boolean;
    drawTooltip: boolean;
}

export class CatFeatCol<P extends CatFeatColProps, V extends CatFeatColState> extends React.PureComponent<P, V> {
    protected originData?: string[][];
    protected cfData?: string[][];
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
            drawBarChart({
                svg: originHistNode,
                data: this.originData,
                options: {
                    width,
                    margin,
                    height: histHeight,
                    xScale: this.getXScale(),
                    drawAxis: drawAxis,
                    color: color
                }
            });
        }
        const cfHistBase = getChildOrAppend<SVGGElement, SVGSVGElement>(root, "g", "cf-hist-base")
            .attr("transform", `translate(0, ${histHeight + 3})`);
        const cfHistNode = cfHistBase.node();
        if (cfHistNode && this.cfData)
            drawBarChart({
                svg: cfHistNode,
                data: this.cfData,
                options: {
                    width,
                    margin,
                    height: histHeight,
                    direction: 'down',
                    xScale: this.getXScale(),
                    drawAxis: drawAxis,
                    color: i => color!(i ^ 1)
                }
            });

        this.shouldPaint = false;
    }

    getXScale() {
        const { protoColumn, column, width, margin } = this.props;
        if (protoColumn) {
            return protoColumn.xScale || getScaleBand(0, width - margin.left - margin.right, column.series.toArray(), column.categories);
        }
        else {
            return column.xScale || getScaleBand(0, width - margin.left - margin.right, column.series.toArray(), column.categories);
        }
    }


    getTicks() {
        const { column } = this.props;
        return column.categories;
    }

    public render() {
        const { column, className, style, width, histHeight, margin } = this.props;
        // const { drawTooltip } = this.state;

        return <div className={className} style={{ width, ...style }} >
            <div className={(className || "") + " histogram"} style={style}>
                <svg style={{ height: CatFeatCol.getHeight(histHeight), width: width }} ref={this.svgRef}>
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

export class CatHeaderFeatCol extends CatFeatCol<CatHeaderFeatColProps, CatHeaderFeatColState> {
    static layout = { axisHeight: 25 };

    private allOriginData?: string[][];
    private allCfData?: string[][];

    constructor(props: CatHeaderFeatColProps) {
        super(props);
        this.onSelectCategories = this.onSelectCategories.bind(this);
        this.onSelectCFCategories = this.onSelectCFCategories.bind(this);
        this.updateParams(props);

        this.shouldPaint = false;
    }

    static getHeight(histHeight: number) {
        return histHeight * 2 + 3 + CatHeaderFeatCol.layout.axisHeight;
    }

    protected updateParams(props: CatHeaderFeatColProps) {
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
            drawBarChart({
                svg: originHistNode,
                data: this.originData,
                allData: this.allOriginData,
                options: {
                    width,
                    margin,
                    height: histHeight,
                    xScale: this.getXScale(),
                    drawAxis: drawAxis,
                    renderShades: true,
                    color: color,
                    onSelectCategories: this.onSelectCategories,
                    selectedCategories: column.filter,
                }
            });

        }

        const cfHistBase = getChildOrAppend<SVGGElement, SVGSVGElement>(root, "g", "cf-hist-base")
            .attr("transform", `translate(0, ${histHeight + 3})`);
        const cfHistNode = cfHistBase.node();
        if (cfHistNode && this.cfData)
            drawBarChart({
                svg: cfHistNode,
                data: this.cfData,
                allData: this.allCfData,
                options: {
                    width,
                    margin,
                    height: histHeight,
                    xScale: this.getXScale(),
                    drawAxis: drawAxis,
                    direction: "down",
                    renderShades: true,
                    color: i => color(i^1),
                    onSelectCategories: this.onSelectCFCategories,
                    selectedCategories: CFColumn.filter,
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
                <svg style={{ height: CatHeaderFeatCol.getHeight(histHeight), width: width }} ref={this.svgRef}>
                </svg>
            </div>
        </div>

    }

    onSelectCategories(categories?: string[]) {
        const { onUpdateFilter } = this.props;
        onUpdateFilter && onUpdateFilter(categories);
        this.setState({ selectedCategories: categories && [...categories] });
    }

    onSelectCFCategories(categories?: string[]) {
        const { onUpdateCFFilter } = this.props;
        onUpdateCFFilter && onUpdateCFFilter(categories);
        this.setState({ selectedCFCategories: categories && [...categories] });
    }
}

export class CatSubsetFeatCol extends CatFeatCol<CatSubsetFeatColProps, CatSubsetFeatColState> {
    static layout = { handleAnn: 20, lineHeight: 10, innerMarginBottom: 10, sankeyHeight: 20 };

    private allOriginData?: string[][];
    private allCfData?: string[][];
    protected sankeyBins?: SankeyBins<string>[][][];

    static getHeight(histHeight: number) {
        const { handleAnn, lineHeight, innerMarginBottom } = CatSubsetFeatCol.layout
        return histHeight * 2 + 3 + handleAnn + lineHeight + innerMarginBottom;
    }

    constructor(props: CatSubsetFeatColProps) {
        super(props);

        const { selectedCategories } = this.props;
        this.state = { drawSankey: false, drawTooltip: false, selectedCategories: [...selectedCategories] };
        this.updateParams(props);

        this.drawHandle = this.drawHandle.bind(this);
        this.getSankeyBins = this.getSankeyBins.bind(this);
        this.onSwitchLink = this.onSwitchLink.bind(this);
        this.onHover = this.onHover.bind(this);
        this.onMouseLeave = this.onMouseLeave.bind(this);
        this.twisty = this.twisty.bind(this);
        this.onSelectCategories = this.onSelectCategories.bind(this);

        this.shouldPaint = false;
    }

    public componentWillReceiveProps(nextProps: CatSubsetFeatColProps){
        // new props
        if (nextProps != this.props) {
            const { selectedCategories } = nextProps;
            this.setState({ drawSankey: false, drawTooltip: false, selectedCategories: [...selectedCategories] });
            this.updateParams(this.props);
        }
    }

    protected updateParams(props: CatSubsetFeatColProps) {
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
        const x = this.getXScale();
        const ticks = this.getTicks();

        const originData = column.series.toArray();
        const cfData = CFColumn.series.toArray();
        const validArray: boolean[] = _.range(originData.length).map((d) => originData[d] !== cfData[d]);
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

    public twisty(idx: number) {
        const { labelColumn: groupByColumn, column } = this.props;
        if (groupByColumn && this.originData && this.cfData) {
            const cat = column.categories[idx];
            const pos = (this.originData[0] ? this.originData[0].filter(d => d === cat).length : 0) + (this.cfData[1] ? this.cfData[1].filter(d => d === cat).length : 0);
            const neg = (this.originData[1] ? this.originData[1].filter(d => d === cat).length : 0) + (this.cfData[0] ? this.cfData[0].filter(d => d === cat).length : 0);
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

    public render() {
        const { className, style, width, histHeight, selected, onSelect } = this.props;
        const { drawTooltip } = this.state;

        return <div className={className} style={{ width, ...style }} onMouseOver={this.onHover} onMouseLeave={this.onMouseLeave}>
            <div className={(className || "") + " histogram" + (selected ? " selected-column" : "")} style={style}>
                <svg style={{ height: CatSubsetFeatCol.getHeight(histHeight), width: width }} ref={this.svgRef}>
                </svg>
            </div>
            {drawTooltip &&
                <Icon type="zoom-in" className='zoom-button' onClick={onSelect} />}
        </div>
    }

    paint() {
        const { width, histHeight, margin, histogramType, column, k: key, drawAxis } = this.props;
        const { drawSankey, selectedCategories } = this.state
        const { handleAnn, sankeyHeight } = CatSubsetFeatCol.layout;
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
            drawBarChart({
                svg: originHistNode,
                data: this.originData,
                allData: this.allOriginData,
                options: {
                    width,
                    margin,
                    height: histHeight,
                    xScale: this.getXScale(),
                    drawAxis: drawAxis,
                    renderShades: true,
                    color: color,
                    twisty: this.twisty,
                    selectedCategories: selectedCategories,
                    onSelectCategories: this.onSelectCategories,
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
            drawBarChart({
                svg: cfHistNode,
                data: this.cfData,
                allData: this.allCfData,
                options: {
                    width,
                    margin,
                    height: histHeight,
                    xScale: this.getXScale(),
                    drawAxis: drawAxis,
                    direction: "down",
                    color: i => color(i^1),
                }
            });

        const lineChartBase = getChildOrAppend<SVGGElement, SVGSVGElement>(root, "g", "line-chart-base")
            .attr("transform", `translate(${margin.left}, ${histHeight * 2 + handleAnn + (drawSankey ? sankeyHeight : 3)})`);
        const lineChartNode = lineChartBase.node()

        this.shouldPaint = false;
    }


    drawHandle(root: SVGSVGElement) {
        const { margin, histHeight } = this.props;
        const { selectedCategories } = this.state;
        const { handleAnn } = CatSubsetFeatCol.layout;
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
                .attr("transform", `translate(${x.bandwidth() / 2}, ${handleAnn - 5})`);
        }
    }

    drawSankey(root: SVGGElement) {
        const { width, margin, histogramType, focusedCategory } = this.props;
        const { drawSankey } = this.state;
        if (this.sankeyBins)
            drawLink(root, this.sankeyBins, {
                height: CatSubsetFeatCol.layout.sankeyHeight,
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
        const { width, margin, column, histogramType } = this.props;
        // const groupWidth = (width - margin.left - margin.right) / (this.getTicks().length - 1) - 2;
        const groupWidth = column.xScale!.bandwidth()
        return histogramType === 'side-by-side' ? (groupWidth / this.originData!.length - 1) : groupWidth;
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

    onSelectCategories(categories?: string[]) {
        const { onUpdateSelectedCategories } = this.props;
        onUpdateSelectedCategories && onUpdateSelectedCategories(categories);
        this.setState({ selectedCategories: categories && [...categories] });
    }

}
