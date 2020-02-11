import React from "react";
import {
  BrowserRouter as Router,
  Switch,
  Route,
  useParams
} from "react-router-dom";

import { getDataset } from "./api";
import { Dataset } from "./data";
// import logo from "./logo.svg";
import "./App.css";
import Table from "./components/Table";
import Panel from "./components/Panel";

export interface IAppProps {
  dataId: string;
  modelId?: string;
}

export interface IAppState {
  dataset?: Dataset;
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
    const dataset = await getDataset({ dataId });
    console.log(dataset);
    this.setState({ dataset });
  }

  public render() {
    const { dataset } = this.state;
    return (
      <div className="App">
        <Panel title="Table View" initialWidth={800} initialHeight={600}>
          {dataset && <Table dataFrame={dataset.dataFrame} />}
        </Panel>
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
