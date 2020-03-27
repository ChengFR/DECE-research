import * as _ from "lodash";
import * as React from "react";
import { Slider, InputNumber, Row, Col, Divider, Icon } from 'antd';
// import {SwapRightOutlined} from '@ant-design/icons';
import { FeatureDisc } from "../../data/dataset"

import {drawLinearSlider, LinearSliderOptions} from './slider'
import {drawSimpleHistogram, HistOption} from './_histogram'

import './HistSlider.scss'

export interface HistSliderProps extends LinearSliderOptions, HistOption{
    data: ArrayLike<number>;
    style?: React.CSSProperties;
    svgStyle?: React.CSSProperties;
    className?: string;
    defaultInstanceValue?: number,
    defaultInstanceRange?: [number, number],
    feature: FeatureDisc;
    cfValue?: number;
    editable: boolean;
    drawInput: boolean;
    onRangeChange: (newRange: [number, number]) => void;
    onValueChange: (newValue: number) => void;
}

export interface HistSliderState {
    instanceValue: number,
    range: [number, number],
}

export class HistSlider extends React.Component<HistSliderProps, HistSliderState>{
    private svgRef: React.RefObject<SVGSVGElement> = React.createRef();
    private histSvgGRef: React.RefObject<SVGGElement> = React.createRef();
    private sliderSvgGRef: React.RefObject<SVGGElement> = React.createRef();
    constructor(props: HistSliderProps) {
        super(props);
        const { data, defaultInstanceRange, defaultInstanceValue, feature } = props;
        this.state = {
            instanceValue: defaultInstanceValue ? defaultInstanceValue : feature.min!,
            range: defaultInstanceRange ? defaultInstanceRange : [feature.min!, feature.max!],
        };
        this.onInstanceValueChange = this.onInstanceValueChange.bind(this);
        this.onRangeChange = this.onRangeChange.bind(this);
        this.paint = this.paint.bind(this);
    }

    public componentDidMount() {
        this.paint();
    }

    public componentDidUpdate() {
        window.setTimeout(this.paint, 50);
    }

    public paint() {
        const histNode = this.histSvgGRef.current;
        const sliderNode = this.sliderSvgGRef.current;
        const { ticks, width, height, margin, xScale } = this.props;
        const { instanceValue, range } = this.state;
        const { data } = this.props;
        if (histNode) {
            drawSimpleHistogram(histNode,
                {range,ticks, width, height, margin, xScale},
                data
            )
        }
        if (sliderNode) {
            drawLinearSlider(sliderNode,
                {
                    defaultValue: instanceValue,
                    defaultRange: range,
                    onRangeOneSideChange: this.onRangeChange,
                    onValueChange: this.onInstanceValueChange,
                    ticks, width, height, margin, xScale,
                    drawRange: true,
                    drawTick: true
                },
                data)
        }
    }

    public render() {
        const { style, svgStyle, className, width, height, cfValue, feature, drawInput } = this.props;
        const { instanceValue, range } = this.state;
        return (
            <div className={(className || "") + " histslides"} style={{ ...style, width: width + 250 }}>
                {/* <div style={{width: 40, height: height, float: "left"}}>
                    <span></span>
                </div> */}
                <div style={{ width: width, float: "left" }}>
                    <svg
                        ref={this.svgRef}
                        style={svgStyle}
                        width={width}
                        height={height}
                        className='hist-slider'
                    >
                        <g ref={this.histSvgGRef} />
                        <g ref={this.sliderSvgGRef} />
                    </svg>
                </div>
                {drawInput &&
                    <div className="controller-contrainer" style={{ width: 200, height: height, float: "left" }}>
                        <Row className="row-text">
                            <span className="feature-name">{feature.name}</span>
                        </Row>
                        <Divider style={{ marginTop: 5, marginBottom: 5 }} />
                        <Row className="row-range">
                            <InputNumber
                                size="small"
                                className="range-input-left"
                                style={{ width: 60, float: "left" }}
                                value={Math.min(range[0], range[1])}
                                precision={feature.precision ? feature.precision : 0}
                            />
                            <div className="connector" />
                            <InputNumber
                                size="small"
                                className="range-input-right"
                                style={{ width: 60, float: "left" }}
                                value={Math.max(range[0], range[1])}
                                precision={feature.precision ? feature.precision : 0}
                            />
                        </Row>
                        <Row className="row-value">
                            <InputNumber
                                size="small"
                                className="instance-input"
                                style={{ width: 60, float: "left" }}
                                value={instanceValue}
                                precision={feature.precision ? feature.precision : 0}
                            />
                            {/* <SwapRightOutline /> */}
                            <div className="place-holder" />
                            <InputNumber
                                size="small"
                                className="cf-input"
                                style={{ width: 60, float: "left" }}
                                value={cfValue ? cfValue : instanceValue}
                                precision={feature.precision ? feature.precision : 0}
                            />
                        </Row>
                    </div>}
                {/* <InputNumber
                    style={{ width: 60, float: "left", height: 30 }}
                /> */}
            </div>

        );
    }
    public onInstanceValueChange(newValue: number) {
        const { onValueChange } = this.props;
        this.setState({ instanceValue: newValue });
        onValueChange && onValueChange(newValue);
    }
    public onRangeChange(index: number, newValue: number) {
        // const { onRangeChange } = this.props;
        const range = this.state.range;
        range[index] = newValue;
        this.setState({ range: range });
        this.props.onRangeChange && this.props.onRangeChange([Math.min(range[0], range[1]), Math.max(range[0], range[1])]);
    }


}