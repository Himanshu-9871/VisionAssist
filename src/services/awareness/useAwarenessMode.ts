import { useEffect, useRef, useState, useCallback } from "react";
import type { CameraPreviewHandle } from "../camera";
import type { Detection } from "../objectDetection";
import { AwarenessController } from "./awarenessController";
import { DEFAULT_AWARENESS_CONFIG } from "./config";
import type {
  AwarenessConfig,
  AwarenessError,
  AwarenessStatus,
  TrackedSceneObject,
} from "./types";

export interface UseAwarenessModeOptions {
  cameraRef: React.RefObject<CameraPreviewHandle | null>;
  config?: Partial<AwarenessConfig>;
}

export interface UseAwarenessModeReturn {
  status: AwarenessStatus;
  isProcessing: boolean;
  lastAnnouncement: string | null;
  latestDetections: Detection[];
  trackedObjects: TrackedSceneObject[];
  error: AwarenessError | null;
  captureIntervalMs: number;
  startAwareness: () => Promise<void>;
  pauseAwareness: () => Promise<void>;
  resumeAwareness: () => Promise<void>;
  stopAwareness: () => Promise<void>;
  setCaptureInterval: (intervalMs: number) => void;
}

/**
 * React hook integrating the Automatic Awareness Controller into components.
 * Manages lifecycle, reactive UI state, and ensures full cleanup on unmount.
 */
export function useAwarenessMode({
  cameraRef,
  config,
}: UseAwarenessModeOptions): UseAwarenessModeReturn {
  const [status, setStatus] = useState<AwarenessStatus>("INACTIVE");
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastAnnouncement, setLastAnnouncement] = useState<string | null>(null);
  const [latestDetections, setLatestDetections] = useState<Detection[]>([]);
  const [trackedObjects, setTrackedObjects] = useState<TrackedSceneObject[]>([]);
  const [error, setError] = useState<AwarenessError | null>(null);
  const [captureIntervalMs, setCaptureIntervalState] = useState(
    config?.captureIntervalMs ?? DEFAULT_AWARENESS_CONFIG.captureIntervalMs
  );

  const controllerRef = useRef<AwarenessController | null>(null);  //reference to controller instance
  const cameraRefHolder = useRef(cameraRef);
  cameraRefHolder.current = cameraRef;

  const configRefHolder = useRef(config);
  configRefHolder.current = config;
  //This keeps the latest camera reference available to the controller.

  // Initialize controller once on mount
  useEffect(() => {
    const controller = new AwarenessController(
      {
        captureFrame: async () => {
          const currentRef = cameraRefHolder.current;
          if (!currentRef?.current) {
            return null;
          }
          if (
            typeof currentRef.current.isReady === "function" &&
            !currentRef.current.isReady()
          ) {
            return null;
          }
          return currentRef.current.capture();
        },
      },
      configRefHolder.current
    );

    controllerRef.current = controller;

    // Subscribe to status changes
    const unsubStatus = controller.onStatusChange((newStatus) => {
      setStatus(newStatus);
      if (newStatus === "INACTIVE") {
        setTrackedObjects([]);
        setLatestDetections([]);
      }
    });

    // Subscribe to cycle completion
    const unsubCycle = controller.onCycleComplete((cycleResult) => {
      setLatestDetections(cycleResult.detections);
      setTrackedObjects(cycleResult.trackedObjects);
      setIsProcessing(false);
      if (cycleResult.decision.spokenText) {
        setLastAnnouncement(cycleResult.decision.spokenText);
      }
    });

    // Subscribe to errors
    const unsubError = controller.onError((err) => {
      setError(err);
      setIsProcessing(false);
    });

    // Cleanup on unmount
    return () => {
      unsubStatus();
      unsubCycle();
      unsubError();
      controller.destroy();
      controllerRef.current = null;
    };
  }, []);

  const startAwareness = useCallback(async () => {
    setError(null);
    if (controllerRef.current) {
      await controllerRef.current.start();
    }
  }, []);

  const pauseAwareness = useCallback(async () => {
    if (controllerRef.current) {
      await controllerRef.current.pause();
    }
  }, []);

  const resumeAwareness = useCallback(async () => {
    setError(null);
    if (controllerRef.current) {
      await controllerRef.current.resume();
    }
  }, []);

  const stopAwareness = useCallback(async () => {
    if (controllerRef.current) {
      await controllerRef.current.stop();
    }
  }, []);

  const setCaptureInterval = useCallback((intervalMs: number) => {
    if (controllerRef.current) {
      controllerRef.current.setCaptureInterval(intervalMs);
      setCaptureIntervalState(intervalMs);
    }
  }, []);

  return {
    status,
    isProcessing,
    lastAnnouncement,
    latestDetections,
    trackedObjects,
    error,
    captureIntervalMs,
    startAwareness,
    pauseAwareness,
    resumeAwareness,
    stopAwareness,
    setCaptureInterval,
  };
}
