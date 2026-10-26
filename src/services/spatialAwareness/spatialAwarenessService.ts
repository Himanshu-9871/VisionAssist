import type { Detection } from "../objectDetection";
import { capitalize, getPluralName } from "../../utils/grammar";
import { DEFAULT_SPATIAL_THRESHOLDS } from "./config";
import type {
  SpatialDescriptionResult,
  SpatiallyAwareObject,
  SpatialRegion,
  SpatialThresholdConfig,
} from "./types";

/**
 * Converts a spatial region enum into natural spoken English phrasing.
 */
export function getRegionPhrase(region: SpatialRegion): string {
  switch (region) {
    case "LEFT":
      return "on the left";
    case "CENTER":
      return "in the center";
    case "RIGHT":
      return "on the right";
  }
}

/**
 * Classifies a normalized horizontal coordinate into a spatial region (LEFT, CENTER, RIGHT).
 *
 * @param normalizedX Horizontal position normalized between 0.0 and 1.0.
 * @param config Horizontal boundary thresholds.
 */
export function classifyHorizontalPosition(
  normalizedX: number,
  config: SpatialThresholdConfig = DEFAULT_SPATIAL_THRESHOLDS
): SpatialRegion {
  if (normalizedX < config.leftThreshold) {
    return "LEFT";
  }
  if (normalizedX <= config.rightThreshold) {
    return "CENTER";
  }
  return "RIGHT";
}

/**
 * Computes spatial regions for an array of detections given the original image width.
 *
 * - Calculates each bounding box horizontal center: `x + width / 2`.
 * - Normalizes against the original image width: `centerX / imageWidth`.
 * - Classifies as `LEFT`, `CENTER`, or `RIGHT` using configurable horizontal thresholds.
 * - Safely handles invalid image dimensions, non-finite values, and empty detections.
 * - Preserves class name, confidence, and bounding box.
 *
 * Note: Horizontal position strictly indicates lateral placement in the field of view,
 * not physical distance or collision risk.
 *
 * @param detections Raw detection results from the object detection service.
 * @param imageWidth Original width of the captured photo in pixels.
 * @param config Configurable horizontal thresholds.
 */
export function analyzeSpatialDetections(
  detections: Detection[] | null | undefined,
  imageWidth: number,
  config: SpatialThresholdConfig = DEFAULT_SPATIAL_THRESHOLDS
): SpatiallyAwareObject[] {
  if (!detections || !Array.isArray(detections) || detections.length === 0) {
    return [];
  }

  if (
    typeof imageWidth !== "number" ||
    !Number.isFinite(imageWidth) ||
    imageWidth <= 0
  ) {
    console.warn(
      `[SpatialAwareness] Invalid imageWidth: ${imageWidth}. Cannot calculate spatial positioning.`
    );
    return [];
  }

  const results: SpatiallyAwareObject[] = [];

  for (const det of detections) {
    if (!det || !det.boundingBox) {
      continue;
    }

    const { x, y, width, height } = det.boundingBox;

    // Validate bounding box coordinates
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0
    ) {
      console.warn(
        "[SpatialAwareness] Skipping detection with invalid bounding box:",
        det
      );
      continue;
    }

    // Horizontal center: x + width / 2
    const centerX = x + width / 2;

    // Normalize against original image width and clamp between 0 and 1
    const normalizedCenter = Math.max(0, Math.min(1, centerX / imageWidth));
    const region = classifyHorizontalPosition(normalizedCenter, config);

    results.push({
      classId: det.classId,
      className: det.className,
      confidence: det.confidence,
      region,
      normalizedCenter,
      boundingBox: {
        x,
        y,
        width,
        height,
      },
    });
  }

  return results;
}

/**
 * Generates a concise spoken description from spatially aware detections.
 *
 * - Avoids duplicate announcements for multiple detections of the same class in the same region.
 *   E.g., two bottles in the center -> "2 bottles in the center" rather than repeated announcements.
 * - Orders announcements logically: LEFT -> CENTER -> RIGHT.
 * - Returns "No objects detected." when no valid detections exist.
 * - Does not claim the area is clear or safe.
 *
 * Example output:
 * "Person on the left. Bottle in the center. Chair on the right."
 *
 * @param spatialObjects Array of classified detections.
 */
export function generateSpokenDescription(
  spatialObjects: SpatiallyAwareObject[] | null | undefined
): string {
  if (
    !spatialObjects ||
    !Array.isArray(spatialObjects) ||
    spatialObjects.length === 0
  ) {
    return "No objects detected.";
  }

  // Group detections by region and class to prevent duplicate announcements
  const regionOrder: SpatialRegion[] = ["LEFT", "CENTER", "RIGHT"];
  const sentences: string[] = [];

  for (const region of regionOrder) {
    const objectsInRegion = spatialObjects.filter(
      (item) => item.region === region
    );

    if (objectsInRegion.length === 0) {
      continue;
    }

    // Count detections per class name in this region, preserving max confidence for sorting
    const classCounts = new Map<
      string,
      { count: number; maxConfidence: number }
    >();

    for (const obj of objectsInRegion) {
      const name = obj.className.toLowerCase().trim();
      const existing = classCounts.get(name);
      if (existing) {
        existing.count += 1;
        existing.maxConfidence = Math.max(existing.maxConfidence, obj.confidence);
      } else {
        classCounts.set(name, { count: 1, maxConfidence: obj.confidence });
      }
    }

    // Sort objects by confidence descending for clearer prioritization
    const sortedEntries = Array.from(classCounts.entries()).sort(
      (a, b) => b[1].maxConfidence - a[1].maxConfidence
    );

    for (const [rawClassName, { count }] of sortedEntries) {
      const regionPhrase = getRegionPhrase(region);
      const displayName = getPluralName(rawClassName, count);

      if (count === 1) {
        sentences.push(`${capitalize(displayName)} ${regionPhrase}.`);
      } else {
        sentences.push(`${count} ${displayName} ${regionPhrase}.`);
      }
    }
  }

  if (sentences.length === 0) {
    return "No objects detected.";
  }

  return sentences.join(" ");
}

/**
 * Complete pipeline helper: analyzes spatial detections and generates
 * both structured spatial objects and spoken description text.
 *
 * @param detections Raw detections from object detection service.
 * @param imageWidth Original width of the captured photo.
 * @param config Optional custom spatial threshold configuration.
 */
export function describeDetections(
  detections: Detection[] | null | undefined,
  imageWidth: number,
  config: SpatialThresholdConfig = DEFAULT_SPATIAL_THRESHOLDS
): SpatialDescriptionResult {
  const spatialObjects = analyzeSpatialDetections(detections, imageWidth, config);
  const description = generateSpokenDescription(spatialObjects);

  return {
    spatialObjects,
    description,
  };
}
