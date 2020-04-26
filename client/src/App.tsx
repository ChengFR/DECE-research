import React from "react";
import {
  BrowserRouter as Router,
  Switch,
  Route,
  useParams
} from "react-router-dom";

// import { Responsive, WidthProvider } from "react-grid-layout";

import { Layout } from "antd"

import { getDataset, getCFs, getCFMeta, getCF, getSubsetCF, GetInstanceCF, CounterFactual, QueryParams, CFResponse, SubsetCFResponse } from './api';
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
  defaultSetsubCF?: SubsetCFResponse;
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
    this.updateQueryInstance = this.updateQueryInstance.bind(this);
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
      // console.log(newState.CFMeta);
      const cfs = await getCFs({ ...params, index: newState.dataset.dataFrame.index });
      newState.cfs = [];
      cfs.forEach(cf => newState.cfs![cf.index] = cf);
      newState.defaultSetsubCF = await getSubsetCF({ filters: [] });
    }

    
    // console.log(dataset);
    this.setState({ ...this.state, ...newState });
    this.loadQueryInstance();
    this.loadQueryResults();
  }

  public async instanceQuery(params: QueryParams) {
    this.setState({ queryInstance: params.queryInstance })
    this.cacheQueryInstance();
    const cfs = await GetInstanceCF(params);
    console.log(`Query Results: ${cfs}`);
    this.setState({ queryResults: cfs });
    this.cacheQueryResults();
  }

  updateQueryInstance(queryInstance: CounterFactual){
    this.setState({queryInstance});
  }

  cacheQueryInstance() {
    const { CFMeta, queryInstance } = this.state;
    if (CFMeta && queryInstance) {
      const index = CFMeta.features[0].name;
      localStorage.setItem(`${index}-queryInstance`, JSON.stringify(queryInstance));
      console.log("queryInstance cached");
    }
  }

  loadQueryInstance() {
    const { CFMeta } = this.state;
    if (CFMeta) {
      const index = CFMeta.features[0].name;
      const resultString = localStorage.getItem(`${index}-queryInstance`);
      if (resultString) {
        const queryInstance: CounterFactual = JSON.parse(resultString);
        this.setState({ queryInstance });
        console.log("queryInstance loaded");
      }
    }
  }

  cacheQueryResults() {
    const { CFMeta, queryResults } = this.state;
    if (CFMeta && queryResults) {
      const index = CFMeta.features[0].name;
      localStorage.setItem(`${index}-queryResults`, JSON.stringify(queryResults));
      console.log("queryResults cached");
    }
  }

  loadQueryResults() {
    const { CFMeta } = this.state;
    if (CFMeta) {
      const index = CFMeta.features[0].name;
      const resultString = localStorage.getItem(`${index}-queryResults`);
      if (resultString) {
        const queryResults: CounterFactual[] = JSON.parse(resultString);
        this.setState({ queryResults });
        console.log("queryResults loaded");
      }
    }
  }

  public render() {
    const { dataId, modelId } = this.props;
    const { dataset, CFMeta, queryInstance, queryResults, cfs, defaultSetsubCF } = this.state;
    return (
      <div className="App">
        {dataset &&
          (modelId && CFMeta && defaultSetsubCF ? (
            <div className="main-container">
              {/* <div className="instance-view-container"> */}
              <InstanceView
                CFMeta={CFMeta}
                dataset={dataset}
                queryInstance={queryInstance}
                queryFunction={this.instanceQuery}
                queryResults={queryResults}
              />
              {/* </div> */}
              {/* <div className="table-view-container"> */}
              <CompactTable
                dataset={dataset}
                CFMeta={CFMeta}
                cfs={cfs}
                getCFs={(params) =>
                  getCFs({ dataId, modelId, ...params })
                }
                getCF={(index) => getCF({ dataId, modelId, index })}
                getSubsetCF={getSubsetCF}
                defaultSetsubCF={defaultSetsubCF}
                updateQueryInstance={this.updateQueryInstance}
              />
              {/* </div> */}
            </div>
          ) : (
              // <TableView dataset={dataset} />
              <div />
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
