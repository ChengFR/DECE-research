import * as React from "react";
import { Grid, GridCellProps, ScrollParams, GridCellRenderer, GridProps } from "react-virtualized";

export interface IPureGridProps extends GridProps {
    cellRenderer: GridCellRenderer;
    rowCount: number;
    rowHeight: number | ((p: { index: number }) => number);
    containerStyle?: React.CSSProperties;
}

export default class PureGrid extends React.PureComponent<IPureGridProps> {
    static defaultProps = {
        height: 20,
        chartHeight: 60,
        fixedColumns: 0,
        rowCount: 1,
    };

    protected GridRef: React.RefObject<Grid> = React.createRef();
    protected columnWidth: any;

    constructor(props: IPureGridProps) {
        super(props);
        this.defaultCellRenderer = this.defaultCellRenderer.bind(this);
        this.renderCell = this.renderCell.bind(this);
    }

    componentDidUpdate(prevProps: IPureGridProps) {
        console.debug("recompute grid size");
        if (this.GridRef.current)
            this.GridRef.current.recomputeGridSize();
    }

    public recomputeGridSize(params?: { columnIndex?: number, rowIndex?: number }){
        if (this.GridRef.current)
            this.GridRef.current.recomputeGridSize(params);
    }

    public render() {
        const {
            height,
            width,
            style,
            containerStyle,
            className,
            ...rest
        } = this.props;

        return (
            <div
                className={`grid-wrapper ${className}`}
                style={{
                    ...containerStyle,
                    width: width,
                    height: height
                }}
            >
                <Grid
                    cellRenderer={this.renderCell}
                    className={`invisible-scrollbar`}
                    height={height}
                    ref={this.GridRef}
                    tabIndex={null}
                    width={width}
                    style={style}
                    {...rest}
                />
            </div>
        );
    }

    renderCell(cellProps: GridCellProps) {
        const { rowIndex, columnIndex, key, style} = cellProps;

        const { cellRenderer } = this.props;
        let result: React.ReactNode;
        if (cellRenderer) {
            result = cellRenderer(cellProps);
        }
        if (result === undefined) result = this.defaultCellRenderer();
        return (
            <div
                className={`cell row-${rowIndex} col-${columnIndex}`}
                key={key}
                style={style}
            >
                {result}
            </div>
        );
    }

    defaultCellRenderer() {
        return <div></div>;
    }
}
