import * as d3 from 'd3';
import * as React from 'react';
import * as _ from "lodash";
import memoizeOne from "memoize-one";


import { shallowCompare, number2string, decile2precision, assert } from '../../common/utils';
import { IMargin, defaultCategoricalColor, getChildOrAppend } from '../visualization/common';
import Histogram, { drawGroupedHistogram } from '../visualization/histogram';
import { CFNumericalColumn, CFCategoricalColumn, getRowLabels, getAllRowLabels, filterUndefined, CFTableColumn, isNumericalCFColumn } from './common';

export interface ISubsetCFHistProps {
    width: number;
    height: number;
    margin: IMargin;
    column: CFNumericalColumn;
    protoColumn?: CFNumericalColumn;
    groupByColumn?: Readonly<CFTableColumn>;
    protoColumnGroupBy?: Readonly<CFTableColumn>;
    cfFilter?: [number, number];
    style?: React.CSSProperties;
    className?: string;
    extent?: [number, number];
    onUpdateFilter?: (extent?: [number, number], categories?: string[]) => void;
    histogramType: 'side-by-side' | 'stacked';
    onSelect?: () => void;
}

export interface ISubsetCFHistState {
    selectedRange?: [number, number];
}

export default class SubsetChart extends React.PureComponent<ISubsetCFHistProps, ISubsetCFHistState> {

    private originData?: number[] | number[][];
    private cfData?: number[] | number[][];
    private svgRef: React.RefObject<SVGSVGElement> = React.createRef();
    private shouldPaint: boolean;

    constructor(props: ISubsetCFHistProps) {
        super(props);
        const { column } = this.props;
        this.state = { selectedRange: column.dataRange };
        this.updateParams(props);

        this.onHoverRange = this.onHoverRange.bind(this);
        this.onSelectRange = this.onSelectRange.bind(this);
        this.paint = this.paint.bind(this);

        this.shouldPaint = false;
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
        const { column, protoColumn, groupByColumn, protoColumnGroupBy } = this.props;

        const groupArgs = groupByColumn && getRowLabels(groupByColumn);
        // const allGroupArgs = groupByColumn && getAllRowLabels(groupByColumn);
        // const protoGroupArgs = protoColumnGroupBy && protoColumn && getAllRowLabels(protoColumnGroupBy);

        const validFilter = column.valid && ((idx: number) => column.valid![idx]);

        if (groupArgs) {
            this.originData = column.series.groupBy(...groupArgs);
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
        const { width, height, margin, histogramType } = this.props;
        const histHeight = (height - 24) / 2;
        const node = this.svgRef.current;
        if (node) {
            const root = d3.select(node);
            const originHistBase = getChildOrAppend<SVGGElement, SVGSVGElement>(root, "g", "origin-hist-base");
            const originHistNode = originHistBase.node();
            if (originHistNode && this.originData)
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
                        selectedRange: this.state.selectedRange
                    })
            const cfHistBase = getChildOrAppend<SVGGElement, SVGSVGElement>(root, "g", "cf-hist-base")
                .attr("transform", `translate(0, ${histHeight})`);
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
                    })
        }
        this.shouldPaint = false;
    }

    public render() {
        const { column, className, style, width, height, margin } = this.props;
        const { selectedRange: hoveredBin } = this.state;

        const precision = decile2precision(Math.max.apply(null, column.series.toArray()), column.precision)

        return <div className={className} style={style}>
            <div className={(className || "") + " histogram"} style={style}>
                <svg style={{height: height-24, width: width}} ref={this.svgRef}>
                    <g />
                </svg>
            </div>
            <div className="info">
                {hoveredBin
                    ? `${number2string(hoveredBin[0] as number, precision)} - ${number2string(hoveredBin[1] as number, precision)}`
                    : (column.extent && `${number2string(column.extent[0], precision)} - ${number2string(column.extent[1], precision)}`)
                }
            </div>
        </div>

    }

    validateCFs = memoizeOne(filterUndefined);
    validateAllCFs = memoizeOne(filterUndefined);

    _groupByArgs(): undefined | [number[], number[]] {
        const { groupByColumn } = this.props;
        return groupByColumn && getRowLabels(groupByColumn);
    }

    onHoverRange(hoveredBin?: [number, number]) {
        const bin = this._checkBins(hoveredBin);
        this.setState({ selectedRange: bin || undefined });
    };

    onSelectRange(hoveredBin?: [number, number]) {
        const { onUpdateFilter, onSelect } = this.props;
        const bin = this._checkBins(hoveredBin);
        onUpdateFilter && onUpdateFilter(bin);
        onSelect && onSelect();
        this.setState({ selectedRange: bin });
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

}
