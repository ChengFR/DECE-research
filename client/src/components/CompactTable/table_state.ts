import {combineReducers} from 'redux';
import * as _ from "lodash";

// State

export enum RowStateType {
  COLLAPSED = 0,
  EXPANDED = 1
}

export interface CollapsedRows {
  startIndex: number;
  endIndex: number;
  state: RowStateType;
  cfLoaded?: boolean;
}

export interface ExpandedRow {
  index: number;  // The index in a possibly reordered DataFrame
  dataIndex: number; // The real index of the row in the dataFrame
  state: RowStateType.EXPANDED;
  cfLoaded?: boolean;
}

export function isExpandedRow(row: CollapsedRows | ExpandedRow): row is ExpandedRow {
  return row.state === RowStateType.EXPANDED;
}

export type RowState = CollapsedRows | ExpandedRow;

export function initRowStates (nRows: number): RowState[] {
  return breakCollapsedRows({startIndex: 0, endIndex: nRows, state: RowStateType.COLLAPSED});
}

// Actions

export enum ActionType {
  COLLAPSE_ROWS = 'COLLAPSE_ROWS',
  EXPAND_ROWS = 'EXPAND_ROWS',
  REORDER_ROWS = 'REORDER_ROWS',
  FILTER_ROWS = 'FILTER_ROWS',
  SORT = 'SORT',
  FILTER = 'FILTER',
  UPDATE_COLUMNS = 'UPDATE_COLUMNS',
}

export interface Action {
  type: ActionType;
}

export interface CollapseRows extends Action {
  startIndex: number;
  endIndex: number;
  type: ActionType.COLLAPSE_ROWS;
}

export interface ExpandRows extends Action {
  startIndex: number;
  endIndex: number;
  dataIndex: number[];
  type: ActionType.EXPAND_ROWS;
}

export interface ReorderRows extends Action {
  type: ActionType.REORDER_ROWS;
  index: number[];
}

export interface FilterRows extends Action {
  type: ActionType.FILTER_ROWS;
  index: number[];
}

// Reducers

// break collapsed rows so that we won't render too many rows in a cell
function breakCollapsedRows(row: CollapsedRows, maxStep: number = 200): CollapsedRows[] {
  const {startIndex, endIndex, state} = row;
  const n = Math.ceil((endIndex - startIndex) / maxStep);
  if (n === 1) return [row];
  const step = Math.ceil((endIndex - startIndex) / n);
  const rows: CollapsedRows[] = [];
  for (let i = 0; i < n; ++i) {
    const start = startIndex + step * i, end = Math.min(start + step, endIndex);
    rows.push({startIndex: start, endIndex: end, state});
  }
  return rows;
}

function _collapseRows(rows: RowState[], action: CollapseRows) {
  const {startIndex, endIndex} = action;
  const start = rows.findIndex(v => {
    if (isExpandedRow(v)) return startIndex === v.index;
    return startIndex <= v.endIndex;
  });
  const end = _.findLastIndex(rows, v => {
    if (isExpandedRow(v)) return endIndex === v.index + 1;
    return v.startIndex <= endIndex;
  });
  if (start === -1 || end === -1) {
    console.error("This should not happen", rows, action);
  }
  console.debug('collapse start', start, '. collapse end', end);
  if (start === end) return rows;  // nothing to collapse;
  let replacedState: CollapsedRows;
  const startState = rows[start];
  if (isExpandedRow(startState)) {
    replacedState = {startIndex: startState.index, endIndex, state: RowStateType.COLLAPSED};
  } else {
    replacedState = {...startState, endIndex};
  }

  const endState = rows[end];
  if (isExpandedRow(endState)) {
    replacedState.endIndex = endState.index;
  } else {
    replacedState.endIndex = endState.endIndex;
  }
  
  return [...rows.slice(0, start), ...breakCollapsedRows(replacedState), ...rows.slice(end + 1) ];
}

function _expandRows(rows: RowState[], action: ExpandRows) {
  const {startIndex, endIndex, dataIndex} = action;
  const start = rows.findIndex(v => {
    if (isExpandedRow(v)) return false; // skipping this one
    return startIndex < v.endIndex;
  });
  const end = _.findLastIndex(rows, v => {
    if (isExpandedRow(v)) return false; // skipping this one
    return v.startIndex < endIndex;
  });
  if (start === -1 || end === -1) return rows; // nothing to expand

  const startState = rows[start], endState = rows[end];
  if (isExpandedRow(startState)) throw "This should not happen";
  if (isExpandedRow(endState)) throw "This should not happen";
  const replacedStates: RowState[] = [];
  if (startState.startIndex < startIndex) {
    replacedStates.push(...breakCollapsedRows({...startState, endIndex: startIndex}));
  }
  for (let index = startIndex; index < endIndex; index++) {
    replacedStates.push({index, dataIndex: dataIndex[index - startIndex], state: RowStateType.EXPANDED});
  }
  if (endIndex < endState.endIndex) {
    replacedStates.push(...breakCollapsedRows({...endState, startIndex: endIndex}));
  }
  return [...rows.slice(0, start), ...replacedStates, ...rows.slice(end + 1) ];

  // return rows.splice(start, end - start + 1, ...replacedStates);
}

function _remapRows(rows: RowState[], action: ReorderRows | FilterRows): RowState[] {
  const {index} = action;
  const index2new: (number | undefined)[] = [];
  // index.forEach((idx, i) => index2new[idx] = i);
  _.range(index.length).forEach((idx, i) => index2new[idx] = i);

  let expandedRows: ExpandedRow[] = rows.filter(r => isExpandedRow(r)) as ExpandedRow[];
  // The expandedRows with updated index
  expandedRows = expandedRows.map(r => ({...r, index: index2new[r.dataIndex]}))
    .filter(r => r.index !== undefined) as ExpandedRow[];
  expandedRows.sort((a, b) => a.index - b.index);
  const newRows: RowState[] = [];
  expandedRows.forEach((row, i, arr) => {
    if (i === 0 && row.index > 0) {
      newRows.push(...breakCollapsedRows({startIndex: 0, endIndex: row.index, state: RowStateType.COLLAPSED}));
    } else {
      const prev = arr[i-1];
      if (prev.index + 1 < row.index) {
        newRows.push(...breakCollapsedRows({startIndex: prev.index + 1, endIndex: row.index, state: RowStateType.COLLAPSED}));
      }
    }
    newRows.push(row);
  });
  if (expandedRows.length === 0) {
    newRows.push(...breakCollapsedRows({startIndex: 0, endIndex: index.length, state: RowStateType.COLLAPSED}));
  } else {
    const last = expandedRows[expandedRows.length - 1];
    if (last.index + 1 < index.length) {
      newRows.push(...breakCollapsedRows({startIndex: last.index + 1, endIndex: index.length, state: RowStateType.COLLAPSED}));
    }
  }
  return newRows;
}

export function reduceRows(rows: RowState[], action: CollapseRows | ExpandRows | ReorderRows | FilterRows) {
  switch (action.type) {
    case ActionType.COLLAPSE_ROWS:
      return _collapseRows(rows, action);
    case ActionType.EXPAND_ROWS:
      return _expandRows(rows, action);
    case ActionType.REORDER_ROWS:
      return _remapRows(rows, action);
    case ActionType.FILTER_ROWS:
        return _remapRows(rows, action);
    default:
      return rows;
  }
}

export function reorderRows(rows: RowState[], index: number[]) {
  const action = {type: ActionType.REORDER_ROWS, index} as ReorderRows;
  return reduceRows(rows, action);
}

export function filterRows(rows: RowState[], index: number[]) {
  const action = {type: ActionType.FILTER_ROWS, index} as FilterRows;
  return reduceRows(rows, action);
}

export function expandRows(rows: RowState[], startIndex: number, endIndex: number, dataIndex: number[]) {
  const action = {type: ActionType.EXPAND_ROWS, startIndex, endIndex, dataIndex} as ExpandRows;
  return reduceRows(rows, action);
}

export function collapseRows(rows: RowState[], startIndex: number, endIndex: number) {
  const action = {type: ActionType.COLLAPSE_ROWS, startIndex, endIndex} as CollapseRows;
  return reduceRows(rows, action);
}