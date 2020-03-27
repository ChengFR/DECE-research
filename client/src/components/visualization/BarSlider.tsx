import * as _ from "lodash";
import * as React from "react";
import { Slider, InputNumber, Row, Col, Divider, Icon } from 'antd';
// import {SwapRightOutlined} from '@ant-design/icons';
import { FeatureDisc } from "../../data/dataset"

import { BandSliderOptions, drawBandSlider} from './slider'
import {drawSimpleBarchart} from './_barchart'

import './BarSlider.scss'

export interface BarSliderProps extends BandSliderOptions{
    data: ArrayLike<string>;
    style?: React.CSSProperties;
    svgStyle?: React.CSSProperties;
    className?: string;
    defaultInstanceValue?: string,
    defaultBarActivation?: boolean[]
    feature: FeatureDisc;
    cfValue?: string;
    xScale?: d3.ScaleBand<string>;
    editable: boolean;
    drawInput: boolean;
    onValueChange: (newValue: string) => void;
    onUpdateCats: (newCats: string[]) => void;
}

export interface BarSliderState {
    instanceValue: string,
    barActivation: boolean[],
}

export class BarSlider extends React.Component<BarSliderProps, BarSliderState>{
    private barRef: React.RefObject<SVGGElement> = React.createRef();
    private sliderRef: React.RefObject<SVGGElement> = React.createRef();
    constructor(props: BarSliderProps) {
        super(props);
        const {defaultValue, defaultBarActivation, feature} = this.props;
        this.state = {
            instanceValue: defaultValue?defaultValue: feature.categories![0],
            barActivation: defaultBarActivation?defaultBarActivation: feature.categories!.map(d => true)
        }

        this.onBarSelected = this.onBarSelected.bind(this);
        this.onValueChange =  this.onValueChange.bind(this);
        this.drawAll = this.drawAll.bind(this);
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
                <g ref={this.barRef} />
                <g ref={this.sliderRef} />
            </svg>
        </div>
    </div>
    }

    componentDidMount(){
        this.drawAll();
    }
    componentDidUpdate(){
        this.drawAll();
    }

    drawAll(){
        const {width, height, margin, data, xScale} = this.props;
        const {instanceValue, barActivation} = this.state;
        const sliderNode = this.sliderRef.current;
        const barChartNode = this.barRef.current;
        const onValueChange = this.onValueChange;
        if (barChartNode) {
            drawSimpleBarchart(barChartNode, {width, height, margin, xScale}, data)
        }
        if (sliderNode){
            drawBandSlider(sliderNode, {width, height, margin, xScale, defaultValue: instanceValue, onValueChange}, data);
        }
        

    }

    onBarSelected(index: number){
        const {onUpdateCats, feature} = this.props;
        const {barActivation} = this.state;
        barActivation[index] = !barActivation[index];
        this.setState({barActivation});
        onUpdateCats && onUpdateCats(feature.categories!.filter((d, i) => barActivation[i]));
    }

    onValueChange(newValue: string){
        const {onValueChange} = this.props;
        this.setState({instanceValue: newValue});
        onValueChange && onValueChange(newValue);
    }
}