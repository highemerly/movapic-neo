declare module "topojson-simplify" {
  import type { Topology } from "topojson-specification";
  export function presimplify(topology: Topology): Topology;
  export function simplify(topology: Topology, threshold: number): Topology;
}
