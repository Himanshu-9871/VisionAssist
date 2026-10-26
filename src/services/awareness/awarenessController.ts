import type { Frame } from "../../shared/types/Frame";
import type { TtsOptions } from "../../shared/types/TtsOptions";
import type { Detection } from "../objectDetection";
import { decideAnnouncement } from "./announcementEngine";
import { DEFAULT_AWARENESS_CONFIG } from "./config";
import { compareScenes } from "./sceneComparison";
import type {
  AnnouncementDecision,
  AwarenessConfig,
  AwarenessCycleResult,
  AwarenessError,
  AwarenessStatus,
  TrackedSceneObject,
} from "./types";

/* eslint-disable @typescript-eslint/no-require-imports */
function getDefaultDetectObjects() {
  const { detectObjectsFromImage } = require("../objectDetection");
  return detectObjectsFromImage;
}

function getDefaultSpeak() {
  const { speak } = require("../tts");
  return speak;
}

function getDefaultStopSpeech() {
  const { stopSpeech } = require("../tts");
  return stopSpeech;
}

function getDefaultIsSpeaking() {
  const { isSpeaking } = require("../tts");
  return isSpeaking;
}

export interface AwarenessControllerDependencies {
  captureFrame: () => Promise<Frame | null>;
  detectObjects?: (
    uri: string,
    width?: number,
    height?: number
  ) => Promise<Detection[]>;
  speakText?: (message: string, options?: TtsOptions) => Promise<void>;
  stopSpeechFn?: () => Promise<void>;
  isSpeakingFn?: () => Promise<boolean>;
}

export type StatusChangeListener = (status: AwarenessStatus) => void;
export type CycleCompleteListener = (result: AwarenessCycleResult) => void;
export type ErrorListener = (error: AwarenessError) => void;

/**
 * Dedicated Awareness Controller orchestrating periodic capture,
 * inference, scene comparison, and announcement decisions.
 */
export class AwarenessController {
  private status: AwarenessStatus = "INACTIVE";
  private isProcessing = false;
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private config: AwarenessConfig;

  private trackedObjects: TrackedSceneObject[] = [];
  private latestDetections: Detection[] = [];
  private lastAnnouncement: string | null = null;
  private lastAnnouncementTime = 0;

  private captureFrame: () => Promise<Frame | null>;
  private detectObjects: (
    uri: string,
    width?: number,
    height?: number
  ) => Promise<Detection[]>;
  private speakText: (message: string, options?: TtsOptions) => Promise<void>;
  private stopSpeechFn: () => Promise<void>;
  private isSpeakingFn: () => Promise<boolean>;

  private statusListeners = new Set<StatusChangeListener>();
  private cycleListeners = new Set<CycleCompleteListener>();
  private errorListeners = new Set<ErrorListener>();

  constructor(
    deps: AwarenessControllerDependencies,
    customConfig?: Partial<AwarenessConfig>
  ) {
    this.captureFrame = deps.captureFrame;
    this.detectObjects = deps.detectObjects ?? getDefaultDetectObjects();
    this.speakText = deps.speakText ?? getDefaultSpeak();
    this.stopSpeechFn = deps.stopSpeechFn ?? getDefaultStopSpeech();
    this.isSpeakingFn = deps.isSpeakingFn ?? getDefaultIsSpeaking();
    this.config = { ...DEFAULT_AWARENESS_CONFIG, ...customConfig };
  }

  // --- Public Lifecycle Controls ---

  /**
   * Starts automatic awareness monitoring.
   */
  public async start(): Promise<void> {
    if (this.status === "ACTIVE") return;

    console.log("[AwarenessController] Starting awareness mode...");
    this.status = "ACTIVE";
    this.trackedObjects = [];
    this.latestDetections = [];
    this.notifyStatusChange();

    if (this.config.speakStatusTransitions) {
      try {
        await this.speakText("Awareness mode started.");
      } catch (err) {
        this.emitError("TTS", "Failed to vocalize start announcement", err);
      }
    }

    // Schedule initial cycle with a short delay to let start announcement begin
    this.scheduleNextCycle(800);
  }

  /**
   * Pauses automatic awareness monitoring while maintaining tracked state.
   */
  public async pause(): Promise<void> {
    if (this.status !== "ACTIVE") return;

    console.log("[AwarenessController] Pausing awareness mode...");
    this.status = "PAUSED";
    this.clearTimer();
    this.notifyStatusChange();

    if (this.config.speakStatusTransitions) {
      try {
        await this.speakText("Awareness paused.");
      } catch (err) {
        this.emitError("TTS", "Failed to vocalize pause announcement", err);
      }
    }
  }

  /**
   * Resumes automatic awareness monitoring from paused state.
   */
  public async resume(): Promise<void> {
    if (this.status !== "PAUSED") return;

    console.log("[AwarenessController] Resuming awareness mode...");
    this.status = "ACTIVE";
    this.notifyStatusChange();

    if (this.config.speakStatusTransitions) {
      try {
        await this.speakText("Awareness resumed.");
      } catch (err) {
        this.emitError("TTS", "Failed to vocalize resume announcement", err);
      }
    }

    this.scheduleNextCycle(600);
  }

  /**
   * Stops automatic awareness monitoring and resets all tracking state.
   */
  public async stop(): Promise<void> {
    if (this.status === "INACTIVE") return;

    console.log("[AwarenessController] Stopping awareness mode...");
    this.status = "INACTIVE";
    this.clearTimer();
    this.trackedObjects = [];
    this.latestDetections = [];
    this.notifyStatusChange();

    try {
      await this.stopSpeechFn();
    } catch (err) {
      this.emitError("TTS", "Error stopping active speech", err);
    }

    if (this.config.speakStatusTransitions) {
      try {
        await this.speakText("Awareness mode stopped.");
      } catch (err) {
        this.emitError("TTS", "Failed to vocalize stop announcement", err);
      }
    }
  }

  /**
   * Updates the capture interval in milliseconds.
   */
  public setCaptureInterval(intervalMs: number): void {
    const safeInterval = Math.max(500, intervalMs);
    this.config.captureIntervalMs = safeInterval;
    console.log(`[AwarenessController] Interval updated to ${safeInterval} ms`);
  }

  /**
   * Updates awareness configuration settings.
   */
  public updateConfig(newConfig: Partial<AwarenessConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Returns the current awareness status.
   */
  public getStatus(): AwarenessStatus {
    return this.status;
  }

  /**
   * Returns whether a capture or inference cycle is actively running.
   */
  public getIsProcessing(): boolean {
    return this.isProcessing;
  }

  /**
   * Returns the latest list of tracked scene objects.
   */
  public getTrackedObjects(): TrackedSceneObject[] {
    return [...this.trackedObjects];
  }

  /**
   * Returns the latest raw detections.
   */
  public getLatestDetections(): Detection[] {
    return [...this.latestDetections];
  }

  /**
   * Returns the last spoken announcement text.
   */
  public getLastAnnouncement(): string | null {
    return this.lastAnnouncement;
  }

  /**
   * Returns the current configuration.
   */
  public getConfig(): AwarenessConfig {
    return { ...this.config };
  }

  /**
   * Completely tears down the controller, cleaning up timers and listeners.
   */
  public destroy(): void {
    console.log("[AwarenessController] Destroying controller...");
    this.status = "INACTIVE";
    this.clearTimer();
    this.statusListeners.clear();
    this.cycleListeners.clear();
    this.errorListeners.clear();
  }

  // --- Subscriptions ---

  public onStatusChange(listener: StatusChangeListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  public onCycleComplete(listener: CycleCompleteListener): () => void {
    this.cycleListeners.add(listener);
    return () => this.cycleListeners.delete(listener);
  }

  public onError(listener: ErrorListener): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  // --- Internal Cycle Execution ---

  /**
   * Executes a single awareness cycle: capture -> detect -> compare -> decide -> announce.
   */
  private async executeCycle(): Promise<void> {
    // Prevent overlapping inference or execution if paused/stopped
    if (this.status !== "ACTIVE" || this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    const cycleStartTime = Date.now();

    try {
      // 1. Capture image from camera
      let frame: Frame | null = null;
      try {
        frame = await this.captureFrame();
      } catch (captureErr) {
        this.emitError("CAPTURE", "Camera frame capture failed", captureErr);
      }

      if (!frame || !frame.uri) {
        // Camera may not be mounted or ready yet; gracefully schedule next cycle
        return;
      }

      // If status changed while capturing, abort
      if (this.status !== "ACTIVE") return;

      // 2. Run YOLO26n object detection
      let detections: Detection[] = [];
      try {
        detections = await this.detectObjects(
          frame.uri,
          frame.width,
          frame.height
        );
        this.latestDetections = detections;
      } catch (detectErr) {
        this.emitError(
          "DETECTION",
          "Object detection inference failed",
          detectErr
        );
        return;
      }

      // If status changed while detecting, abort
      if (this.status !== "ACTIVE") return;

      // 3. Compare scene with previously tracked objects
      const comparison = compareScenes(
        detections,
        frame.width,
        this.trackedObjects,
        this.config,
        Date.now()
      );
      this.trackedObjects = comparison.allTrackedObjects;

      // 4. Decide whether an announcement should be spoken
      let isSpeakingNow = false;
      try {
        isSpeakingNow = await this.isSpeakingFn();
      } catch {
        isSpeakingNow = false;
      }

      const decision: AnnouncementDecision = decideAnnouncement(
        comparison,
        this.config,
        this.lastAnnouncementTime,
        Date.now(),
        isSpeakingNow
      );

      // 5. Vocalize announcement if decided
      if (decision.shouldSpeak && decision.spokenText) {
        this.lastAnnouncement = decision.spokenText;
        this.lastAnnouncementTime = Date.now();

        try {
          await this.speakText(decision.spokenText);
        } catch (ttsErr) {
          this.emitError("TTS", "Failed to vocalize scene announcement", ttsErr);
        }
      }

      // Emit cycle completion summary to subscribers
      const cycleResult: AwarenessCycleResult = {
        timestamp: cycleStartTime,
        status: this.status,
        detections,
        trackedObjects: this.trackedObjects,
        comparison,
        decision,
        durationMs: Date.now() - cycleStartTime,
      };

      for (const listener of this.cycleListeners) {
        try {
          listener(cycleResult);
        } catch (listenerErr) {
          console.error(
            "[AwarenessController] Listener exception:",
            listenerErr
          );
        }
      }
    } catch (err) {
      console.error("[AwarenessController] Uncaught cycle exception:", err);
    } finally {
      this.isProcessing = false;

      // Schedule next cycle if still active
      if (this.status === "ACTIVE") {
        this.scheduleNextCycle();
      }
    }
  }

  private scheduleNextCycle(delayMs?: number): void {
    this.clearTimer();
    if (this.status !== "ACTIVE") return;

    const delay = delayMs ?? this.config.captureIntervalMs;
    this.timerId = setTimeout(() => {
      this.executeCycle();
    }, delay);
  }

  private clearTimer(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  private notifyStatusChange(): void {
    for (const listener of this.statusListeners) {
      try {
        listener(this.status);
      } catch (err) {
        console.error(
          "[AwarenessController] Status listener exception:",
          err
        );
      }
    }
  }

  private emitError(
    stage: AwarenessError["stage"],
    message: string,
    error?: unknown
  ): void {
    console.warn(`[AwarenessController] [${stage}] ${message}:`, error);
    const errObj: AwarenessError = { stage, message, error };
    for (const listener of this.errorListeners) {
      try {
        listener(errObj);
      } catch {
        // Ignore subscriber errors
      }
    }
  }
}
