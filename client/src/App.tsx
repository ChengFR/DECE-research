import React from "react";
import {
  BrowserRouter as Router,
  Switch,
  Route,
  useParams
} from "react-router-dom";

import { getDataset, getCFMeta, getSubsetCF, GetInstanceCF, CounterFactual, QueryParams, predictInstance, getDataMeta, Filter } from './api';
import { Dataset, DataMeta, CFSubset, buildDataFrame, CFDataFrame, DataFrame, validateData } from "./data";
// import logo from "./logo.svg";
import "./App.css";
import CompactTable from "./components/CompactTable";
import InstanceView from "./components/InstanceView"
import { assert } from "common/utils";

export interface IAppProps {
  dataId: string;
  modelId?: string;
}

export interface IAppState {
  dataMeta?: DataMeta;
  CFMeta?: DataMeta;
  dataset?: Dataset;

  defaultSubsetCF?: CFSubset;

  queryInstance?: CounterFactual;
  queryInstanceClass?: string,
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

    this.getSubset = this.getSubset.bind(this);
  }

  public componentDidMount() {
    this.initMeta();
    // this.initSubset();
  }

  public async initMeta() {
    const { dataId, modelId } = this.props;
    const dataMeta = await getDataMeta({ dataId, modelId });
    const CFMeta = await getCFMeta({ dataId, modelId });
    const dataset = await getDataset({ dataId, modelId });
    try {
      this.setState({ dataMeta, CFMeta, dataset });
    } catch (err) {
      console.log("Data loading fail", err);
    }

    await this.initSubset();
  }

  public async updateData() {
  }

  public async getSubset(params: { filters: Filter[] }) {
    const { dataset, CFMeta, dataMeta } = this.state;
    if (dataset && CFMeta && dataMeta) {
      const df = dataset.dataFrame.copy();
      df.filterBy(params.filters, true);
      const cfResponse = await getSubsetCF(params);
      const cfData = cfResponse.counterfactuals;
      const cfDataFrames = CFMeta.features.map((feat, i) => {
        const columns = [CFMeta.prediction!, CFMeta.target!, ...CFMeta.features].sort((a, b) => a.index - b.index);
        const cfDf = new DataFrame({ data: validateData(cfData[i], columns), columns: columns });
        assert(df.length === cfDf.length);

        const cfDataFrame = CFDataFrame.fromCFColumns(df.columns, cfDf.columns);
        return cfDataFrame
      })
      return new CFSubset(cfDataFrames, dataMeta, CFMeta, params.filters);
    }
    else {
      throw "Dataset information is missing."
    }
  }

  public async initSubset() {
    const { dataMeta } = this.state;
    if (dataMeta) {
      const defaultSubsetCF = await this.getSubset(({ filters: dataMeta.features.map(d => d) }));
      this.setState({ defaultSubsetCF });
    }
  }

  public async instanceQuery(params: QueryParams) {
    this.setState({ queryInstance: params.queryInstance })
    const queryInstanceClass = await predictInstance({ queryInstance: params.queryInstance });
    this.setState({ queryInstanceClass })
    const cfs = await GetInstanceCF(params);
    this.setState({ queryResults: cfs });
  }

  updateQueryInstance(queryInstance: CounterFactual) {
    this.setState({ queryInstance });
  }

  public render() {
    const { dataset, CFMeta, queryInstance, queryResults, queryInstanceClass, defaultSubsetCF } = this.state;
    return (
      <div className="App">
        { dataset && CFMeta && defaultSubsetCF && 
            <div className="main-container">
              {/* <div className="instance-view-container"> */}
              <InstanceView
                CFMeta={CFMeta}
                dataset={dataset}
                queryInstance={queryInstance}
                queryFunction={this.instanceQuery}
                queryResults={queryResults}
                queryInstanceClass={queryInstanceClass}
              />
              <CompactTable
                getSubsetCF={this.getSubset}
                defaultSubset={defaultSubsetCF}
              />
            </div>
          }
      </div>
    );
  }
}

function RoutedApp() {
  return (
    <Router>
      <Switch>
        <Route exact path="/">
          <Child />
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
