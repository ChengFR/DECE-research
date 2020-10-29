import * as React from "react";
import * as d3 from "d3";
import { Card, Divider, Button, Icon, InputNumber, Select, Row, Col, Slider, Collapse, Switch } from "antd"
import { Dataset, DataMeta, IColumn, isNumericalFeature, CatFeatureDisc, NumFeatureDisc } from "../../data";
import { CounterFactual, Filter, QueryParams } from "../../api"
import { HistSlider, BarSlider } from "../visualization/widgets"
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
    mainState: 'editing'|'loading'|'plotting';
    hovered: boolean[];
    featureOrder: number[];
}

export default class InstanceView extends React.Component<InstanceViewProps, InstanceViewState>{
    private styleProps: StyleProps;
    private svgRef: React.RefObject<SVGSVGElement>;
    private xScales: (d3.ScaleBand<string> | d3.ScaleLinear<number, number>)[];
    private yScale?: d3.ScaleLinear<number, number>;
    private columns: TableColumn[]

    constructor(props: InstanceViewProps) {
        super(props);

        this.state = {
            ...defaultSetting(this.props.dataset.dataMeta),
            mainState: 'editing',
            hovered: this.props.dataset.dataMeta.features.map(d => false),
            featureOrder: _.range(this.props.CFMeta.features.length)
        };
        this.styleProps = { ...defaultStypeProps, ...props.style };
        this.svgRef = React.createRef();
        this.xScales = [];

        const { dataset } = this.props;
        const { histogramWidth } = this.styleProps;

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

        this.query = this.query.bind(this);
    }
    public render() {

        const { dataset } = this.props;
        const { mainState, attrFlex, hovered, featureOrder } = this.state;
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
                title="Instance View"
                initialWidth={280} initialHeight={700} x={5} y={5}
            >
                {this.labelPanel()}
                <Divider />
                {this.setting()}
                <Divider />
                <div className="instance-vis-container">
                    <div className="axis-container">
                    {featureOrder.map((d, i) => {
                        const column = columns[d];
                        return <div className={"feature-container"}
                            key={i} onMouseOver={this.onHover.bind(this, d)} onMouseLeave={this.onMouseMove.bind(this, d)}>
                            <div className="feature-title">
                                <span>{column.name}</span>
                                {(attrFlex && !attrFlex[d]) ? <Icon type="lock" onClick={this.onSwitchLock.bind(this, d)} /> :
                                    hovered[d] && <Icon type="unlock" onClick={this.onSwitchLock.bind(this, d)} />}
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
                                    editable={mainState === 'editing'}
                                    drawInput={false}
                                    onValueChange={newValue => this.updateAttributeValue(d, newValue)}
                                    onRangeChange={newRange => this.updateNumAttributeRange(d, newRange)}
                                    drawRange={true}
                                    drawTick={true}
                                    precision={column.precision}
                                /> :
                                <BarSlider
                                    column={column}
                                    width={histogramWidth}
                                    height={histogramHeight}
                                    className={`Instance-bar-${column.name}`}
                                    style={{ float: "left", height: histogramHeight }}
                                    margin={margin}
                                    xScale={column.xScale}
                                    editable={mainState === 'editing'}
                                    drawInput={false}
                                    onValueChange={newValue => this.updateAttributeValue(d, newValue)}
                                    onUpdateCats={newValue => this.updateCatAttributeRange(d, newValue)}
                                    barActivation={column.xScale.domain().map(d => true)}
                                />}
                        </div>

                    })}
                    </div>
                    {mainState === 'plotting' &&
                    <div className="pcp-svg-container">
                        <svg ref={this.svgRef} className="instance-view-svg"
                            style={{ float: "left" }}
                            width={histogramWidth}
                            height={histogramHeight * this.xScales.length} />
                    </div>}
                </div>
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
        const { dataset } = this.props;
        const dataMeta = dataset.dataMeta;
        return <div style={{ width: "100%" }}>
            <Row>
                <Col span={6}>
                    <span className="setting-title">#counterfactuals:</span>
                </Col>
                <Col span={4}/>
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
                    <span className="setting-title">#features:</span>
                </Col>
                <Col span={4}/>
                <Col span={12}>
                    <Slider
                        min={1}
                        max={dataMeta.features.length}
                        defaultValue={dataMeta.features.length}
                        onChange={v => this.setState({ k: v as number })}
                    />
                </Col>
            </Row>
        </div>
    }

    async query(param: QueryParams){
        const {queryFunction} = this.props;
        await queryFunction(param);
        this.setState({ mainState: 'plotting' })
    }

    labelPanel() {
        const { queryFunction, dataset, queryInstanceClass, CFMeta } = this.props;
        const { mainState, k, cfNum, attrFlex, attrRange, prototypeCf, queryInstance, target } = this.state;
        const dataMeta = dataset.dataMeta;
        const classes = (CFMeta.prediction! as CatFeatureDisc).categories;
        const layout = [8, 8, 4];
        const predClassId = queryInstanceClass !== undefined ? classes.indexOf(queryInstanceClass) : undefined;
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

                <Col span={layout[2]}>{
                    (mainState==='editing' || mainState==='loading') && <Button type="primary" icon="search" size="small"
                        loading={mainState==='loading'}
                        onClick={() => {
                            this.setState({ mainState: 'loading' });
                            this.query({
                                queryInstance, target,
                                k, cfNum, attrFlex, attrRange, prototypeCf
                            })
                        }}></Button>
                    }
                    {mainState==='plotting' && <Button type="primary" icon="edit" size="small"
                        onClick={() => {
                            this.setState({ mainState: 'editing' });
                        }}></Button>
                    }
                </Col>
            </Row>
        </div>
    }

    public componentDidMount() {
        this._drawPcp();
    }

    public componentDidUpdate(oldProps: InstanceViewProps, oldState: InstanceViewState) {
        const { queryResults, queryInstance } = this.props;
        const { featureOrder } = this.state
        this.xScales = featureOrder.map(d => this.columns[d].xScale);
        const { mainState } = this.state;
        if (mainState === 'plotting') {
            this._drawPcp();
        }
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
        const attrRange: Filter[] = dataMeta.features.map((d, i) => isNumericalFeature(d) ?
            { name: dataMeta.features[i].name, extent: [d.extent[0], d.extent[1]] } :
            { name: dataMeta.features[i].name, categories: d.categories });
        return { queryInstance, target, prototypeCf, k, cfNum, attrFlex, attrRange };
    }
    else {
        throw Error("target info should be provided in the datameta");
    }
}
