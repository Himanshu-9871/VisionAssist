import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import type { AwarenessStatus } from "../../awareness";

interface AwarenessStatusBadgeProps {
  status: AwarenessStatus;
  isProcessing: boolean;
  isOnnxVerified: boolean;
  onToggleOnnx: () => void;
}

/**
 * Top bar badge displaying real-time awareness state and ONNX diagnostics toggle.
 */
export const AwarenessStatusBadge: React.FC<AwarenessStatusBadgeProps> = ({
  status,
  isProcessing,
  isOnnxVerified,
  onToggleOnnx,
}) => {
  return (
    <View style={styles.topBar}>
      <View
        accessibilityRole="text"
        accessibilityLabel={`Awareness status: ${status}`}
      >
        {status === "ACTIVE" && (
          <View style={styles.awarenessActiveBadge}>
            <View style={styles.pulseDot} />
            <Text style={styles.awarenessActiveText}>AWARENESS ACTIVE</Text>
            {isProcessing && (
              <ActivityIndicator
                size="small"
                color="#6ee7b7"
                style={styles.spinner}
              />
            )}
          </View>
        )}
        {status === "PAUSED" && (
          <View style={styles.awarenessPausedBadge}>
            <Text style={styles.awarenessPausedText}>AWARENESS PAUSED</Text>
          </View>
        )}
        {status === "INACTIVE" && (
          <View style={styles.awarenessIdleBadge}>
            <Text style={styles.awarenessIdleText}>AWARENESS IDLE</Text>
          </View>
        )}
      </View>

      <TouchableOpacity
        style={styles.onnxCompactButton}
        onPress={onToggleOnnx}
        accessibilityRole="button"
        accessibilityLabel="Toggle ONNX diagnostics"
      >
        <Text style={styles.onnxCompactButtonText}>
          {isOnnxVerified ? "ONNX OK" : "ONNX"}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  topBar: {
    position: "absolute",
    top: 48,
    left: 16,
    right: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    zIndex: 10,
  },
  awarenessActiveBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(6, 78, 59, 0.92)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#10b981",
  },
  awarenessPausedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(120, 53, 15, 0.92)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#f59e0b",
  },
  awarenessIdleBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(30, 41, 59, 0.88)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#475569",
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#34d399",
    marginRight: 6,
  },
  spinner: {
    marginLeft: 6,
  },
  awarenessActiveText: {
    color: "#6ee7b7",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  awarenessPausedText: {
    color: "#fde68a",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  awarenessIdleText: {
    color: "#94a3b8",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  onnxCompactButton: {
    backgroundColor: "#1e293b",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#3b82f6",
  },
  onnxCompactButtonText: {
    color: "#60a5fa",
    fontSize: 11,
    fontWeight: "700",
  },
});
