import axios, { AxiosResponse } from 'axios';
import * as d3 from 'd3';
import { IDataFrame, DataFrame, DataMeta, Dataset } from './data';
import { ROOT_URL, DEV_MODE } from './env';

const API = `${ROOT_URL}/api`;

function checkResponse<T>(response: AxiosResponse<T>, fallback: T): T {
  if (response.status === 200)
    return response.data;
  console.error(`Data fetching error: ${response.status}`);
  if (DEV_MODE) {
    console.error(response);
    throw response;
  }
  return fallback;
}

export async function getData(params: {dataId: string}): Promise<string[][]> {
  const url = `${API}/data`;
  const response = await axios.get(url, {params});
  const data = checkResponse(response, []);
  const dataset = d3.csvParseRows(data);
  return dataset;
}

export async function getDataMeta(params: {dataId: string}): Promise<DataMeta> {
  const url = `${API}/data_meta`;
  const response = await axios.get(url, {params});
  const data = checkResponse(response, []);
  return new DataMeta(data.features, data.target);
}

export async function getDataset(params: {dataId: string}): Promise<Dataset> {
  let data = await getData(params);
  const columnNames = data[0];
  data = data.slice(1);
  const dataMeta = await getDataMeta(params);
  const categoricalColumns = [];
  if (dataMeta.target.type === 'categorical') {
    categoricalColumns.push(columnNames[0]);
  }
  const columnSpecs = columnNames.map((name, i) => {
    const columnDisc = dataMeta.getColumnDisc(name);
    return {name, description: columnDisc?.description, type: columnDisc?.type || "unknown"};
  });
  const dataFrame = new DataFrame({data, columnSpecs})
  return {dataFrame, dataMeta};
}
