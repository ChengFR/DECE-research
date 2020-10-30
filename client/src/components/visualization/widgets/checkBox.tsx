import * as d3 from "d3";
import * as _ from "lodash";
// import {SwapRightOutlined} from '@ant-design/icons';
import {
    getMargin,
    CSSPropertiesFn,
    ChartOptions,
    getChildOrAppend,
    getScaleLinear,
    getScaleBand
} from "../common";
import './checkBox.scss'

export interface CheckBoxOptions extends ChartOptions {
    x: number,
    y: number,
    rx: number,
    ry: number,
    onClick: () => void,
    defaultValue: boolean,
}

const defaultCheckBoxOption: CheckBoxOptions = {
    height: 15,
    width: 15,
    margin: 0,
    x: 0,
    y: 0,
    rx: 1,
    ry: 1,
    defaultValue: true,
    onClick: () => { },
}

export function d3CheckBox(
    options: Partial<CheckBoxOptions>,
) {
    const { width, height, x, y, rx, ry, defaultValue, onClick } = { ...defaultCheckBoxOption, ...options };
    const margin = getMargin(options.margin || defaultCheckBoxOption.margin);
    let checked = defaultValue;

    function checkBox(rootEle: SVGGElement){
        const root = d3.select(rootEle);
        const base = getChildOrAppend(root, "g", "check-box-base")
            .attr("transform", `translate(${margin.left}, ${margin.top})`)
            .on("click", (d, i, n) => {
                checked = !checked;
                getChildOrAppend(d3.select(n[i]), "path", "check-box-mark")
                    .classed("check-box-mark-checked", checked)
                onClick();
            });

        const box = getChildOrAppend(base, "rect", "check-box")
            .attr("width", width)
            .attr("height", height)
            .attr("x", x)
            .attr("y", y)
            .attr("rx", rx)
            .attr("ry", ry);
            
        const coordinates: [number, number][] = [
            [x + width / 8, y + height / 3],
            [x + width / 2.2, y + height * 3 / 4],
            [x + width * 7 / 8, y + height / 10],
        ]

        const line = d3.line();

        const mark = getChildOrAppend(base, "path", "check-box-mark")
            .attr("d", line(coordinates)!)
            .classed("check-box-mark-checked", checked)
    }
    return checkBox
}