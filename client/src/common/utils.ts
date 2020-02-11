
export const getTextWidth = function() {
  const canvas = document.createElement("canvas");
  const func = (text: string, font: string = 'bold 12pt Arial'): number => {
    // re-use canvas object for better performance
    const context = canvas.getContext("2d")!;
    context.font = font;
    const metrics = context.measureText(text);
    return metrics.width;
  }
  return func;
}();