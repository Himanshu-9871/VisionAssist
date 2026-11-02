export {
  AwarenessController,
  type AwarenessControllerDependencies,
  type StatusChangeListener,
  type CycleCompleteListener,
  type ErrorListener,
} from "./awarenessController";

export { compareScenes, calculateIoU } from "./sceneComparison";
export { decideAnnouncement } from "./announcementEngine";
export {
  DEFAULT_AWARENESS_CONFIG,
  STARTUP_CYCLE_DELAY_MS,
  RESUME_CYCLE_DELAY_MS,
  MIN_CAPTURE_INTERVAL_MS,
} from "./config";
export { useAwarenessMode } from "./useAwarenessMode";

export type {
  AwarenessStatus,
  AwarenessConfig,
  TrackedSceneObject,
  SceneComparisonResult,
  AnnouncementDecision,
  AwarenessCycleResult,
  AwarenessError,
} from "./types";
