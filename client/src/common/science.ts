import * as _ from "lodash";
import * as d3 from 'd3'

export function gini(data: any[][]) {
    const count = data.map(d => d.length);
    const sum = d3.sum(count);
    if (sum == 0) return 0
    else return 1 - d3.sum(count.map(c => (c/sum)**2));
}