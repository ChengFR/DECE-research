import { AssertionError } from "assert";

export const getTextWidth = function () {
  const canvas = document.createElement("canvas");
  const func = (text: string, font: string = 'bold 14pt Arial'): number => {
    // re-use canvas object for better performance
    const context = canvas.getContext("2d")!;
    context.font = font;
    const metrics = context.measureText(text);
    return metrics.width;
  }
  return func;
}();

export const shallowCompare = (v: any, o: any, excludeKeys?: Set<string>, debug: boolean = false) => {
  for (let key in v) {
    if (excludeKeys && excludeKeys.has(key)) continue;
    if (!(key in o) || v[key] !== o[key]) {
      if (debug) console.debug(`key ${key}`);
      return false;
    }
  }

  for (let key in o) {
    if (excludeKeys && excludeKeys.has(key)) continue;
    if (!(key in v) || v[key] !== o[key]) {
      if (debug) console.debug(`key ${key}`);
      return false;
    }
  }

  return true;
};

export function decile2precision(max: number, decile: number = 0): number {
  if (max >= 1)
    return Math.ceil(Math.log10(max)) + decile;
  else 
    return decile;
}

export function number2string(x: number, precision: number = 4): string {
  if (Number.isInteger(x)) return x.toFixed(0);
  return x.toPrecision(precision);
}

export function assert(cond: any, message: any = ""): asserts cond {
  if (cond) return;
  throw new AssertionError(message);
}

export type WithDefault<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export function notEmpty<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined
}