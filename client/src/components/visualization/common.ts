import * as d3 from "d3";
import * as _ from 'lodash';
import { CSSProperties } from "react";

function colors(specifier: string) {
  let n = specifier.length / 6 | 0, colors: string[] = new Array(n), i = 0;
  while (i < n) colors[i] = "#" + specifier.slice(i * 6, ++i * 6);
  return colors;
}

export const schemeTableau10 = colors("4e79a7f28e2ce1575976b7b259a14fedc949af7aa1ff9da79c755fbab0ab");

export const defaultCategoricalColor = (i: number) => schemeTableau10[i % schemeTableau10.length];

export interface IMargin {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export type MarginType = number | Partial<IMargin>;

export const defaultMarginLeft = 10,
  defaultMarginRight = 10,
  defaultMarginTop = 2,
  defaultMarginBottom = 2;

export const defaultMargin = {
  top: defaultMarginTop,
  bottom: defaultMarginBottom,
  left: defaultMarginLeft,
  right: defaultMarginRight
};

export function getMargin(margin: MarginType): IMargin {
  if (typeof margin === "number") {
    return { top: margin, bottom: margin, left: margin, right: margin };
  } else {
    return {
      top: defaultMarginTop,
      bottom: defaultMarginBottom,
      left: defaultMarginLeft,
      right: defaultMarginRight,
      ...margin
    };
  }
}

export type PropertyValueFn<T, E extends d3.BaseType, Datum, Result> = {
  [P in keyof T]: Result | d3.ValueFn<E, Datum, Result>;
};

export type CSSPropertiesFn<E extends d3.BaseType, Datum> = PropertyValueFn<
  CSSProperties,
  E,
  Datum,
  string | number
>;

export interface ChartOptions {
  width: number;
  height: number;
  margin: MarginType;
}

export function getChildOrAppend<
  GElement extends d3.BaseType,
  PElement extends d3.BaseType
>(root: d3.Selection<PElement, any, any, any>, tag: string, className: string) {
  const node = root.selectAll(`${tag}.${className}`);

  node
    .data([tag])
    .enter()
    .append<GElement>(tag)
    .attr("class", className);

  return root.select<GElement>(`${tag}.${className}`);
}

export function getScaleLinear(
  data: ArrayLike<number>,
  x0: number,
  x1: number,
  extent?: [number, number]
): d3.ScaleLinear<number, number> {
  return d3
    .scaleLinear()
    .domain(extent || (d3.extent(data) as [number, number]))
    .nice()
    .range([x0, x1]);
}

export function countCategories(data: ArrayLike<string | number>, categories?: string[]) {
  const counter = _.countBy(data);
  const domain: string[] = categories || _.keys(counter).sort();
  return domain.map(
    (c, i) => ({
      count: counter[c] || 0,
      name: domain[i]
    })
  );
}

function getOuterPadding(
  width: number,
  nBars: number,
  innerPadding: number,
  maxStep: number
) {
  const minOuterPadding = Math.round(
    (width - maxStep * nBars + maxStep * innerPadding) / 2 / maxStep
  );
  let outerPadding = Math.max(minOuterPadding, innerPadding);
  return outerPadding;
}

export function getScaleBand(
  data: ArrayLike<string>,
  x0: number,
  x1: number,
  categories?: Readonly<string[]>,
  innerPadding: number = 0.25,
  maxStep = 35
): d3.ScaleBand<string> {
  let domain = categories || countCategories(data).map(d => d.name);
  const outerPadding = getOuterPadding(
    x1 - x0,
    domain.length,
    innerPadding,
    maxStep
  );
  return d3
    .scaleBand()
    .domain(domain)
    .paddingInner(innerPadding)
    .paddingOuter(outerPadding)
    .rangeRound([x0, x1]);
}

export const DELAY_PAINT_TIME = 100;

export function isStringArray(x: number[] | string[]): x is string[] {
  return typeof x[0] === 'string';
}
