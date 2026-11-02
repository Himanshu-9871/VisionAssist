import type { AwarenessConfig } from "./types";

/**
 * Named timing constants for awareness lifecycle scheduling.
 */
export const STARTUP_CYCLE_DELAY_MS = 800;
export const RESUME_CYCLE_DELAY_MS = 600;
export const MIN_CAPTURE_INTERVAL_MS = 500;

/**
 * Default configuration for the Automatic Awareness Mode.
 */
export const DEFAULT_AWARENESS_CONFIG: AwarenessConfig = {
  // Capture interval initially ~1500ms for prototype testing
  captureIntervalMs: 1500,

  // IoU threshold to correlate bounding boxes of the same class across frames
  iouMatchThreshold: 0.35,

  // Normalized horizontal center shift threshold to declare significant movement
  centerShiftThreshold: 0.18,

  // Number of consecutive missing frames before confirming an object is gone
  consecutiveMissingThreshold: 2,

  // Minimum time before re-announcing a persistent object that hasn't changed
  objectCooldownMs: 15000,

  // Minimum time gap between any two announcements to prevent audio overlapping
  minAnnouncementIntervalMs: 2500,

  // Vocalize status changes ("Awareness mode started.", "Awareness mode stopped.")
  speakStatusTransitions: true,
};
