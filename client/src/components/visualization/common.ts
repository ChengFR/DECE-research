import * as d3 from 'd3';
import { CSSProperties } from 'react';

export interface IMargin {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export type MarginType = number | Partial<IMargin>;

export function getMargin(margin: MarginType): IMargin {
  if (typeof margin === 'number') {
    return {top: margin, bottom: margin, left: margin, right: margin};
  } else {
    return {top: 0, bottom: 0, left: 0, right: 0, ...margin};
  }
}

export type PropertyValueFn<T, E extends d3.BaseType, Datum, Result> = {
  [P in keyof T]: Result | d3.ValueFn<E, Datum, Result>
};

export type CSSPropertiesFn<E extends d3.BaseType, Datum> = PropertyValueFn<CSSProperties, E, Datum, string | number>;


export interface ChartOptions {
  width: number;
  height: number;
  margin: MarginType;
}

export function getChildOrAppend<
  GElement extends d3.BaseType,
  PElement extends d3.BaseType
>(root: d3.Selection<PElement, any, any, any>, tag: string, className: string) {
  const node = root
    .selectAll(`${tag}.${className}`);

  node.data([tag]).enter()
    .append<GElement>(tag)
    .attr("class", className);

  return root.select<SVGGElement>(`${tag}.${className}`);
}