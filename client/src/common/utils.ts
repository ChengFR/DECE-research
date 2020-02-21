
export const getTextWidth = function() {
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

export const shallowCompare = (v: any, o: any, excludeKeys?: Set<string>) => {
  for (let key in v) {
    if (excludeKeys && excludeKeys.has(key)) continue;
    if (!(key in o) || v[key] !== o[key]) return false;
  }

  for (let key in o) {
    if (excludeKeys && excludeKeys.has(key)) continue;
    if (!(key in v) || v[key] !== o[key]) return false;
  }

  return true;
};


export function number2string(x: number): string {
  if (Number.isInteger(x)) return x.toFixed(0);
  return x.toPrecision(4);
}