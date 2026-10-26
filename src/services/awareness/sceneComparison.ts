import type { Detection } from "../objectDetection";
import { classifyHorizontalPosition } from "../spatialAwareness";
import type { AwarenessConfig, SceneComparisonResult, TrackedSceneObject } from "./types";

/**
 * Calculates the Intersection-over-Union (IoU) of two bounding boxes.
 */
export function calculateIoU(
  boxA: { x: number; y: number; width: number; height: number },
  boxB: { x: number; y: number; width: number; height: number }
): number {
  const xA = Math.max(boxA.x, boxB.x);
  const yA = Math.max(boxA.y, boxB.y);
  const xB = Math.min(boxA.x + boxA.width, boxB.x + boxB.width);
  const yB = Math.min(boxA.y + boxA.height, boxB.y + boxB.height);

  const intersectionArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
  if (intersectionArea <= 0) return 0;

  const boxAArea = boxA.width * boxA.height;
  const boxBArea = boxB.width * boxB.height;
  const unionArea = boxAArea + boxBArea - intersectionArea;

  if (unionArea <= 0) return 0;
  return intersectionArea / unionArea;
}

/**
 * Generates a lightweight unique ID for tracked objects.
 */
function generateTrackingId(className: string, timestamp: number): string {
  const randomPart = Math.random().toString(36).substring(2, 7);
  return `${className}_${timestamp}_${randomPart}`;
}

/**
 * Compares current frame detections against previously tracked scene objects.
 *
 * Implements:
 * - Correlation by class name and bounding-box IoU / spatial proximity.
 * - Detection of newly observed objects.
 * - Detection of meaningfully changed objects (lateral movement across regions or significant center shift).
 * - Persistence tracking to reduce repetitive announcements.
 * - Missing-frame smoothing: avoids interpreting a single missed detection as object departure.
 *
 * @param currentDetections Raw detections from the current inference cycle.
 * @param imageWidth Original width of the image in pixels.
 * @param previousTracked Tracked objects from the previous cycle.
 * @param config Awareness configuration.
 * @param currentTime Current cycle timestamp (milliseconds).
 */
export function compareScenes(
  currentDetections: Detection[] | null | undefined,
  imageWidth: number,
  previousTracked: TrackedSceneObject[] = [],
  config: AwarenessConfig,
  currentTime: number = Date.now()
): SceneComparisonResult {
  const validDetections = Array.isArray(currentDetections) ? currentDetections : [];
  const safeImageWidth = Number.isFinite(imageWidth) && imageWidth > 0 ? imageWidth : 640;

  const newObjects: TrackedSceneObject[] = [];
  const changedObjects: TrackedSceneObject[] = [];
  const persistentObjects: TrackedSceneObject[] = [];
  const departedObjects: TrackedSceneObject[] = [];

  // Track which previously tracked objects have been matched in this cycle
  const matchedPrevIndices = new Set<number>();

  // Process each current detection
  for (const det of validDetections) {
    if (!det || !det.boundingBox) continue;

    const centerX = det.boundingBox.x + det.boundingBox.width / 2;
    const normalizedCenter = Math.max(0, Math.min(1, centerX / safeImageWidth));
    const currentRegion = classifyHorizontalPosition(normalizedCenter);

    let bestMatchIndex = -1;
    let highestScore = -1;

    // Search for the best match among previously tracked objects of the same class
    for (let i = 0; i < previousTracked.length; i++) {
      if (matchedPrevIndices.has(i)) continue;

      const prev = previousTracked[i];
      if (prev.className.toLowerCase() !== det.className.toLowerCase()) continue;

      const iou = calculateIoU(det.boundingBox, prev.boundingBox);
      const centerDist = Math.abs(normalizedCenter - prev.normalizedCenter);

      const heightRatio =
        Math.min(det.boundingBox.height, prev.boundingBox.height) /
        Math.max(det.boundingBox.height, prev.boundingBox.height);
      const widthRatio =
        Math.min(det.boundingBox.width, prev.boundingBox.width) /
        Math.max(det.boundingBox.width, prev.boundingBox.width);
      const yDist =
        Math.abs(det.boundingBox.y - prev.boundingBox.y) / safeImageWidth;

      // Candidate matching score:
      // 1. Highest priority: high bounding box IoU
      // 2. Partial overlap with reasonable center distance
      // 3. Proximity without overlap (camera slight jitter)
      // 4. Same class with consistent scale and vertical elevation shifted laterally
      let matchScore = 0;
      if (iou >= config.iouMatchThreshold) {
        matchScore = 2.0 + iou;
      } else if (iou > 0) {
        matchScore = 1.2 + iou - centerDist;
      } else if (centerDist < 0.2) {
        matchScore = 0.8 - centerDist;
      } else if (
        heightRatio > 0.6 &&
        widthRatio > 0.6 &&
        yDist < 0.25 &&
        centerDist < 0.55
      ) {
        matchScore = 0.5 + (heightRatio + widthRatio) / 4 - centerDist;
      }

      if (matchScore > 0 && matchScore > highestScore) {
        highestScore = matchScore;
        bestMatchIndex = i;
      }
    }

    if (bestMatchIndex !== -1) {
      // MATCHED: Existing object persisted or moved
      matchedPrevIndices.add(bestMatchIndex);
      const prev = previousTracked[bestMatchIndex];

      // Check if the object moved laterally across regions or shifted center significantly
      const regionChanged = currentRegion !== prev.lastAnnouncedRegion;
      const centerShifted =
        Math.abs(normalizedCenter - prev.normalizedCenter) >= config.centerShiftThreshold;
      const hasMovement = regionChanged || centerShifted;

      const updatedObj: TrackedSceneObject = {
        ...prev,
        confidence: det.confidence,
        boundingBox: { ...det.boundingBox },
        region: currentRegion,
        normalizedCenter,
        lastSeenAt: currentTime,
        consecutiveMissingFrames: 0,
        isNew: false,
        hasMovement,
      };

      if (hasMovement) {
        changedObjects.push(updatedObj);
      } else {
        persistentObjects.push(updatedObj);
      }
    } else {
      // UNMATCHED: Newly observed object
      const newObj: TrackedSceneObject = {
        id: generateTrackingId(det.className, currentTime),
        classId: det.classId,
        className: det.className,
        confidence: det.confidence,
        boundingBox: { ...det.boundingBox },
        region: currentRegion,
        normalizedCenter,
        firstSeenAt: currentTime,
        lastSeenAt: currentTime,
        consecutiveMissingFrames: 0,
        lastAnnouncedAt: 0,
        lastAnnouncedRegion: currentRegion,
        isNew: true,
        hasMovement: false,
      };

      newObjects.push(newObj);
    }
  }

  // Handle unmatched previously tracked objects (absent in this cycle)
  const remainingTracked: TrackedSceneObject[] = [];

  for (let i = 0; i < previousTracked.length; i++) {
    if (matchedPrevIndices.has(i)) continue;

    const prev = previousTracked[i];
    const missingCount = prev.consecutiveMissingFrames + 1;

    if (missingCount < config.consecutiveMissingThreshold) {
      // Tolerate intermittent detection drops: retain in tracking pool
      remainingTracked.push({
        ...prev,
        consecutiveMissingFrames: missingCount,
        isNew: false,
        hasMovement: false,
      });
    } else {
      // Confirmed departed after consecutive missing threshold
      departedObjects.push({
        ...prev,
        consecutiveMissingFrames: missingCount,
      });
    }
  }

  // Compile full active tracked objects pool for the next cycle
  const allTrackedObjects = [
    ...newObjects,
    ...changedObjects,
    ...persistentObjects,
    ...remainingTracked,
  ];

  return {
    newObjects,
    changedObjects,
    persistentObjects,
    departedObjects,
    allTrackedObjects,
  };
}
