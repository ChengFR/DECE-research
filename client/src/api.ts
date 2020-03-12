import axios, { AxiosResponse } from "axios";
import * as d3 from "d3";
import { DataFrame, DataMeta, Dataset } from "./data";
import { ROOT_URL, DEV_MODE } from "./env";

const API = `${ROOT_URL}/api`;

function checkResponse<T>(response: AxiosResponse<T>, fallback: T): T {
  if (response.status === 200) return response.data;
  console.error(`Data fetching error: ${response.status}`);
  if (DEV_MODE) {
    console.error(response);
    throw response;
  }
  return fallback;
}

export async function getData(params: { dataId: string }): Promise<string[][]> {
  const url = `${API}/data`;
  const response = await axios.get(url, { params });
  const data = checkResponse(response, []);
  const dataset = d3.csvParseRows(data);
  return dataset;
}

export async function getDataMeta(params: {
  dataId: string;
  modelId?: string;
}): Promise<DataMeta> {
  const url = `${API}/data_meta`;
  const response = await axios.get(url, { params });
  const data = checkResponse(response, []);
  return new DataMeta(data);
}

export async function getCFMeta(params: {
  dataId: string;
  modelId: string;
}): Promise<DataMeta> {
  const url = `${API}/cf_meta`;
  const response = await axios.get(url, { params });
  const data = checkResponse(response, []);
  return new DataMeta(data);
}

export async function getDataset(params: {
  dataId: string;
  modelId?: string;
}): Promise<Dataset> {
  let data = await getData(params);
  const columnNames = data[0];
  data = data.slice(1);
  const dataMeta = await getDataMeta(params);
  const categoricalColumns = [];
  if (dataMeta.target.type === "categorical") {
    categoricalColumns.push(columnNames[0]);
  }
  const columns = columnNames.map((name, i) => {
    const columnDisc = dataMeta.getColumnDisc(name);
    return {
      name,
      description: columnDisc?.description,
      type: columnDisc?.type || "unknown",
      ...columnDisc
    };
  });

  const index = data.map((row, i) =>
    dataMeta.index ? Number(row[dataMeta.index.index]) : i
  );
  const dataFrame = new DataFrame({ data, columns, index });
  // console.debug(dataFrame);
  return new Dataset(dataFrame, dataMeta);
}

// export interface CounterFactual {
//   features: (string | number)[];
//   prediction: number
// }

export type CounterFactual = (string | number)[];

export type Filter = {
  name: string;
  min?: number;
  max?: number;
  categories?: string[];
};

export interface CFResponse {
  index: number;
  counterfactuals: CounterFactual[];
}

export interface QueryParams {
  query_instance: CounterFactual;
  prototype_cf?: CounterFactual | null;
  k?: number;
  cf_num?: number;
  mutable_attr?: string[];
  filters?: Filter[];
  attr_range?: Filter[];
}

export async function getCF(params: {
  dataId: string;
  modelId: string;
  index: number;
}): Promise<CFResponse> {
  const url = `${API}/cf`;
  const response = await axios.get(url, { params });
  const data = checkResponse(response, []);
  return data;
}

export async function getCFs(params: {
  dataId: string;
  modelId: string;
  startIndex?: number;
  stopIndex?: number;
  index?: number[];
}): Promise<CFResponse[]> {
  const { index, ...rest } = params;
  const url = `${API}/cf`;
  const response = await axios.post(
    url,
    { index },
    {
      params: rest,
      headers: { "content-type": "application/json" }
    }
  );
  const data = checkResponse(response, []);
  return data;
}

export async function GetInstanceCF(
  params: QueryParams
): Promise<CounterFactual[]> {
  const url = `${API}/cf_instance`;
  const response = await axios.post(url, params);
  const data = checkResponse(response, []);
  console.log(data);
  return data;
}
