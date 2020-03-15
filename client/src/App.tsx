import React from "react";
import {
  BrowserRouter as Router,
  Switch,
  Route,
  useParams
} from "react-router-dom";

// import { Responsive, WidthProvider } from "react-grid-layout";

import { Layout } from "antd"

import { getDataset, getCFs, getCFMeta, getCF, GetInstanceCF, CounterFactual, QueryParams, CFResponse } from './api';
import { Dataset, DataMeta } from "./data";
// import logo from "./logo.svg";
import "./App.css";
import CFTableView from "./components/CFTableView";
import TableView from "./components/TableView";
import CompactTable from "./components/CompactTable";
import InstanceView from "./components/InstanceView"

const { Header, Content, Sider } = Layout;

export interface IAppProps {
  dataId: string;
  modelId?: string;
}

export interface IAppState {
  dataset?: Dataset;
  cfs?: (CFResponse | undefined)[];
  CFMeta?: DataMeta;
  queryInstance?: CounterFactual;
  queryResults: CounterFactual[];
}

export class App extends React.Component<IAppProps, IAppState> {
  constructor(props: IAppProps) {
    super(props);
    this.state = {
      queryResults: [],
    };
    this.updateData = this.updateData.bind(this);
    this.instanceQuery = this.instanceQuery.bind(this);
  }

  public componentDidMount() {
    this.updateData();
  }

  public async updateData() {
    const { dataId, modelId } = this.props;
    const newState: Partial<IAppState> = {};
    newState.dataset = await getDataset({ dataId, modelId });
    if (modelId) {
      const params = { dataId, modelId };
      newState.CFMeta = await getCFMeta(params);
      const cfs = await getCFs({...params, index: newState.dataset.dataFrame.index});
      newState.cfs = [];
      cfs.forEach(cf => newState.cfs![cf.index] = cf);
    }
    // console.log(dataset);
    this.setState({ ...this.state, ...newState });
  }

  public async instanceQuery(params: QueryParams) {
    this.setState({ queryInstance: params.queryInstance })
    const cfs = await GetInstanceCF(params);
    console.log(`Query Results: ${cfs}`);
    this.setState({ queryResults: cfs });
  }

  public render() {
    const { dataId, modelId } = this.props;
    const { dataset, CFMeta, queryInstance, queryResults, cfs } = this.state;
    return (
      <div className="App">
        {dataset &&
          (modelId && CFMeta ? (
            <div className="main-container">
              <div className="instance-view-container">
                <InstanceView
                  CFMeta={CFMeta}
                  dataset={dataset}
                  queryInstance={queryInstance}
                  queryFunction={this.instanceQuery}
                  queryResults={queryResults}
                />
              </div>
              <div className="table-view-container">
                <CompactTable
                  dataset={dataset}
                  CFMeta={CFMeta}
                  cfs={cfs}
                  getCFs={(params) =>
                    getCFs({ dataId, modelId, ...params })
                  }
                  getCF={(index) => getCF({ dataId, modelId, index })}
                />
                </div>
            </div>
          ) : (
              <TableView dataset={dataset} />
            ))}
      </div>
    );
  }
}

function RoutedApp() {
  return (
    <Router>
      <Switch>
        <Route exact path="/">
          <div>Use '/:dataId' to view the data.</div>
        </Route>
        <Route path="/:dataId/:modelId?">
          <Child />
        </Route>
      </Switch>
    </Router>
  );
}

function Child(): JSX.Element {
  // We can use the `useParams` hook here to access
  // the dynamic pieces of the URL.
  const { dataId, modelId } = useParams<{ dataId: string; modelId?: string }>();
  return <App dataId={dataId} modelId={modelId} />;
}

export default RoutedApp;
