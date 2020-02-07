import axios, { AxiosResponse } from 'axios';
import * as dataForge from 'data-forge';
import {DataFrame} from 'data-forge';
import { ROOT_URL, DEV_MODE } from './env';
import { DataMeta } from './typings';

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

export async function getData(params: {dataId: string}): Promise<DataFrame<number, number | string>> {
  const url = `${API}/data`;
  const response = await axios.get(url, {params});
  const data = checkResponse(response, []);
  const dataset = dataForge.fromCSV(data, {dynamicTyping: true});
  return dataset;
}

export async function getDataMeta(params: {dataId: string}): Promise<DataMeta> {
  const url = `${API}/data_meta`;
  const response = await axios.get(url, {params});
  return checkResponse(response, []);
}
