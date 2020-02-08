import * as d3 from 'd3';
// import {scaleOrdinal, scaleLinear} from 'd3-scale';
import { MarginType, getMargin, CSSPropertiesFn, ChartOptions } from './common';


export interface IBarChartOptions extends ChartOptions {
}

export const defaultOptions: IBarChartOptions = {
  width: 300,
  height: 200,
  margin: 5,
};

export function BarChart(svg: SVGElement, data: number[], options?: Partial<IBarChartOptions>) {

}

export default BarChart;