export {
  classifyHorizontalPosition,
  analyzeSpatialDetections,
  generateSpokenDescription,
  describeDetections,
} from "./spatialAwarenessService";

export { DEFAULT_SPATIAL_THRESHOLDS } from "./config";

export type {
  SpatialRegion,
  SpatialThresholdConfig,
  SpatiallyAwareObject,
  SpatialDescriptionResult,
} from "./types";
