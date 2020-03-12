import * as React from "react";
import * as d3 from "d3";
import { Card, Divider, Button, Icon, InputNumber, Select, Row, Col, Slider } from "antd"
import { Dataset, DataMeta, IColumn } from "../../data";
import { CounterFactual, Filter, QueryParams } from "../../api"
import { drawHistogram, Histogram } from "../visualization/histogram"
import { drawSimpleSlider, HistSlider } from "../visualization/slider"
import { drawPcp } from "../visualization/pcp"
import { createColumn, TableColumn } from "../Table/common"
import "./index.css"

const { Option } = Select;

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
}

const defaultStypeProps: StyleProps = {
    histogramWidth: 250,
    histogramHeight: 100,
}

interface InstanceViewState extends QueryParams{
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
            ...defaultSetting(this.props.CFMeta),
            editable: true
        };
        this.styleProps = { ...defaultStypeProps, ...props.style };
        this.svgRef = React.createRef();
        this.xScales = [];
        this.updateAttributeRange = this.updateAttributeRange.bind(this);
        this.updateAttributeValue = this.updateAttributeValue.bind(this);
    }
    public render() {

        const { queryFunction, CFMeta, dataset } = this.props;
        const { editable, k, cfNum, attrFlex, attrRange, prototypeCf, queryInstance, target } = this.state;
        const { histogramHeight, histogramWidth } = this.styleProps;

        const columns = CFMeta.features.map((d, i) => {
            const rawColumn = createColumn(dataset.features[i])
            rawColumn.width = histogramWidth;
            return createColumn(rawColumn);
        })

        const margin = { bottom: 20, top: 5, left: 10, right: 10 }

        this.xScales = columns.map(d => d.xScale);
        this.yScale = d3.scaleLinear<number, number>()
            .domain([0, columns.length])
            .range([histogramHeight - margin.bottom, columns.length * histogramHeight + histogramHeight - margin.bottom])

        return (
            <Card title={
                <div>
                    <span className="ant-card-head-title-text">Instance View</span>
                    <Button type={editable ? "link" : "link"} icon="edit" shape="circle" size="default"
                        ghost={editable} style={{ float: "right" }}
                        onClick={d => this.setState({ editable: !this.state.editable })}>
                    </Button>
                </div>} style={{ height: "100%", width: "100%" }}>
                <div style={{ width: "100%" }}>
                    {/* <span className="form-item-font">number</span> */}
                    <Row>
                        <Col span={6}>
                            <span className="target-title">Target:</span>
                        </Col>
                        <Col span={12}>
                        {CFMeta.target.type === 'numerical' ?
                            <InputNumber size="default" style={{float: "left", minWidth: 120 }} /> :
                            <Select style={{float: "left", minWidth: 120 }} 
                                // value = {target}
                                onChange={v => this.setState({target: v as string})}>
                                {CFMeta.target.categories?.map((d, i) => {
                                    return (<Option key={i}>{d}</Option>)
                                })}
                            </Select>
                        }
                        </Col>
                        <Col span={6}>
                        <Button type="primary" style={{ float: "right" }} icon="search"
                            onClick={() => {
                                this.setState({editable: false});
                                queryInstance && queryFunction({
                                    queryInstance, target,
                                    k, cfNum, attrFlex, attrRange, prototypeCf
                                })}}></Button>
                        </Col>
                    </Row>
                    <Row>
                        <Col span={6}>
                            <span className="target-title">CF Num.:</span>
                        </Col>
                        <Col span={12}>
                            <Slider
                                min={1}
                                max={15}
                                defaultValue={12}
                                onChange={v => this.setState({cfNum: v as number})}
                            />
                        </Col>
                    </Row>
                    <Row>
                        <Col span={6}>
                            <span className="target-title">Attr Num.:</span>
                        </Col>
                        <Col span={12}>
                            <Slider
                                min={1}
                                max={columns.length}
                                defaultValue={columns.length}
                                onChange={v => this.setState({k: v as number})}
                            />
                        </Col>
                    </Row>
                </div>
                <Divider />
                <div className="instance-vis-container">
                    <div className="instance-body-container">
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
                                        margin={margin}
                                        xScale={column.xScale}
                                        ticks={10}
                                        editable={true}
                                        drawInput={true}
                                        onValueChange={newValue => this.updateAttributeValue(i, newValue)}
                                        onRangeChange={newRange => this.updateAttributeRange(i, newRange)}
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
                </div>
            </Card>
        );
    }

    public componentDidMount() {
        this.init();
        this._drawPcp();
    }

    public componentDidUpdate(oldProps: InstanceViewProps, oldState: InstanceViewState) {
        this._drawPcp();
    }
    public init() {

    }

    public _drawPcp() {
        const { queryResults, style } = this.props;
        const { histogramHeight, histogramWidth } = this.styleProps;
        const node = this.svgRef.current;
        const margin = { bottom: 20, top: 5, left: 10, right: 10 }
        console.log(queryResults);
        if (node && queryResults && this.yScale) {
            drawPcp(node, queryResults, {
                width: histogramWidth,
                height: histogramHeight * this.xScales.length,
                margin: margin,
                x: this.xScales,
                y: this.yScale,
            })
        }
    }

    updateAttributeValue(attrIndex: number, newvalue: number|string){
        const {queryInstance} = this.state;
        queryInstance[attrIndex] = newvalue;
        this.setState({queryInstance});
    }

    updateAttributeRange(attrIndex: number, newRange: [number, number]){
        const {attrRange} = this.state;
        if (attrRange)
            attrRange[attrIndex] = {id: attrIndex, min: newRange[0], max: newRange[1]};
        this.setState({attrRange})
    }
}

export function defaultInstance(dataMeta: DataMeta): (string|number)[]{
    const instance:(string|number)[]  = [];
    dataMeta.features.forEach(d => {
        if (d.type === 'categorical'){
            instance.push(d.categories![0]);
        }
        else {
            instance.push(d.min!);
        }
    })
    return instance
}

export function defaultSetting(dataMeta: DataMeta): QueryParams {
    const queryInstance: CounterFactual = defaultInstance(dataMeta);
    const target: number | string = dataMeta.target.type === 'categorical'?
        dataMeta.target.categories![0]: dataMeta.target.min!
    const prototypeCf: CounterFactual | null = defaultInstance(dataMeta);
    const k: number = dataMeta.features.length;
    const cfNum: number = 12;
    const attrFlex: boolean[] = dataMeta.features.map(d => true);
    // const filters: Filter[] = dataMeta.features.map((d, i) => ({id: i, categories: d.categories, min: d.min, max: d.max}));
    const attrRange: Filter[] = dataMeta.features.map((d, i) => ({id: i, categories: d.categories, min: d.min, max: d.max}));
    return {queryInstance, target, prototypeCf, k, cfNum, attrFlex, attrRange};
}
