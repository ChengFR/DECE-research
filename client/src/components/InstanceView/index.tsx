import * as React from "react";
import * as d3 from "d3";
import { Card, Divider, Button, Icon } from "antd"
import { Dataset, DataMeta, IColumn } from "../../data";
import { CounterFactual, Filter, QueryParams } from "../../api"
import { drawHistogram, Histogram } from "../visualization/histogram"
import {createColumn, TableColumn} from "../Table/common"
import "./index.css"

export interface InstanceViewProps {
    CFMeta: DataMeta,
    dataset: Dataset,
    queryInstance?: CounterFactual,
    queryResults?: CounterFactual[],
    queryFunction: (param: QueryParams) => void,
    style?: Partial<StyleProps>
}

export interface StyleProps {
    histogramWidth: number,
    histogramHeight: number,
}

const defaultStypeProps: StyleProps = {
    histogramWidth: 200,
    histogramHeight: 50,
}

interface InstanceViewState {
    k: number;
    cf_num: number;
    filters: Filter[];
    mutable_attr: string[];
    attr_range: Filter[];
    prototype_cf: CounterFactual | null;
    queryInstanceTmp: CounterFactual | null;
}

export default class InstanceView extends React.Component<InstanceViewProps, InstanceViewState>{
    private styleProps: StyleProps;
    private svgRef: React.RefObject<SVGSVGElement>;

    constructor(props: InstanceViewProps) {
        super(props);
        this.state = {
            k: 1,
            cf_num: 1,
            filters: [],
            mutable_attr: props.CFMeta.features.map(d => d.name),
            attr_range: [],
            prototype_cf: null,
            queryInstanceTmp: null
        };
        this.styleProps = { ...defaultStypeProps, ...props.style };
        this.svgRef = React.createRef();
    }
    public render() {

        const { queryFunction, CFMeta, dataset} = this.props;
        const { k, cf_num, filters, mutable_attr, attr_range, prototype_cf, queryInstanceTmp } = this.state;
        const {histogramHeight, histogramWidth} = this.styleProps;

        return (
            <Card title={<span className="ant-card-head-title-text">Instance View</span>} style={{ height: "100%", width: "100%" }}>
                <div style={{ display: "inline-flex", float: "left" }}>
                    {/* <span className="form-item-font">number</span> */}
                    <Button type="primary" onClick={() => queryInstanceTmp &&
                        queryFunction({ query_instance: queryInstanceTmp, k, cf_num, filters, mutable_attr, attr_range, prototype_cf })}>Predict</Button>
                </div>
                <Divider />
                {/* <svg ref={this.svgRef} className="instance-view-svg" width="100%" height="80%"/> */}
                {CFMeta.features.map((d, i) => {
                    const column = createColumn(dataset.features[i])
                    return (column.type === 'numerical') ?
                        <Histogram
                            data={column.series.toArray()}
                            width={histogramWidth}
                            height={histogramHeight}
                            className="Instance-hist"
                            // margin={0}
                            style={{float: "left", marginLeft: "20px"}}
                            xScale={column.xScale}
                            onSelectRange={column.onFilter}
                            selectedRange={column.filter}
                            allData={column.prevSeries?.toArray()}
                            extent={column.extent}
                        /> : <div></div>
            })}
            </Card>
        );
    }
    // updateColumns(
    //     columns: (IColumn<string> | IColumn<number> | TableColumn)[],
    //     prevColumns?: TableColumn[]
    //   ): TableColumn[] {
    //     return columns.map((c, i) => {
    //       const prevColumn = prevColumns && prevColumns[i];
    //       if (prevColumn)
    //         return {...prevColumn, ...c} as TableColumn;
    //       return createColumn(c);
    //     });
    //   }

    public componentDidMount() {
        this.init();
    }

    public init() {

    }
}
