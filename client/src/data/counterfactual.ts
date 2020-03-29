import { FeatureDisc, DataMeta } from './dataset'
import { Dataset } from './dataset'
import DataFrame, { IDataFrame } from './data_table'
import { Filter, CFResponse, SubsetCFResponse, CounterFactual } from '../api'
import {Series} from './column'

// export type CounterFactual = (string | number)[];

export interface CFSubsetProps {
    dataset: Readonly<Dataset>,
    filters: Filter[],
    cfData: CounterFactual[][]
}

export class CFSubset extends Dataset {
    private _dataset: Readonly<Dataset>;
    private _cfFrames: DataFrame[];
    private _filters: Filter[];
    constructor(props: CFSubsetProps) {
        const { dataset, filters, cfData } = props;
        const { dataMeta, dataFrame} = dataset;
        super(dataFrame.filterBy(filters), dataMeta);
        this._cfFrames = cfData.map(d => buildCFDataFrame(d, dataMeta));
        this._filters = filters;
        this._dataset = dataset
    }

    public cfTarget(index: number) {
        return this._cfFrames[index].columns[index];
    }

    public cfFrame(index: number) {
        return this._cfFrames[index];
    }

}

// export class CFSeries<T = number|string> {

// }

export function buildCFDataFrame(cfs: CounterFactual[], dataMeta: DataMeta): DataFrame {
// a tmp implementation
  const columns = dataMeta.features;
  if (dataMeta.prediction) {
    columns.push(dataMeta.prediction);
  }
  return new DataFrame({data: cfs, columns: columns});
}

export function buildCFSeries(cfs: (CFResponse | undefined)[], cfMeta: DataMeta, df: DataFrame): Series[] {
    const rowIndex = df.index;
    const columnNames = df.getColumnNames();
    return columnNames.map(c => {
      const col = cfMeta.getColumnDisc(c);
      if (col) {
        const colIndex = col.index;
        const cfData = rowIndex.map(i => {
          const cf = cfs[i];
          if (cf && cf.counterfactuals.length > 0) 
            return cf.counterfactuals[0][colIndex];
        else
          return undefined;
        });
        return new Series(cfData.length, j => cfData[j])
      }
      else {
          throw new Error("Colnum names do not match the dataset meta information.");
      }
    })
  }