import type { Frame } from "../../shared/types/Frame";
import type { TtsOptions } from "../../shared/types/TtsOptions";
import type { Detection } from "../objectDetection";
import { decideAnnouncement } from "./announcementEngine";
import {
  DEFAULT_AWARENESS_CONFIG,
  MIN_CAPTURE_INTERVAL_MS,
  RESUME_CYCLE_DELAY_MS,
  STARTUP_CYCLE_DELAY_MS,
} from "./config";
import { compareScenes } from "./sceneComparison";
import type {
  AnnouncementDecision,
  AwarenessConfig,
  AwarenessCycleResult,
  AwarenessError,
  AwarenessStatus,
  TrackedSceneObject,
} from "./types";

export interface AwarenessControllerDependencies {
  captureFrame: () => Promise<Frame | null>;
  detectObjects?: (uri: string, width?: number, height?: number) => Promise<Detection[]>;
  speakText?: (message: string, options?: TtsOptions) => Promise<void>;
  stopSpeech?: () => Promise<void>;
  stopSpeechFn?: () => Promise<void>;   // backward-compatible alias
  isSpeaking?: () => Promise<boolean>;
  isSpeakingFn?: () => Promise<boolean>; // backward-compatible alias
}

export type StatusChangeListener = (status: AwarenessStatus) => void;
export type CycleCompleteListener = (result: AwarenessCycleResult) => void;
export type ErrorListener = (error: AwarenessError) => void;

// Lazy default service implementations — only loaded when not injected
const defaultDetectObjects = (uri: string, w?: number, h?: number) =>
  import("../objectDetection").then((m) => m.detectObjectsFromImage(uri, w, h));
const defaultSpeak = (msg: string, opt?: TtsOptions) =>
  import("../tts").then((m) => m.speak(msg, opt));
const defaultStopSpeech = () => import("../tts").then((m) => m.stopSpeech());
const defaultIsSpeaking = () => import("../tts").then((m) => m.isSpeaking());

const LOG = "[AwarenessController]";

/**
 * Orchestrates periodic camera capture, object detection, scene comparison,
 * and spoken announcements for visually-impaired users.
 */
export class AwarenessController {
  private status: AwarenessStatus = "INACTIVE";
  private isProcessing = false;
  private sessionGeneration = 0;
  private cycleTimerId: ReturnType<typeof setTimeout> | null = null;
  private config: AwarenessConfig;

  private trackedObjects: TrackedSceneObject[] = [];
  private latestDetections: Detection[] = [];
  private lastAnnouncementText: string | null = null;
  private lastAnnouncementTime = 0;

  // Resolved dependencies (with fallbacks applied at construction time)
  private readonly captureFrame: () => Promise<Frame | null>;
  private readonly detectObjects: (uri: string, w?: number, h?: number) => Promise<Detection[]>;
  private readonly speakText: (msg: string, opt?: TtsOptions) => Promise<void>;
  private readonly stopSpeech: () => Promise<void>;
  private readonly isSpeaking: () => Promise<boolean>;

  // Event subscribers
  private readonly statusListeners = new Set<StatusChangeListener>();
  private readonly cycleListeners = new Set<CycleCompleteListener>();
  private readonly errorListeners = new Set<ErrorListener>();

  constructor(
    dependencies: AwarenessControllerDependencies,
    customConfig?: Partial<AwarenessConfig>
  ) {
    this.captureFrame = dependencies.captureFrame;
    this.detectObjects = dependencies.detectObjects ?? defaultDetectObjects;
    this.speakText = dependencies.speakText ?? defaultSpeak;
    this.stopSpeech = dependencies.stopSpeech ?? dependencies.stopSpeechFn ?? defaultStopSpeech;
    this.isSpeaking = dependencies.isSpeaking ?? dependencies.isSpeakingFn ?? defaultIsSpeaking;
    this.config = { ...DEFAULT_AWARENESS_CONFIG, ...customConfig };
  }

  // ==========================================================================
  // Public Lifecycle
  // ==========================================================================

  public async start(): Promise<void> {
    if (this.status === "ACTIVE") return;

    this.sessionGeneration++;
    const activeSession = this.sessionGeneration;

    this.status = "ACTIVE";
    this.resetTrackingState();
    this.notifyStatusChange();

    await this.speakTransition("Awareness mode started.");

    if (this.isSessionStillActive(activeSession)) {
      this.scheduleNextCycle(STARTUP_CYCLE_DELAY_MS);
    }
  }

  public async pause(): Promise<void> {
    if (this.status !== "ACTIVE") return;

    this.sessionGeneration++;
    this.status = "PAUSED";
    this.cancelScheduledCycle();
    this.notifyStatusChange();
    await this.speakTransition("Awareness paused.");
  }

  public async resume(): Promise<void> {
    if (this.status !== "PAUSED") return;

    this.sessionGeneration++;
    const activeSession = this.sessionGeneration;

    this.status = "ACTIVE";
    this.notifyStatusChange();

    await this.speakTransition("Awareness resumed.");

    if (this.isSessionStillActive(activeSession)) {
      this.scheduleNextCycle(RESUME_CYCLE_DELAY_MS);
    }
  }

  public async stop(): Promise<void> {
    if (this.status === "INACTIVE") return;

    this.sessionGeneration++;
    this.status = "INACTIVE";
    this.cancelScheduledCycle();
    this.resetTrackingState();
    this.notifyStatusChange();

    try {
      await this.stopSpeech();
    } catch (err) {
      this.emitError("TTS", "Error stopping active speech", err);
    }

    await this.speakTransition("Awareness mode stopped.");
  }

  public destroy(): void {
    this.sessionGeneration++;
    this.status = "INACTIVE";
    this.cancelScheduledCycle();
    this.resetTrackingState();
    this.statusListeners.clear();
    this.cycleListeners.clear();
    this.errorListeners.clear();
  }

  // ==========================================================================
  // Configuration & Accessors
  // ==========================================================================

  public setCaptureInterval(intervalMs: number): void {
    this.config.captureIntervalMs = Math.max(MIN_CAPTURE_INTERVAL_MS, intervalMs);
  }

  public updateConfig(patch: Partial<AwarenessConfig>): void {
    this.config = { ...this.config, ...patch };
    this.config.captureIntervalMs = Math.max(
      MIN_CAPTURE_INTERVAL_MS,
      this.config.captureIntervalMs
    );
  }

  public getStatus(): AwarenessStatus { return this.status; }
  public getIsProcessing(): boolean { return this.isProcessing; }
  public getLastAnnouncement(): string | null { return this.lastAnnouncementText; }
  public getConfig(): AwarenessConfig { return { ...this.config }; }

  public getTrackedObjects(): TrackedSceneObject[] {
    return this.trackedObjects.map((obj) => ({ ...obj, boundingBox: { ...obj.boundingBox } }));
  }

  public getLatestDetections(): Detection[] {
    return this.latestDetections.map((det) => ({ ...det, boundingBox: { ...det.boundingBox } }));
  }

  // ==========================================================================
  // Subscriptions
  // ==========================================================================

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

  // ==========================================================================
  // High-Level Cycle Workflow
  // ==========================================================================

  /**
   * One awareness cycle: Capture → Detect → Compare → Decide → Announce.
   * The session token ensures stale cycles from before a pause/stop are discarded.
   */
  private async executeCycle(): Promise<void> {
    if (this.status !== "ACTIVE" || this.isProcessing) return;

    this.isProcessing = true;
    const session = this.sessionGeneration;
    const cycleStartTime = Date.now();

    try {
      // 1. Capture a camera frame
      const frame = await this.captureCurrentFrame(session);
      if (!frame || !this.isSessionStillActive(session)) return;

      // 2. Run object detection on the frame
      const detections = await this.detectFrameObjects(frame, session);
      if (!detections || !this.isSessionStillActive(session)) return;
      this.latestDetections = detections;

      // 3. Compare current detections against tracked history
      const sceneComparison = compareScenes(
        detections, frame.width, this.trackedObjects, this.config, Date.now()
      );
      this.trackedObjects = sceneComparison.allTrackedObjects;

      // 4. Decide whether to announce anything, then speak it
      const announcementDecision = await this.evaluateAnnouncement(sceneComparison);
      if (!this.isSessionStillActive(session)) return;

      await this.handleAnnouncement(announcementDecision, session);

      // 5. Broadcast the completed cycle to subscribers
      if (this.isSessionStillActive(session)) {
        this.broadcastCycleResult(cycleStartTime, sceneComparison, announcementDecision);
      }
    } catch (err) {
      console.error(`${LOG} Unexpected cycle error:`, err);
    } finally {
      this.isProcessing = false;
      if (this.isSessionStillActive(session)) {
        this.scheduleNextCycle();
      }
    }
  }

  // ==========================================================================
  // Medium-Level Cycle Steps
  // ==========================================================================

  private async captureCurrentFrame(session: number): Promise<Frame | null> {
    try {
      const frame = await this.captureFrame();
      return frame?.uri ? frame : null;
    } catch (err) {
      if (this.isSessionStillActive(session)) {
        this.emitError("CAPTURE", "Camera frame capture failed", err);
      }
      return null;
    }
  }

  private async detectFrameObjects(frame: Frame, session: number): Promise<Detection[] | null> {
    try {
      return await this.detectObjects(frame.uri, frame.width, frame.height);
    } catch (err) {
      if (this.isSessionStillActive(session)) {
        this.emitError("DETECTION", "Object detection inference failed", err);
      }
      return null;
    }
  }

  private async evaluateAnnouncement(
    sceneComparison: ReturnType<typeof compareScenes>
  ): Promise<AnnouncementDecision> {
    let ttsIsCurrentlySpeaking = false;
    try {
      ttsIsCurrentlySpeaking = await this.isSpeaking();
    } catch (err) {
      this.emitError("TTS", "TTS status check failed — assuming silent", err);
    }

    return decideAnnouncement(
      sceneComparison,
      this.config,
      this.lastAnnouncementTime,
      Date.now(),
      ttsIsCurrentlySpeaking
    );
  }

  private async handleAnnouncement(decision: AnnouncementDecision, session: number): Promise<void> {
    if (!decision.shouldSpeak || !decision.spokenText) return;

    try {
      await this.speakText(decision.spokenText);

      // Commit the announcement timestamp only after speech succeeds and cycle is still live
      if (this.isSessionStillActive(session)) {
        this.lastAnnouncementText = decision.spokenText;
        this.lastAnnouncementTime = Date.now();
      }
    } catch (err) {
      this.emitError("TTS", "Failed to vocalize scene announcement", err);
    }
  }

  private broadcastCycleResult(
    cycleStartTime: number,
    sceneComparison: ReturnType<typeof compareScenes>,
    announcementDecision: AnnouncementDecision
  ): void {
    const cycleResult: AwarenessCycleResult = {
      timestamp: cycleStartTime,
      status: this.status,
      detections: this.getLatestDetections(),
      trackedObjects: this.getTrackedObjects(),
      comparison: sceneComparison,
      decision: announcementDecision,
      durationMs: Date.now() - cycleStartTime,
    };

    for (const listener of this.cycleListeners) {
      try {
        listener(cycleResult);
      } catch (err) {
        console.error(`${LOG} Cycle listener threw:`, err);
      }
    }
  }

  // ==========================================================================
  // Low-Level Helpers
  // ==========================================================================

  /** Returns true when the current session matches and the controller is still ACTIVE. */
  private isSessionStillActive(session: number): boolean {
    return this.status === "ACTIVE" && session === this.sessionGeneration;
  }

  /** Speaks a lifecycle status message if the feature is enabled in config. */
  private async speakTransition(message: string): Promise<void> {
    if (!this.config.speakStatusTransitions) return;
    try {
      await this.speakText(message);
    } catch (err) {
      this.emitError("TTS", `Failed to speak status transition: '${message}'`, err);
    }
  }

  private scheduleNextCycle(delayMs = this.config.captureIntervalMs): void {
    this.cancelScheduledCycle();
    if (this.status !== "ACTIVE") return;
    this.cycleTimerId = setTimeout(() => this.executeCycle(), delayMs);
  }

  private cancelScheduledCycle(): void {
    if (this.cycleTimerId !== null) {
      clearTimeout(this.cycleTimerId);
      this.cycleTimerId = null;
    }
  }

  /** Clears per-session scene tracking data (called on start/stop/destroy). */
  private resetTrackingState(): void {
    this.trackedObjects = [];
    this.latestDetections = [];
    this.lastAnnouncementText = null;
    this.lastAnnouncementTime = 0;
  }

  private notifyStatusChange(): void {
    for (const listener of this.statusListeners) {
      try {
        listener(this.status);
      } catch (err) {
        console.error(`${LOG} Status listener threw:`, err);
      }
    }
  }

  private emitError(stage: AwarenessError["stage"], message: string, error?: unknown): void {
    console.warn(`${LOG} [${stage}] ${message}:`, error);
    const awarenessError: AwarenessError = { stage, message, error };
    for (const listener of this.errorListeners) {
      try {
        listener(awarenessError);
      } catch (listenerErr) {
        console.error(`${LOG} Error listener threw:`, listenerErr);
      }
    }
  }
}
