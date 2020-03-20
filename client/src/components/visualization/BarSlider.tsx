import * as _ from "lodash";
import * as React from "react";
import { Slider, InputNumber, Row, Col, Divider, Icon } from 'antd';
// import {SwapRightOutlined} from '@ant-design/icons';
import { FeatureDisc } from "../../data/dataset"

import {drawSimpleSlider, SliderOptions} from './slider'
// import {drawSimpleHistogram, HistOption} from './_histogram'

import './BarSlider.scss'

export interface BarSliderProps extends SliderOptions{
    data: ArrayLike<string|number>;
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
}

export interface BarSliderState {
    instanceValue: number|string,
    range: string[],
}

export default class BarSlider extends React.Component<BarSliderProps, BarSliderState>{
    private barSvgGRef: React.RefObject<SVGGElement> = React.createRef();
    private sliderSvgGRef: React.RefObject<SVGGElement> = React.createRef();
    constructor(props: BarSliderProps) {
        super(props);

    }

    render(){
        const {className, height, width, svgStyle, style} = this.props;

        return <div className={(className || "") + " histslides"} style={{ ...style, width: width + 250 }}>
        {/* <div style={{width: 40, height: height, float: "left"}}>
            <span></span>
        </div> */}
        <div style={{ width: width, float: "left" }}>
            <svg
                style={svgStyle}
                width={width}
                height={height}
                className='hist-slider'
            >
                <g ref={this.barSvgGRef} />
                <g ref={this.sliderSvgGRef} />
            </svg>
        </div>
    </div>
    }

    componentDidMount(){

    }
    componentDidUpdate(){
        
    }

    drawAll(){

    }
}