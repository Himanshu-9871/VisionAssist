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
 * Decides whether an announcement should be spoken based on scene comparison results,
 * spatial awareness analysis, and timing constraints.
 *
 * Rules:
 * - Silent if TTS is currently active (prevents overlapping speech).
 * - Silent if minimum time interval between announcements has not elapsed.
 * - Prioritizes newly detected objects using concise spatial phrasing.
 * - Announces meaningful position changes (e.g. object moved to center).
 * - Remains silent when persistent objects experience no meaningful change.
 * - Does not make unsubstantiated safety or collision claims.
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
  // 1. Guard against overlapping speech
  if (isCurrentlySpeaking) {
    return {
      shouldSpeak: false,
      spokenText: null,
      reason: "Speech playback currently active",
      announcedObjects: [],
    };
  }

  // 2. Enforce minimum interval between announcements to prevent cognitive overload
  const timeSinceLastAnnouncement = currentTime - lastAnnouncementTime;
  if (timeSinceLastAnnouncement < config.minAnnouncementIntervalMs) {
    return {
      shouldSpeak: false,
      spokenText: null,
      reason: `Throttled: ${timeSinceLastAnnouncement}ms since last announcement (< ${config.minAnnouncementIntervalMs}ms)`,
      announcedObjects: [],
    };
  }

  // 3. Newly detected objects take highest priority
  if (comparison.newObjects.length > 0) {
    // Map newly detected tracked objects into SpatiallyAwareObject format for spatialAwareness service
    const spatialObjects: SpatiallyAwareObject[] = comparison.newObjects.map(
      (obj) => ({
        classId: obj.classId,
        className: obj.className,
        confidence: obj.confidence,
        region: obj.region,
        normalizedCenter: obj.normalizedCenter,
        boundingBox: obj.boundingBox,
      })
    );

    const spokenText = generateSpokenDescription(spatialObjects);

    // Update announcement timestamp and region on the objects
    for (const obj of comparison.newObjects) {
      obj.lastAnnouncedAt = currentTime;
      obj.lastAnnouncedRegion = obj.region;
    }

    return {
      shouldSpeak: true,
      spokenText,
      reason: `New objects observed: ${comparison.newObjects.map((o) => o.className).join(", ")}`,
      announcedObjects: comparison.newObjects,
    };
  }

  // 4. Changed objects (objects whose region or position meaningfully shifted)
  if (comparison.changedObjects.length > 0) {
    const qualifiedChanged: TrackedSceneObject[] = [];
    const changeSentences: string[] = [];

    for (const obj of comparison.changedObjects) {
      // Announce if region changed from last announced region AND cooldown elapsed
      const regionChanged = obj.region !== obj.lastAnnouncedRegion;
      const cooldownElapsed =
        currentTime - obj.lastAnnouncedAt >= config.objectCooldownMs;

      if (regionChanged || cooldownElapsed) {
        qualifiedChanged.push(obj);
        obj.lastAnnouncedAt = currentTime;
        obj.lastAnnouncedRegion = obj.region;

        const cleanName = capitalize(obj.className.replace(/_/g, " "));
        const destination = getRegionDestination(obj.region);
        changeSentences.push(`${cleanName} moved to ${destination}.`);
      }
    }

    if (changeSentences.length > 0) {
      return {
        shouldSpeak: true,
        spokenText: changeSentences.join(" "),
        reason: `Objects changed position: ${qualifiedChanged.map((o) => o.className).join(", ")}`,
        announcedObjects: qualifiedChanged,
      };
    }
  }

  // 5. Persistent objects with no meaningful change -> Remain silent
  return {
    shouldSpeak: false,
    spokenText: null,
    reason: "No meaningful change observed in the scene (remaining silent)",
    announcedObjects: [],
  };
}
