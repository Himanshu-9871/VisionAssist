// 1 st
// building the camera UI

import { CameraView, useCameraPermissions } from "expo-camera";
import { useEffect, useRef, useState } from "react";
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

export interface CameraPreviewProps {
  onDetect?: (imageUri: string) => Promise<void> | void;
  isDetecting?: boolean;
}

export default function CameraPreview({
  onDetect,
  isDetecting = false,
}: CameraPreviewProps = {}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [onnxResult, setOnnxResult] = useState<OnnxVerificationResult | null>(null);
  const [onnxLoading, setOnnxLoading] = useState(false);

  const cameraRef = useRef<CameraView>(null);

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
        <Text style={styles.permissionText}>Checking camera permission...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.permissionText}>Camera permission is required.</Text>

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
      console.log(`[Camera] Photo captured: ${frame.uri}`);

      if (onDetect) {
        await onDetect(frame.uri);
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
                  Model: <Text style={styles.boldText}>mul_1.onnx (Y = X * W)</Text>
                </Text>
                <Text style={styles.onnxText}>
                  Latency: <Text style={styles.boldText}>{onnxResult.latencyMs} ms</Text>
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

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[
            styles.detectButton,
            (!cameraReady || isDetecting) && styles.buttonDisabled,
          ]}
          onPress={handleDetectObjects}
          disabled={!cameraReady || isDetecting}
        >
          {isDetecting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.detectButtonText}>Detect Objects</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

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

  buttonContainer: {
    position: "absolute",
    bottom: 55,
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
