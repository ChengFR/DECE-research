import axios, { AxiosResponse } from "axios";
import * as d3 from "d3";
import { DataFrame, DataMeta, Dataset, buildDataFrame } from "./data";
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
  modelId?: string;
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
  const dataMeta = await getDataMeta(params);
  const dataFrame = buildDataFrame(dataMeta, data);
  return new Dataset(dataFrame, dataMeta);
}

export type CounterFactual = (string | number)[];

export type Filter = {
  name: string,
  extent?: [number, number],
  categories?: string[]
}

export interface CFResponse {
  index: number;
  counterfactuals: CounterFactual[];
}

export interface SubsetCFResponse {
  index: number[];
  counterfactuals: CounterFactual[][];
}

export interface QueryParams {
  queryInstance: CounterFactual;
  target?: number | string;
  prototypeCf?: CounterFactual | null;
  k?: number;
  cfNum?: number;
  attrFlex?: boolean[];
  attrRange?: Filter[];
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

export async function getSubsetCF(params: {filters: Filter[]
}): Promise<SubsetCFResponse> {
  const url = `${API}/r_counterfactuals`;
  const response = await axios.post(url, { ...params });
  const data = checkResponse(response, []);
  return data;
}

export async function GetInstanceCF(
  params: QueryParams
): Promise<CounterFactual[]> {
  const url = `${API}/counterfactuals`;
  const response = await axios.post(url, params);
  const data = checkResponse(response, []);
  return data;
}

export async function predictInstance(
  params: {queryInstance: CounterFactual}
): Promise<string> {
  const url = `${API}/predict`;
  const response = await axios.post(url, params);
  const data = checkResponse(response, []);
  return data;
}
