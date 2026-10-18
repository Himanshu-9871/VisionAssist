import { CameraView, useCameraPermissions } from "expo-camera";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Button,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { captureFrame } from "./cameraService";
import { verifyOnnxRuntime, OnnxVerificationResult } from "../onnx";
import type { Frame } from "../../shared/types/Frame";

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
    },
    ref
  ) => {
    const [permission, requestPermission] = useCameraPermissions();
    const [cameraReady, setCameraReady] = useState(false);
    const [onnxResult, setOnnxResult] =
      useState<OnnxVerificationResult | null>(null);
    const [onnxLoading, setOnnxLoading] = useState(false);

    const cameraRef = useRef<CameraView>(null);

    useImperativeHandle(ref, () => ({
      capture: async () => {
        if (!cameraRef.current) {
          throw new Error("Camera is not mounted.");
        }
        return captureFrame(cameraRef.current);
      },
      isReady: () => cameraReady,
    }));

    const runTest = async () => {
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
    };

    useEffect(() => {
      // Run an initial ONNX verification test on mount
      runTest();
    }, []);

    if (!permission) {
      return (
        <View style={styles.container}>
          <Text style={styles.permissionText}>
            Checking camera permission...
          </Text>
        </View>
      );
    }

    if (!permission.granted) {
      return (
        <View style={styles.container}>
          <Text style={styles.permissionText}>
            Camera permission is required.
          </Text>
          <Button title="Allow Camera" onPress={requestPermission} />
        </View>
      );
    }

    const handleDetectObjects = async () => {
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

    return (
      <View style={styles.container}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing="back"
          onCameraReady={() => setCameraReady(true)}
        />

        {/* ONNX Diagnostic HUD */}
        <View style={styles.onnxCard}>
          <View style={styles.onnxHeader}>
            <Text style={styles.onnxTitle}>ONNX Runtime Status</Text>
            <TouchableOpacity
              style={styles.onnxButton}
              onPress={runTest}
              disabled={onnxLoading}
            >
              {onnxLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.onnxButtonText}>Run Test</Text>
              )}
            </TouchableOpacity>
          </View>

          {onnxResult && (
            <View style={styles.onnxDetails}>
              <View
                style={[
                  styles.badge,
                  onnxResult.success ? styles.badgeSuccess : styles.badgeError,
                ]}
              >
                <Text style={styles.badgeText}>
                  {onnxResult.success ? "VERIFIED (OK)" : "FAILED"}
                </Text>
              </View>

              {onnxResult.success ? (
                <>
                  <Text style={styles.onnxText}>
                    Model:{" "}
                    <Text style={styles.boldText}>mul_1.onnx (Y = X * W)</Text>
                  </Text>
                  <Text style={styles.onnxText}>
                    Latency:{" "}
                    <Text style={styles.boldText}>
                      {onnxResult.latencyMs} ms
                    </Text>
                  </Text>
                  <Text style={styles.onnxSubtext}>
                    In: [{onnxResult.input.join(", ")}]
                  </Text>
                  <Text style={styles.onnxSubtext}>
                    Out: [{onnxResult.output.join(", ")}]
                  </Text>
                </>
              ) : (
                <Text style={styles.errorText}>
                  Error: {onnxResult.error ?? "Unknown error"}
                </Text>
              )}
            </View>
          )}
        </View>

        {/* Spoken Object Description Overlay Card */}
        {(descriptionText || statusText || isDetecting) && (
          <View
            style={styles.descriptionCard}
            accessibilityRole="text"
            accessibilityLiveRegion="polite"
          >
            <View style={styles.descriptionHeader}>
              <Text style={styles.descriptionLabel}>
                {isDetecting ? "Processing..." : "Spatial Description"}
              </Text>
              <View style={styles.actionRow}>
                {isSpeaking && onStopSpeech && (
                  <TouchableOpacity
                    style={styles.stopSpeechButton}
                    onPress={onStopSpeech}
                    accessibilityRole="button"
                    accessibilityLabel="Stop speech"
                  >
                    <Text style={styles.stopSpeechText}>Stop Voice</Text>
                  </TouchableOpacity>
                )}
                {!isSpeaking && !isDetecting && descriptionText && onReplaySpeech && (
                  <TouchableOpacity
                    style={styles.replayButton}
                    onPress={onReplaySpeech}
                    accessibilityRole="button"
                    accessibilityLabel="Replay description"
                  >
                    <Text style={styles.replayText}>Replay</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {isDetecting ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color="#60a5fa" />
                <Text style={styles.statusText}>
                  {statusText ?? "Detecting & analyzing surroundings..."}
                </Text>
              </View>
            ) : (
              <Text style={styles.descriptionText}>
                {descriptionText}
              </Text>
            )}
          </View>
        )}

        {/* Primary Action Button */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[
              styles.detectButton,
              (!cameraReady || isDetecting) && styles.buttonDisabled,
            ]}
            onPress={handleDetectObjects}
            disabled={!cameraReady || isDetecting}
            accessibilityRole="button"
            accessibilityLabel={buttonTitle}
            accessibilityHint="Captures a photo, detects objects, and speaks their spatial location"
          >
            {isDetecting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.detectButtonText}>{buttonTitle}</Text>
            )}
          </TouchableOpacity>
        </View>
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

  onnxCard: {
    position: "absolute",
    top: 50,
    left: 16,
    right: 16,
    backgroundColor: "rgba(18, 24, 38, 0.88)",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
  },

  onnxHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  onnxTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },

  onnxButton: {
    backgroundColor: "#2563eb",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    minWidth: 75,
    alignItems: "center",
  },

  onnxButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },

  onnxDetails: {
    marginTop: 10,
    gap: 3,
  },

  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginBottom: 4,
  },

  badgeSuccess: {
    backgroundColor: "#16a34a",
  },

  badgeError: {
    backgroundColor: "#dc2626",
  },

  badgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "bold",
  },

  onnxText: {
    color: "#e2e8f0",
    fontSize: 13,
  },

  boldText: {
    fontWeight: "bold",
    color: "#fff",
  },

  onnxSubtext: {
    color: "#94a3b8",
    fontSize: 11,
    fontFamily: "monospace",
  },

  errorText: {
    color: "#f87171",
    fontSize: 12,
  },

  descriptionCard: {
    position: "absolute",
    bottom: 118,
    left: 16,
    right: 16,
    backgroundColor: "rgba(15, 23, 42, 0.94)",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1.5,
    borderColor: "rgba(96, 165, 250, 0.4)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 6,
  },

  descriptionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },

  descriptionLabel: {
    color: "#93c5fd",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },

  actionRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },

  stopSpeechButton: {
    backgroundColor: "#dc2626",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },

  stopSpeechText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },

  replayButton: {
    backgroundColor: "#334155",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },

  replayText: {
    color: "#cbd5e1",
    fontSize: 11,
    fontWeight: "600",
  },

  descriptionText: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 22,
  },

  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  statusText: {
    color: "#94a3b8",
    fontSize: 14,
    fontStyle: "italic",
  },

  buttonContainer: {
    position: "absolute",
    bottom: 56,
    left: 20,
    right: 20,
  },

  detectButton: {
    backgroundColor: "#2563eb",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },

  buttonDisabled: {
    backgroundColor: "#475569",
    opacity: 0.65,
  },

  detectButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    letterSpacing: 0.5,
  },

  permissionText: {
    color: "#fff",
    fontSize: 16,
    marginBottom: 16,
    textAlign: "center",
  },
});
