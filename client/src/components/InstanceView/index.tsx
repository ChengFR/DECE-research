import * as React from "react";
import * as d3 from "d3";
import { Card, Divider, Button, Icon } from "antd"
import { Dataset, DataMeta, IColumn } from "../../data";
import { CounterFactual, Filter, QueryParams } from "../../api"
import { drawHistogram, Histogram } from "../visualization/histogram"
import { drawSimpleSlider, HistSlider } from "../visualization/slider"
import { drawPcp } from "../visualization/pcp"
import { createColumn, TableColumn } from "../Table/common"
import "./index.css"

export interface InstanceViewProps {
    CFMeta: DataMeta,
    dataset: Dataset,
    queryInstance?: CounterFactual,
    queryResults?: CounterFactual[],
    queryFunction: (param: QueryParams) => void,
    style?: Partial<StyleProps>
}

export interface StyleProps {
    histogramWidth: number,
    histogramHeight: number,
    nBinsMin: number,
    nBinsMax: number,
    barWidthMin: number,
    barWidthMax: number,
}

const defaultStypeProps: StyleProps = {
    histogramWidth: 250,
    histogramHeight: 100,
    nBinsMin: 10,
    nBinsMax: 10,
    barWidthMin: 7,
    barWidthMax: 20,
}

interface InstanceViewState {
    k: number;
    cf_num: number;
    filters: Filter[];
    mutable_attr: string[];
    attr_range: Filter[];
    prototype_cf: CounterFactual | null;
    queryInstanceTmp: CounterFactual | null;
    editable: boolean;
}

export default class InstanceView extends React.Component<InstanceViewProps, InstanceViewState>{
    private styleProps: StyleProps;
    private svgRef: React.RefObject<SVGSVGElement>;
    private xScales: (d3.ScaleBand<string> | d3.ScaleLinear<number, number>)[];
    private yScale?: d3.ScaleLinear<number, number>

    constructor(props: InstanceViewProps) {
        super(props);
        this.state = {
            k: 1,
            cf_num: 1,
            filters: [],
            mutable_attr: props.CFMeta.features.map(d => d.name),
            attr_range: [],
            prototype_cf: null,
            queryInstanceTmp: null,
            editable: true
        };
        this.styleProps = { ...defaultStypeProps, ...props.style };
        this.svgRef = React.createRef();
        this.xScales = [];
    }
    public render() {

        const { queryFunction, CFMeta, dataset } = this.props;
        const { editable, k, cf_num, filters, mutable_attr, attr_range, prototype_cf, queryInstanceTmp } = this.state;
        const { histogramHeight, histogramWidth, nBinsMax, nBinsMin, barWidthMin, barWidthMax } = this.styleProps;

        const columns = CFMeta.features.map((d, i) => {
            const rawColumn = createColumn(dataset.features[i])
            rawColumn.width = histogramWidth;
            return createColumn(rawColumn);
        })

        this.xScales = columns.map(d => d.xScale);
        this.yScale = d3.scaleLinear<number, number>()
            .domain([0, columns.length])
            .range([histogramHeight - 20, columns.length * histogramHeight + histogramHeight - 20])

        return (
            <Card title={<span className="ant-card-head-title-text">Instance View</span>} style={{ height: "100%", width: "100%" }}>
                <div style={{ display: "inline-flex", float: "left" }}>
                    {/* <span className="form-item-font">number</span> */}
                    <Button type={editable?"primary":"default"} onClick={d => this.setState({ editable: !this.state.editable })}>Edit</Button>
                    <Button type="primary" onClick={() => queryInstanceTmp &&
                        queryFunction({
                            query_instance: queryInstanceTmp,
                            k, cf_num, filters, mutable_attr, attr_range, prototype_cf
                        })}>Predict</Button>

                </div>
                <Divider />
                <div >

                    <div className="hist-svg-container">
                        {columns.map((column, i) => {
                            return <div key={i}>
                                {(column.type === 'numerical') ?
                                    <HistSlider
                                        data={column.series.toArray()}
                                        feature={CFMeta.features[i]}
                                        width={histogramWidth}
                                        height={histogramHeight}
                                        className={`Instance-hist-${column.name}`}
                                        style={{ float: "left", height: histogramHeight }}
                                        svgStyle={{ marginTop: "0px", marginBottom: "0px" }}
                                        margin={{ bottom: 20, top: 5, left: 10, right: 10 }}
                                        xScale={column.xScale}
                                        ticks={10}
                                        editable={true}
                                        drawInput={true}
                                    /> : <div></div>}
                            </div>

                        })}
                    </div>
                    {!editable &&
                        <div className="pcp-svg-container">
                            <svg ref={this.svgRef} className="instance-view-svg"
                                style={{ float: "left" }}
                                width={histogramWidth}
                                height={histogramHeight * this.xScales.length} />
                        </div>
                    }
                </div>
            </Card>
        );
    }

    public componentDidMount() {
        this.init();
        this._drawPcp();
    }

    public componentDidUpdate() {
        this._drawPcp();
    }
    public init() {

    }

    public _drawPcp() {
        const { queryResults, style } = this.props;
        const { histogramHeight, histogramWidth } = this.styleProps;
        const node = this.svgRef.current;
        console.log(queryResults);
        if (node && queryResults && this.yScale) {
            drawPcp(node, queryResults, {
                width: histogramWidth,
                height: histogramHeight * this.xScales.length,
                margin: { bottom: 20, top: 5, left: 10, right: 10 },
                x: this.xScales,
                y: this.yScale,
            })
        }
    }
}