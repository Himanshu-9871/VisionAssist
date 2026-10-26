import type { Detection } from "../objectDetection";
import type { SpatialRegion } from "../spatialAwareness";

/**
 * Lifecycle states of the automatic awareness mode.
 */
export type AwarenessStatus = "INACTIVE" | "ACTIVE" | "PAUSED";

/**
 * Configuration options for the awareness service and decision engine.
 */
export interface AwarenessConfig {
  /**
   * Interval in milliseconds between capture & inference cycles.
   * Default: 1500 ms.
   */
  captureIntervalMs: number;

  /**
   * Intersection over Union (IoU) threshold for matching objects across frames.
   * Default: 0.35.
   */
  iouMatchThreshold: number;

  /**
   * Normalized center horizontal shift threshold (0.0 to 1.0).
   * If an object's normalized horizontal position shifts by more than this,
   * it is flagged as having moved.
   * Default: 0.18.
   */
  centerShiftThreshold: number;

  /**
   * Number of consecutive frames an object can be missing before being confirmed departed.
   * Prevents a single missing detection from treating an object as disappeared.
   * Default: 2.
   */
  consecutiveMissingThreshold: number;

  /**
   * Cooldown period in milliseconds before re-announcing an unchanged persistent object.
   * Default: 15000 ms.
   */
  objectCooldownMs: number;

  /**
   * Minimum time gap in milliseconds between spoken announcements.
   * Prevents rapid back-to-back speech.
   * Default: 2500 ms.
   */
  minAnnouncementIntervalMs: number;

  /**
   * Whether to speak short status messages on Start, Pause, Resume, and Stop.
   * Default: true.
   */
  speakStatusTransitions: boolean;
}

/**
 * Represents an object tracked over multiple awareness cycles.
 */
export interface TrackedSceneObject {
  /** Unique tracking identifier */
  id: string;

  /** Model class ID */
  classId: number;

  /** Human-readable class name */
  className: string;

  /** Latest detection confidence (0.0 - 1.0) */
  confidence: number;

  /** Latest bounding box coordinates */
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  /** Lateral position region: LEFT, CENTER, or RIGHT */
  region: SpatialRegion;

  /** Normalized horizontal center coordinate (0.0 - 1.0) */
  normalizedCenter: number;

  /** Timestamp when the object was first observed */
  firstSeenAt: number;

  /** Timestamp when the object was last observed */
  lastSeenAt: number;

  /** Number of consecutive cycles in which this object was not detected */
  consecutiveMissingFrames: number;

  /** Timestamp when this object was last included in a spoken announcement */
  lastAnnouncedAt: number;

  /** Spatial region when last announced */
  lastAnnouncedRegion: SpatialRegion;

  /** Flag indicating if this object was newly observed in the current cycle */
  isNew: boolean;

  /** Flag indicating if this object moved or changed position meaningfully */
  hasMovement: boolean;
}

/**
 * Results of comparing the current frame detections against previously tracked objects.
 */
export interface SceneComparisonResult {
  /** Objects observed for the first time in this cycle */
  newObjects: TrackedSceneObject[];

  /** Objects that moved laterally across regions or shifted position significantly */
  changedObjects: TrackedSceneObject[];

  /** Objects that remain present without meaningful positional change */
  persistentObjects: TrackedSceneObject[];

  /** Objects that have been absent for >= consecutiveMissingThreshold cycles */
  departedObjects: TrackedSceneObject[];

  /** Complete list of actively tracked objects (including temporarily missing ones) */
  allTrackedObjects: TrackedSceneObject[];
}

/**
 * Result of the decision engine determining whether to speak an announcement.
 */
export interface AnnouncementDecision {
  /** True if an announcement should be spoken aloud */
  shouldSpeak: boolean;

  /** The spoken announcement text, or null if remaining silent */
  spokenText: string | null;

  /** Internal explanation of the decision for debugging/telemetry */
  reason: string;

  /** List of tracked objects that triggered this announcement */
  announcedObjects: TrackedSceneObject[];
}

/**
 * Complete summary of one awareness cycle.
 */
export interface AwarenessCycleResult {
  timestamp: number;
  status: AwarenessStatus;
  detections: Detection[];
  trackedObjects: TrackedSceneObject[];
  comparison: SceneComparisonResult;
  decision: AnnouncementDecision;
  durationMs: number;
}

/**
 * Structured error report during awareness operations.
 */
export interface AwarenessError {
  stage: "CAPTURE" | "DETECTION" | "COMPARISON" | "DECISION" | "TTS";
  message: string;
  error?: Error | unknown;
}
