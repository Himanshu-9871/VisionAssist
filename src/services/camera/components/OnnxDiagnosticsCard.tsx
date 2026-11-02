import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import type { OnnxVerificationResult } from "../../onnx";

interface OnnxDiagnosticsCardProps {
  visible: boolean;
  result: OnnxVerificationResult | null;
  isLoading: boolean;
  onRunTest: () => void;
}

/**
 * Diagnostics HUD presenting ONNX Runtime initialization, model status, and inference latency.
 */
export const OnnxDiagnosticsCard: React.FC<OnnxDiagnosticsCardProps> = ({
  visible,
  result,
  isLoading,
  onRunTest,
}) => {
  if (!visible) return null;

  return (
    <View style={styles.onnxCard}>
      <View style={styles.onnxHeader}>
        <Text style={styles.onnxTitle}>ONNX Runtime Status</Text>
        <TouchableOpacity
          style={styles.onnxButton}
          onPress={onRunTest}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.onnxButtonText}>Run Test</Text>
          )}
        </TouchableOpacity>
      </View>

      {result && (
        <View style={styles.onnxDetails}>
          <View
            style={[
              styles.badge,
              result.success ? styles.badgeSuccess : styles.badgeError,
            ]}
          >
            <Text style={styles.badgeText}>
              {result.success ? "VERIFIED (OK)" : "FAILED"}
            </Text>
          </View>

          {result.success ? (
            <>
              <Text style={styles.onnxText}>
                Model:{" "}
                <Text style={styles.boldText}>mul_1.onnx (Y = X * W)</Text>
              </Text>
              <Text style={styles.onnxText}>
                Latency:{" "}
                <Text style={styles.boldText}>{result.latencyMs} ms</Text>
              </Text>
              <Text style={styles.onnxSubtext}>
                In: [{result.input.join(", ")}]
              </Text>
              <Text style={styles.onnxSubtext}>
                Out: [{result.output.join(", ")}]
              </Text>
            </>
          ) : (
            <Text style={styles.errorText}>
              Error: {result.error ?? "Unknown error"}
            </Text>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
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
    zIndex: 15,
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
});
