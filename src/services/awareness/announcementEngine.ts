import {
  generateSpokenDescription,
  type SpatiallyAwareObject,
  type SpatialRegion,
} from "../spatialAwareness";
import type {
  AnnouncementDecision,
  AwarenessConfig,
  SceneComparisonResult,
  TrackedSceneObject,
} from "./types";

/**
 * Decides whether an announcement should be spoken based on scene comparison results,
 * spatial awareness analysis, and timing constraints.
 *
 * Follows Clean Code principles:
 * - Single Responsibility Principle (SRP): acts as a high-level orchestrator.
 * - Single Level of Abstraction Principle (SLAP): delegates specific policy,
 *   filtering, transformation, and formatting tasks to specialized helpers.
 *
 * Priority Rules:
 * 1. Guard against overlapping speech (silence if TTS is active).
 * 2. Guard against cognitive overload (silence if throttled by min interval).
 * 3. Newly detected objects take highest announcement priority.
 * 4. Changed objects (region shift or elapsed cooldown) take secondary priority.
 * 5. Persistent unchanged objects remain silent.
 *
 * @param comparison Result of scene comparison.
 * @param config Awareness configuration.
 * @param lastAnnouncementTime Timestamp of previous spoken announcement.
 * @param currentTime Current cycle timestamp.
 * @param isCurrentlySpeaking True if the TTS engine is currently vocalizing speech.
 */
export function decideAnnouncement(
  comparison: SceneComparisonResult,
  config: AwarenessConfig,
  lastAnnouncementTime: number,
  currentTime: number = Date.now(),
  isCurrentlySpeaking: boolean = false
): AnnouncementDecision {
  const speechGuardDecision = checkSpeechGuard(isCurrentlySpeaking);
  if (speechGuardDecision) {
    return speechGuardDecision;
  }

  const throttleGuardDecision = checkThrottleGuard(
    currentTime,
    lastAnnouncementTime,
    config.minAnnouncementIntervalMs
  );
  if (throttleGuardDecision) {
    return throttleGuardDecision;
  }

  if (comparison.newObjects.length > 0) {
    return handleNewObjectsAnnouncement(comparison.newObjects, currentTime);
  }

  if (comparison.changedObjects.length > 0) {
    const changedDecision = handleChangedObjectsAnnouncement(
      comparison.changedObjects,
      config.objectCooldownMs,
      currentTime
    );
    if (changedDecision) {
      return changedDecision;
    }
  }

  return createSilentDecision(
    "No meaningful change observed in the scene (remaining silent)"
  );
}

// ============================================================================
// Guard Helpers
// ============================================================================

/**
 * Checks if speech output is currently active and suppresses new announcements.
 */
function checkSpeechGuard(
  isCurrentlySpeaking: boolean
): AnnouncementDecision | null {
  if (isCurrentlySpeaking) {
    return createSilentDecision("Speech playback currently active");
  }
  return null;
}

/**
 * Enforces the minimum time interval between announcements to avoid cognitive overload.
 */
function checkThrottleGuard(
  currentTime: number,
  lastAnnouncementTime: number,
  minIntervalMs: number
): AnnouncementDecision | null {
  const timeSinceLastAnnouncement = currentTime - lastAnnouncementTime;
  if (timeSinceLastAnnouncement < minIntervalMs) {
    return createSilentDecision(
      `Throttled: ${timeSinceLastAnnouncement}ms since last announcement (< ${minIntervalMs}ms)`
    );
  }
  return null;
}

// ============================================================================
// Announcement Candidate Handlers
// ============================================================================

/**
 * Processes newly detected objects, formats spatial descriptions, and marks them announced.
 */
function handleNewObjectsAnnouncement(
  newObjects: TrackedSceneObject[],
  currentTime: number
): AnnouncementDecision {
  const spatialObjects = toSpatiallyAwareObjects(newObjects);
  const spokenText = generateSpokenDescription(spatialObjects);

  markObjectsAnnounced(newObjects, currentTime);

  return {
    shouldSpeak: true,
    spokenText,
    reason: `New objects observed: ${formatObjectNames(newObjects)}`,
    announcedObjects: newObjects,
  };
}

/**
 * Evaluates changed objects against cooldown and movement criteria, generating speech if qualified.
 */
function handleChangedObjectsAnnouncement(
  changedObjects: TrackedSceneObject[],
  cooldownMs: number,
  currentTime: number
): AnnouncementDecision | null {
  const qualifiedChanged = changedObjects.filter((obj) =>
    qualifiesForChangeAnnouncement(obj, cooldownMs, currentTime)
  );

  if (qualifiedChanged.length === 0) {
    return null;
  }

  markObjectsAnnounced(qualifiedChanged, currentTime);

  const spokenText = qualifiedChanged
    .map(formatMovementDescription)
    .join(" ");

  return {
    shouldSpeak: true,
    spokenText,
    reason: `Objects changed position: ${formatObjectNames(qualifiedChanged)}`,
    announcedObjects: qualifiedChanged,
  };
}

/**
 * Determines whether a changed object meets the criteria for position change announcement.
 */
function qualifiesForChangeAnnouncement(
  obj: TrackedSceneObject,
  cooldownMs: number,
  currentTime: number
): boolean {
  const regionChanged = obj.region !== obj.lastAnnouncedRegion;
  const cooldownElapsed = currentTime - obj.lastAnnouncedAt >= cooldownMs;
  return regionChanged || cooldownElapsed;
}

// ============================================================================
// Data Transformation & State Helpers
// ============================================================================

/**
 * Maps tracked scene objects into SpatiallyAwareObject instances for the spatial awareness service.
 */
function toSpatiallyAwareObjects(
  objects: TrackedSceneObject[]
): SpatiallyAwareObject[] {
  return objects.map((obj) => ({
    classId: obj.classId,
    className: obj.className,
    confidence: obj.confidence,
    region: obj.region,
    normalizedCenter: obj.normalizedCenter,
    boundingBox: obj.boundingBox,
  }));
}

/**
 * Updates the announcement timestamp and announced region for tracked objects.
 */
function markObjectsAnnounced(
  objects: TrackedSceneObject[],
  currentTime: number
): void {
  for (const obj of objects) {
    obj.lastAnnouncedAt = currentTime;
    obj.lastAnnouncedRegion = obj.region;
  }
}

// ============================================================================
// Text Formatting & Decision Factory Helpers
// ============================================================================

/**
 * Formats a comma-separated list of object class names for log and reason tracking.
 */
function formatObjectNames(objects: TrackedSceneObject[]): string {
  return objects.map((obj) => obj.className).join(", ");
}

/**
 * Formats a human-friendly movement sentence for a single object.
 */
function formatMovementDescription(obj: TrackedSceneObject): string {
  const cleanName = capitalize(obj.className.replace(/_/g, " "));
  const destination = getRegionDestination(obj.region);
  return `${cleanName} moved to ${destination}.`;
}

/**
 * Returns a natural spoken prepositional phrase for a spatial region.
 */
function getRegionDestination(region: SpatialRegion): string {
  switch (region) {
    case "LEFT":
      return "the left";
    case "CENTER":
      return "the center";
    case "RIGHT":
      return "the right";
  }
}

/**
 * Capitalizes the first letter of a string.
 */
function capitalize(text: string): string {
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Factory creating a standard silent AnnouncementDecision.
 */
function createSilentDecision(reason: string): AnnouncementDecision {
  return {
    shouldSpeak: false,
    spokenText: null,
    reason,
    announcedObjects: [],
  };
}
