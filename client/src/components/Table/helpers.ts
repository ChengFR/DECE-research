import memoize from 'fast-memoize';

export const getFixedGridWidth = memoize((fixedColumns: number, columnWidths: number[]): number => {
  let width = 0;
  for (let index = 0; index < fixedColumns; index++) {
    width += columnWidths[index];
  }
  return width;
});

export const IndexWidth = 25;


export const defaultChartMargin = {
  left: 10,
  right: 10,
  top: 2,
  bottom: 2,
};