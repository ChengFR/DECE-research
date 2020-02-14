import React from "react";
import {
  BrowserRouter as Router,
  Switch,
  Route,
  useParams
} from "react-router-dom";

import { getDataset, getCFs, getCFMeta } from "./api";
import { Dataset, DataMeta } from "./data";
// import logo from "./logo.svg";
import "./App.css";
import CFTableView from "./components/CFTableView";

export interface IAppProps {
  dataId: string;
  modelId?: string;
}

export interface IAppState {
  dataset?: Dataset;
  CFMeta?: DataMeta;
}

export class App extends React.Component<IAppProps, IAppState> {
  constructor(props: IAppProps) {
    super(props);
    this.state = {};
    this.updateData = this.updateData.bind(this);
  }

  public componentDidMount() {
    this.updateData();
  }

  public async updateData() {
    const { dataId, modelId } = this.props;
    const newState: Partial<IAppState> = {};
    newState.dataset = await getDataset({ dataId, modelId });
    if (modelId) {
      newState.CFMeta = await getCFMeta({ dataId, modelId });
    }
    // console.log(dataset);
    this.setState(newState);
  }

  public render() {
    const { dataId, modelId } = this.props;
    const { dataset, CFMeta } = this.state;
    return (
      <div className="App">
        {dataset && modelId && CFMeta && (
          <CFTableView
            dataset={dataset}
            CFMeta={CFMeta}
            getCFs={({ startIndex, stopIndex }) =>
              getCFs({ dataId, modelId, startIndex, stopIndex })
            }
          />
        )}
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
