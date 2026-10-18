export type SpatialRegion = "LEFT" | "CENTER" | "RIGHT";

export interface SpatialThresholdConfig {
  /**
   * Normalized horizontal boundary separating LEFT from CENTER (0 to 1).
   * Detections with normalizedCenter < leftThreshold are classified as LEFT.
   * Default: 0.33
   */
  leftThreshold: number;

  /**
   * Normalized horizontal boundary separating CENTER from RIGHT (0 to 1).
   * Detections with leftThreshold <= normalizedCenter <= rightThreshold are classified as CENTER.
   * Detections with normalizedCenter > rightThreshold are classified as RIGHT.
   * Default: 0.66
   */
  rightThreshold: number;
}

export interface SpatiallyAwareObject {
  classId?: number;
  className: string;
  confidence: number;
  region: SpatialRegion;
  normalizedCenter: number;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface SpatialDescriptionResult {
  spatialObjects: SpatiallyAwareObject[];
  description: string;
}
