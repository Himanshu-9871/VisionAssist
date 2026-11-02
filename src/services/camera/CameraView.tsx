import { CameraView as ExpoCameraView, useCameraPermissions } from "expo-camera";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { StyleSheet, View } from "react-native";
import { captureFrame } from "./cameraService";
import { verifyOnnxRuntime, type OnnxVerificationResult } from "../onnx";
import type { Frame } from "../../shared/types";
import type { Detection } from "../objectDetection";
import type { AwarenessStatus } from "../awareness";
import {
  CameraPermissionView,
  AwarenessStatusBadge,
  OnnxDiagnosticsCard,
  AwarenessSummaryCard,
  SpeechControlCard,
  AwarenessActionControls,
} from "./components";

export interface CameraPreviewHandle {
  capture: () => Promise<Frame>;
  isReady: () => boolean;
}

export interface CameraPreviewProps {
  onDetect?: (
    imageUri: string,
    width?: number,
    height?: number
  ) => Promise<void> | void;
  isDetecting?: boolean;
  buttonTitle?: string;
  descriptionText?: string | null;
  statusText?: string | null;
  onStopSpeech?: () => void;
  onReplaySpeech?: () => void;
  isSpeaking?: boolean;

  // Automatic Awareness Mode Integration
  awarenessStatus?: AwarenessStatus;
  onStartAwareness?: () => void;
  onPauseAwareness?: () => void;
  onResumeAwareness?: () => void;
  onStopAwareness?: () => void;
  isAwarenessProcessing?: boolean;
  lastAnnouncementText?: string | null;
  latestDetections?: Detection[];
  trackedObjectsCount?: number;
  awarenessError?: string | null;
  captureIntervalMs?: number;
}

const CameraPreview = forwardRef<CameraPreviewHandle, CameraPreviewProps>(
  (
    {
      onDetect,
      isDetecting = false,
      buttonTitle = "Detect & Describe",
      descriptionText = null,
      statusText = null,
      onStopSpeech,
      onReplaySpeech,
      isSpeaking = false,
      awarenessStatus = "INACTIVE",
      onStartAwareness,
      onPauseAwareness,
      onResumeAwareness,
      onStopAwareness,
      isAwarenessProcessing = false,
      lastAnnouncementText = null,
      latestDetections = [],
      awarenessError = null,
      captureIntervalMs = 1500,
    },
    ref
  ) => {
    const [permission, requestPermission] = useCameraPermissions();
    const [cameraReady, setCameraReady] = useState(false);
    const [onnxResult, setOnnxResult] =
      useState<OnnxVerificationResult | null>(null);
    const [onnxLoading, setOnnxLoading] = useState(false);
    const [showOnnxDetails, setShowOnnxDetails] = useState(false);

    const cameraRef = useRef<ExpoCameraView>(null);

    useImperativeHandle(ref, () => ({
      capture: async () => {
        if (!cameraRef.current) {
          throw new Error("Camera is not mounted.");
        }
        return captureFrame(cameraRef.current);
      },
      isReady: () => cameraReady,
    }));

    const runOnnxVerification = useCallback(async () => {
      setOnnxLoading(true);
      try {
        const result = await verifyOnnxRuntime();
        setOnnxResult(result);
        console.log("[ONNX Verification]", result);
      } catch (err) {
        console.error("[ONNX Verification Exception]", err);
      } finally {
        setOnnxLoading(false);
      }
    }, []);

    useEffect(() => {
      // Run initial ONNX verification on mount
      runOnnxVerification();
    }, [runOnnxVerification]);

    const handleSingleShotDetect = async () => {
      if (!cameraRef.current || !cameraReady || isDetecting) {
        if (!cameraReady) {
          console.warn("[Camera] Camera is not ready yet.");
        }
        return;
      }

      try {
        const frame = await captureFrame(cameraRef.current);
        console.log(
          `[Camera] Photo captured: ${frame.uri} (${frame.width}x${frame.height})`
        );

        if (onDetect) {
          await onDetect(frame.uri, frame.width, frame.height);
        }
      } catch (error) {
        console.error("[Camera] Capture failed:", error);
      }
    };

    if (!permission || !permission.granted) {
      return (
        <CameraPermissionView
          permission={permission}
          onRequestPermission={requestPermission}
        />
      );
    }

    return (
      <View style={styles.container}>
        <ExpoCameraView
          ref={cameraRef}
          style={styles.camera}
          facing="back"
          onCameraReady={() => setCameraReady(true)}
        />

        <AwarenessStatusBadge
          status={awarenessStatus}
          isProcessing={isAwarenessProcessing}
          isOnnxVerified={Boolean(onnxResult?.success)}
          onToggleOnnx={() => setShowOnnxDetails((prev) => !prev)}
        />

        <OnnxDiagnosticsCard
          visible={showOnnxDetails}
          result={onnxResult}
          isLoading={onnxLoading}
          onRunTest={runOnnxVerification}
        />

        <AwarenessSummaryCard
          status={awarenessStatus}
          error={awarenessError}
          lastAnnouncementText={lastAnnouncementText}
          latestDetections={latestDetections}
          isProcessing={isAwarenessProcessing}
          captureIntervalMs={captureIntervalMs}
        />

        <SpeechControlCard
          descriptionText={descriptionText}
          statusText={statusText}
          isDetecting={isDetecting}
          isSpeaking={isSpeaking}
          onStopSpeech={onStopSpeech}
          onReplaySpeech={onReplaySpeech}
        />

        <AwarenessActionControls
          awarenessStatus={awarenessStatus}
          isDetecting={isDetecting}
          cameraReady={cameraReady}
          buttonTitle={buttonTitle}
          onStartAwareness={onStartAwareness}
          onPauseAwareness={onPauseAwareness}
          onResumeAwareness={onResumeAwareness}
          onStopAwareness={onStopAwareness}
          onDetect={handleSingleShotDetect}
        />
      </View>
    );
  }
);

CameraPreview.displayName = "CameraPreview";

export default CameraPreview;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  camera: {
    flex: 1,
  },
});
