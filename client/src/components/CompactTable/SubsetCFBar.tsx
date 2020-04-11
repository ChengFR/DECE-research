import * as d3 from 'd3';
import * as React from 'react';
import * as _ from "lodash";
import memoizeOne from "memoize-one";

import { IMargin, defaultCategoricalColor, getChildOrAppend, defaultMarginBottom, getScaleBand } from '../visualization/common';
// import Histogram, { drawGroupedHistogram } from '../visualization/histogram';
import { drawBarChart } from '../visualization/barchart'
import { CFNumericalColumn, CFCategoricalColumn, getRowLabels, getAllRowLabels, filterUndefined, CFTableColumn, isNumericalCFColumn } from './common';
import { Icon } from 'antd';

import SubsetCFHist, { SubsetChartProps } from './SubsetCFHist'

export interface ISubsetCFBarProps extends SubsetChartProps {

    column: CFCategoricalColumn;
    protoColumn?: CFCategoricalColumn;
    onUpdateFilter?: (categories?: string[]) => void;
    histogramType: 'side-by-side' | 'stacked';
    drawHandle?: boolean;
}

export interface ISubsetCFBarState {
    selectedCategories?: string[],
}

export default class SubsetCFBar extends React.PureComponent<ISubsetCFBarProps, ISubsetCFBarState> {

    private originData?: string[] | string[][];
    private cfData?: string[] | string[][];
    private svgRef: React.RefObject<SVGSVGElement> = React.createRef();
    private shouldPaint: boolean;
    static layout = {
        rangeNotation: 20,
        lineChart: 10,
        marginBottom: 10,
    }

    constructor(props: ISubsetCFBarProps) {
        super(props);
        const { column } = this.props;
        this.state = { selectedCategories: column.dataRange };
        this.updateParams(props);

        this.paint = this.paint.bind(this);
        this.onSelectCategories = this.onSelectCategories.bind(this);
        this.drawHandle = this.drawHandle.bind(this);

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
        const { width, height, margin, histogramType, column, k: key, drawHandle } = this.props;
        const { rangeNotation, lineChart, marginBottom } = SubsetCFHist.layout;
        const barChartHeight = (height - rangeNotation - lineChart - marginBottom) / 2;
        const node = this.svgRef.current;
        if (node) {
            const root = d3.select(node);
            const originHistBase = getChildOrAppend<SVGGElement, SVGSVGElement>(root, "g", "origin-hist-base")
                .attr("transform", `translate(0, ${rangeNotation})`);;
            const originHistNode = originHistBase.node();
            if (originHistNode && this.originData) {
                drawBarChart(originHistNode,
                    this.originData,
                    undefined,
                    this.props.protoColumn && this.props.protoColumn.series.toArray(),
                    {
                        width,
                        margin,
                        height: barChartHeight,
                        selectedCategories: this.state.selectedCategories,
                        // onSelectCategories: 
                        xScale: this.getXScale(),
                        renderShades: true,
                        onSelectCategories: this.onSelectCategories
                    });

            }
            else {
                throw Error("data empty");
            }
            
            if (drawHandle)
                this.drawHandle(node);

            const cfHistBase = getChildOrAppend<SVGGElement, SVGSVGElement>(root, "g", "cf-hist-base")
                .attr("transform", `translate(0, ${barChartHeight + rangeNotation})`);
            const cfHistNode = cfHistBase.node();
            if (cfHistNode && this.cfData)
                drawBarChart(cfHistNode,
                    this.cfData,
                    undefined,
                    this.props.protoColumn && this.props.protoColumn.series.toArray(),
                    {
                        width,
                        margin,
                        height: barChartHeight,
                        direction: 'down',
                        color: i => defaultCategoricalColor(i ^ 1),
                        xScale: this.getXScale(),
                    });

        }

        this.shouldPaint = false;
    }

    onSelectCategories(categories?: string[]) {
        const { onUpdateFilter } = this.props;
        onUpdateFilter && onUpdateFilter(categories);
        this.setState({ selectedCategories: categories && [...categories] });
    }

    drawHandle(root: SVGSVGElement) {
        const { margin, height } = this.props;
        const { selectedCategories } = this.state;
        const { rangeNotation, lineChart, marginBottom } = SubsetCFHist.layout;
        const _root = d3.select(root);
        const x = this.getXScale();
        if (selectedCategories !== undefined) {
            const handleBase = _root.selectAll("g.handle-base")
                .data(selectedCategories)
                .join(enter => enter.append("g")
                    .attr("class", "handle-base"),
                    update => update,
                    exit => {exit.remove()}
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

    public render() {
        const { column, className, style, width, height, margin } = this.props;

        return <div className={className} style={{ width, ...style }}>
            <div className={(className || "") + " bar-chart"} style={style}>
                <svg style={{ height: height, width: width }} ref={this.svgRef}>
                </svg>
            </div>
        </div>

    }

    validateCFs = memoizeOne(filterUndefined);
    validateAllCFs = memoizeOne(filterUndefined);

    _groupByArgs(): undefined | [number[], number[]] {
        const { groupByColumn } = this.props;
        return groupByColumn && getRowLabels(groupByColumn);
    }

}
