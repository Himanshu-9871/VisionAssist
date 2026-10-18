import { SpatialThresholdConfig } from "./types";

/**
 * Standard horizontal spatial awareness boundaries.
 *
 * 0% ----------- 33% ----------- 66% ----------- 100%
 *       LEFT            CENTER           RIGHT
 */
export const DEFAULT_SPATIAL_THRESHOLDS: SpatialThresholdConfig = {
  leftThreshold: 0.33,
  rightThreshold: 0.66,
};
