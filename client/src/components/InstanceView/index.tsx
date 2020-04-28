import * as React from "react";
import * as d3 from "d3";
import { Card, Divider, Button, Icon, InputNumber, Select, Row, Col, Slider, Collapse, Switch } from "antd"
import { Dataset, DataMeta, IColumn, isNumericalFeature, CatFeatureDisc, NumFeatureDisc } from "../../data";
import { CounterFactual, Filter, QueryParams } from "../../api"
import { HistSlider } from "../visualization/HistSlider"
import { BarSlider } from '../visualization/BarSlider'
// import 
import { drawPcp } from "../visualization/pcp"
import { createColumn, TableColumn } from "../Table/common"
import "./index.css"
import Panel from "components/Panel";
import _ from "lodash";
import { defaultCategoricalColor } from "components/visualization/common";

const { Option } = Select;

export interface InstanceViewProps {
    CFMeta: Readonly<DataMeta>,
    dataset: Dataset,
    queryInstance?: CounterFactual,
    queryResults?: CounterFactual[],
    queryInstanceClass?: string,
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

interface InstanceViewState extends QueryParams {
    editable: boolean;
    hovered: boolean[];
    featureOrder: number[];
}

export default class InstanceView extends React.Component<InstanceViewProps, InstanceViewState>{
    private styleProps: StyleProps;
    private svgRef: React.RefObject<SVGSVGElement>;
    private xScales: (d3.ScaleBand<string> | d3.ScaleLinear<number, number>)[];
    private yScale?: d3.ScaleLinear<number, number>;
    private columns: TableColumn[]
    // private queryInstance?: CounterFactual;
    // private queryResults?: CounterFactual[];

    constructor(props: InstanceViewProps) {
        super(props);

        this.state = {
            ...defaultSetting(this.props.dataset.dataMeta),
            editable: true,
            hovered: this.props.dataset.dataMeta.features.map(d => false),
            featureOrder: _.range(this.props.CFMeta.features.length)
        };
        this.styleProps = { ...defaultStypeProps, ...props.style };
        this.svgRef = React.createRef();
        this.xScales = [];

        const { dataset } = this.props;
        const { histogramHeight, histogramWidth } = this.styleProps;

        this.columns = dataset.dataMeta.features.map((d, i) => {
            const rawColumn = createColumn(dataset.features[i])
            rawColumn.width = histogramWidth;
            return createColumn(rawColumn);
        })

        this.updateNumAttributeRange = this.updateNumAttributeRange.bind(this);
        this.updateAttributeValue = this.updateAttributeValue.bind(this);
        this.updateCatAttributeRange = this.updateCatAttributeRange.bind(this);

        this.onHover = this.onHover.bind(this);
        this.onMouseMove = this.onMouseMove.bind(this);
        this.onSwitchLock = this.onSwitchLock.bind(this);
        this.putFeatureToEnds = this.putFeatureToEnds.bind(this);
    }
    public render() {

        const { queryFunction, dataset } = this.props;
        const { editable, k, cfNum, attrFlex, attrRange, prototypeCf, queryInstance, target, hovered, featureOrder } = this.state;
        const { histogramHeight, histogramWidth } = this.styleProps;
        const dataMeta = dataset.dataMeta;

        const columns = dataMeta.features.map((d, i) => {
            const rawColumn = createColumn(dataset.features[i])
            rawColumn.width = histogramWidth;
            return createColumn(rawColumn);
        })

        const margin = { bottom: 30, top: 20, left: 10, right: 10 }
        this.xScales = featureOrder.map(d => columns[d].xScale);
        this.yScale = d3.scaleLinear<number, number>()
            .domain([0, columns.length])
            .range([histogramHeight - margin.bottom, columns.length * histogramHeight + histogramHeight - margin.bottom])

        return (
            <Panel
                // title={<div>
                //     <span className="ant-card-head-title-text">Instance View</span>
                //     <Button type={editable ? "link" : "link"} icon="edit" shape="circle" size="default"
                //         ghost={editable} style={{ float: "right" }}
                //         onClick={d => this.setState({ editable: !this.state.editable })}>
                //     </Button>
                // </div>}
                title="Instance View"
                initialWidth={280} initialHeight={700} x={5} y={5}
            >
                {this.labelPanel()}
                <Divider />
                {this.setting()}
                <Divider />
                <div className="instance-vis-container">
                    {/* <div className="instance-body-container"> */}
                    {/* <div className="hist-svg-container"> */}
                    {featureOrder.map((d, i) => {
                        const column = columns[d];
                        return <div className={"feature-container"}
                            key={i} onMouseOver={this.onHover.bind(this, d)} onMouseLeave={this.onMouseMove.bind(this, d)}>
                            <div className="feature-title">
                                <span>{column.name}</span>
                                {(attrFlex && !attrFlex[d]) ? <Icon type="lock" onClick={this.onSwitchLock.bind(this, d)} /> :
                                    hovered[d] && <Icon type="unlock" onClick={this.onSwitchLock.bind(this, d)} />}
                                {hovered[d] && <Icon type="down" onClick={this.putFeatureToEnds.bind(this, i)} />}
                            </div>
                            {(column.type === 'numerical') ?
                                <HistSlider
                                    column={column}
                                    width={histogramWidth}
                                    height={histogramHeight}
                                    className={`Instance-hist-${column.name}`}
                                    style={{ float: "left", height: histogramHeight }}
                                    margin={margin}
                                    xScale={column.xScale}
                                    ticks={10}
                                    editable={editable}
                                    drawInput={false}
                                    onValueChange={newValue => this.updateAttributeValue(d, newValue)}
                                    onRangeChange={newRange => this.updateNumAttributeRange(d, newRange)}
                                    drawRange={true}
                                    drawTick={true}
                                /> :
                                <BarSlider
                                    column={column}
                                    width={histogramWidth}
                                    height={histogramHeight}
                                    className={`Instance-bar-${column.name}`}
                                    style={{ float: "left", height: histogramHeight }}
                                    margin={margin}
                                    xScale={column.xScale}
                                    editable={editable}
                                    drawInput={false}
                                    onValueChange={newValue => this.updateAttributeValue(d, newValue)}
                                    onUpdateCats={newValue => this.updateCatAttributeRange(d, newValue)}
                                    barActivation={column.xScale.domain().map(d => true)}
                                />}
                        </div>

                    })}
                    {/* </div> */}
                </div>
                {!editable &&
                    <div className="pcp-svg-container">
                        <svg ref={this.svgRef} className="instance-view-svg"
                            style={{ float: "left" }}
                            width={histogramWidth}
                            height={histogramHeight * this.xScales.length} />
                    </div>
                }
                {/* </div> */}
                {/* </div> */}
            </Panel>
        );
    }

    onHover(index: number) {
        const { hovered } = this.state;
        hovered[index] = true;
        this.setState({ hovered });
    }

    onMouseMove(index: number) {
        const { hovered } = this.state;
        hovered[index] = false;
        this.setState({ hovered });
    }

    onSwitchLock(index: number) {
        const { attrFlex } = this.state;
        if (attrFlex) {
            attrFlex[index] = !attrFlex[index];
            this.setState({ attrFlex });
        }
    }

    setting() {
        const { queryFunction, dataset } = this.props;
        const { editable, k, cfNum, attrFlex, attrRange, prototypeCf, queryInstance, target } = this.state;
        const dataMeta = dataset.dataMeta;
        return <div style={{ width: "100%" }}>
            <Row>
                <Col span={6}>
                    <span className="setting-title">#counterfactuals:</span>
                </Col>
                <Col span={4}>
                </Col>
                <Col span={12}>
                    <Slider
                        min={1}
                        max={30}
                        defaultValue={12}
                        onChange={v => this.setState({ cfNum: v as number })}
                    />
                </Col>
            </Row>
            <Row>
                <Col span={6}>
                    <span className="setting-title">#features.:</span>
                </Col>
                <Col span={4}>
                </Col>
                <Col span={12}>
                    <Slider
                        min={1}
                        max={dataMeta.features.length}
                        defaultValue={dataMeta.features.length}
                        onChange={v => this.setState({ k: v as number })}
                    />
                </Col>
            </Row>
            <Row>
                <Col span={6}>
                    <span className="setting-title">editable</span>
                </Col>
                <Col span={1}>
                </Col>
                <Col span={12}>
                    <Switch
                        defaultChecked
                        onChange={d => this.setState({ editable: !this.state.editable })}
                    />
                </Col>
            </Row>
        </div>
    }

    controlPannel() {
        const { queryFunction, dataset } = this.props;
        const { editable, k, cfNum, attrFlex, attrRange, prototypeCf, queryInstance, target } = this.state;
        const dataMeta = dataset.dataMeta;

        const { Panel } = Collapse;

        return <div style={{ width: "100%" }}>
            <Row>
                <Col span={6}>
                    <span className="target-title">Target:</span>
                </Col>
                <Col span={12}>
                    {dataMeta.target && (dataMeta.target.type === 'numerical' ?
                        <InputNumber size="default" style={{ float: "left", minWidth: 120 }} /> :
                        <Select style={{ float: "left", minWidth: 120 }}
                            // value = {target}
                            onChange={v => this.setState({ target: v as string })}>
                            {!isNumericalFeature(dataMeta.target) && dataMeta.target.categories.map((d, i) => {
                                return (<Option key={i}>{d}</Option>)
                            })}
                        </Select>)
                    }
                </Col>
                <Col span={6}>
                    <Button type="primary" style={{ float: "right" }} icon="search"
                        onClick={() => {
                            this.setState({ editable: false });
                            queryInstance && queryFunction({
                                queryInstance, target,
                                k, cfNum, attrFlex, attrRange, prototypeCf
                            })
                        }}></Button>
                </Col>
            </Row>
        </div>

    }

    labelPanel() {
        const { queryFunction, dataset, queryInstanceClass, CFMeta } = this.props;
        const { editable, k, cfNum, attrFlex, attrRange, prototypeCf, queryInstance, target } = this.state;
        const dataMeta = dataset.dataMeta;
        const classes = (CFMeta.prediction! as CatFeatureDisc).categories;
        const layout = [8, 8, 4];
        const predClassId = queryInstanceClass !== undefined ? classes.indexOf(queryInstanceClass) : undefined;
        console.log(predClassId);
        const oppositeClass = predClassId !== undefined ? classes[predClassId ^ 1] : undefined;
        const predColor = predClassId !== undefined ? defaultCategoricalColor(predClassId) : "#eee";
        const targetColor = predClassId !== undefined ? defaultCategoricalColor(predClassId ^ 1) : "#eee";
        return <div style={{ width: "100%" }}>
            <Row>
                <Col span={layout[0]}>
                    <span className="target-title">Prediction:</span>
                </Col>
                <Col span={4}>

                </Col>
                <Col span={layout[1]}>
                    <span className="target-title">CF target:</span>
                </Col>
            </Row>

            <Row>
                <Col span={layout[0]}>
                    <div className={"label-div prediction"} style={{ backgroundColor: predColor }}>
                        {queryInstanceClass && <span className={"label-text"}>{queryInstanceClass}</span>}
                    </div>
                </Col>
                <Col span={4}>
                    <Icon type="right" />
                </Col>
                <Col span={layout[1]}>
                    <div className={"label-div label"} style={{ backgroundColor: targetColor }}>
                        {oppositeClass && <span className={"label-text"}>{oppositeClass}</span>}
                    </div>
                </Col>

                <Col span={layout[2]}>
                    <Button type="primary" icon="search" size="small"
                        onClick={() => {
                            this.setState({ editable: false });
                            queryInstance && queryFunction({
                                queryInstance, target,
                                k, cfNum, attrFlex, attrRange, prototypeCf
                            })
                        }}></Button>
                </Col>
            </Row>
        </div>
    }

    loadQueryCache() {
        const { CFMeta } = this.props;
        const index = CFMeta.features[0].name;
        const resultString = localStorage.getItem(`${index}-queryResults`);
        console.log(resultString);
        if (resultString)
            return JSON.parse(resultString) as CounterFactual[]
        else
            return undefined
        // if (queryResults)
        //     localStorage.setItem(`${index}-cfSubsets`, JSON.stringify(queryResults));

    }

    public componentDidMount() {
        this.init();
        this._drawPcp();
    }

    public componentDidUpdate(oldProps: InstanceViewProps, oldState: InstanceViewState) {
        const { queryResults, queryInstance } = this.props;
        const { featureOrder } = this.state
        // if (queryResults !== this.queryResults) {
        //     // this.setState({queryResults});
        //     // this.queryResults = queryResults;
        //     // this.cacheQueryResults();
        // }

        // // if (this.queryInstance)
        this.xScales = featureOrder.map(d => this.columns[d].xScale);
        const { editable } = this.state;
        if (!editable) {
            this._drawPcp();
        }
    }
    public init() {
        // this.setState({queryResults: this.loadQueryCache()});
        // this.queryResults = this.loadQueryCache();
    }

    public _drawPcp() {
        const { style, queryResults, queryInstanceClass, CFMeta } = this.props;
        const { queryInstance } = this.state;
        const { histogramHeight, histogramWidth } = this.styleProps;
        const node = this.svgRef.current;
        const margin = { bottom: 20, top: 5, left: 10, right: 10 }
        const classes = (CFMeta.prediction! as CatFeatureDisc).categories;

        if (node && queryResults && queryInstanceClass && this.yScale) {
            const goodResults = queryResults.filter(d => d[d.length - 1] !== queryInstanceClass);
            const badResults = queryResults.filter(d => d[d.length - 1] === queryInstanceClass);
            const validColor = defaultCategoricalColor(classes.indexOf(queryInstanceClass) ^ 1);
            const originalColor = defaultCategoricalColor(classes.indexOf(queryInstanceClass));
            drawPcp(node, goodResults.map(d => this.reorderInstance(d)),
                badResults.map(d => this.reorderInstance(d)),
                {
                    width: histogramWidth,
                    height: histogramHeight * this.xScales.length,
                    margin: margin,
                    x: this.xScales,
                    y: this.yScale,
                    validColor: validColor,
                    originalColor: originalColor,
                },
                this.reorderInstance(queryInstance)
            )
        }
    }

    reorderInstance(instance: CounterFactual) {
        return this.state.featureOrder.map(d => instance[d]);
    }

    putFeatureToEnds(idx: number) {
        const { featureOrder } = this.state;
        const realId = featureOrder[idx];
        featureOrder.splice(idx, 1);
        featureOrder.push(realId);
        this.setState({ featureOrder });
    }

    updateAttributeValue(attrIndex: number, newvalue: number | string) {
        const { queryInstance } = this.state;
        queryInstance[attrIndex] = newvalue;
        this.setState({ queryInstance });
    }

    updateNumAttributeRange(attrIndex: number, newRange: [number, number]) {
        const { attrRange } = this.state;
        const { dataset } = this.props;
        if (attrRange)
            attrRange[attrIndex] = { name: dataset.dataMeta.features[attrIndex].name, extent: [newRange[0], newRange[1]] };
        this.setState({ attrRange })
    }

    updateCatAttributeRange(attrIndex: number, newCats: string[]) {
        const { attrRange } = this.state;
        const { dataset } = this.props;
        if (attrRange)
            attrRange[attrIndex] = { name: dataset.dataMeta.features[attrIndex].name, categories: newCats };
        this.setState({ attrRange });
    }
}

export function defaultInstance(dataMeta: DataMeta): (string | number)[] {
    const instance: (string | number)[] = [];
    dataMeta.features.forEach(d => {
        if (!isNumericalFeature(d)) {
            instance.push(d.categories[0]);
        }
        else {
            instance.push(d.extent[0]);
        }
    })
    return instance
}

export function defaultSetting(dataMeta: DataMeta): QueryParams {
    const queryInstance: CounterFactual = defaultInstance(dataMeta);
    if (dataMeta.target) {
        const target: number | string = isNumericalFeature(dataMeta.target!) ?
            dataMeta.target!.extent[0] : dataMeta.target!.categories[0]
        const prototypeCf: CounterFactual | null = defaultInstance(dataMeta);
        const k: number = dataMeta.features.length;
        const cfNum: number = 12;
        const attrFlex: boolean[] = dataMeta.features.map(d => true);
        // const filters: Filter[] = dataMeta.features.map((d, i) => ({id: i, categories: d.categories, min: d.min, max: d.max}));
        const attrRange: Filter[] = dataMeta.features.map((d, i) => isNumericalFeature(d) ?
            { name: dataMeta.features[i].name, extent: [d.extent[0], d.extent[1]] } :
            { name: dataMeta.features[i].name, categories: d.categories });
        return { queryInstance, target, prototypeCf, k, cfNum, attrFlex, attrRange };
    }
    else {
        throw Error("target info should be provided in the datameta");
    }
}
