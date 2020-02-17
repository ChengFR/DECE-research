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
}

export interface ExpandedRow {
  index: number;
  state: RowStateType.EXPANDED;
}

export function isExpandedRow(row: CollapsedRows | ExpandedRow): row is ExpandedRow {
  return row.state === RowStateType.EXPANDED;
}

export type RowState = CollapsedRows | ExpandedRow;

export interface TableState {
  rows: RowState[];
}

export function initTableState (nRows: number): TableState {
  return {
    rows: [{startIndex: 0, endIndex: nRows, state: RowStateType.COLLAPSED}]
  };
}

// Actions

export enum ActionType {
  COLLAPSE_ROWS = 'COLLAPSE_ROWS',
  EXPAND_ROWS = 'EXPAND_ROWS',
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
  type: ActionType.EXPAND_ROWS;
}

// Reducers

function collapseRows(rows: RowState[], action: CollapseRows) {
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
  
  return rows.splice(start, end - start + 1, replacedState);
}

function expandRows(rows: RowState[], action: ExpandRows) {
  const {startIndex, endIndex} = action;
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
    replacedStates.push({...startState, endIndex: startIndex});
  }
  for (let i = startIndex; i < endIndex; i++) {
    replacedStates.push({index: i, state: RowStateType.EXPANDED});
  }
  if (endIndex < endState.endIndex) {
    replacedStates.push({...endState, startIndex: endIndex});
  }
  return rows.splice(start, end - start + 1, ...replacedStates);
}

function reduceRows(rows: RowState[], action: CollapseRows | ExpandRows) {
  switch (action.type) {
    case ActionType.COLLAPSE_ROWS:
      return collapseRows(rows, action);
    case ActionType.EXPAND_ROWS:
      return expandRows(rows, action);
    default:
      console.error("This should not happen");
      return rows;
  }
 
}

export const reducer = combineReducers({
  rows: reduceRows
})