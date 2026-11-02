import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import type { AwarenessStatus } from "../../awareness";

interface AwarenessActionControlsProps {
  awarenessStatus: AwarenessStatus;
  isDetecting: boolean;
  cameraReady: boolean;
  buttonTitle: string;
  onStartAwareness?: () => void;
  onPauseAwareness?: () => void;
  onResumeAwareness?: () => void;
  onStopAwareness?: () => void;
  onDetect: () => void;
}

/**
 * Bottom action controls container coordinating Automatic Awareness Mode and single-shot scan.
 */
export const AwarenessActionControls: React.FC<AwarenessActionControlsProps> = ({
  awarenessStatus,
  isDetecting,
  cameraReady,
  buttonTitle,
  onStartAwareness,
  onPauseAwareness,
  onResumeAwareness,
  onStopAwareness,
  onDetect,
}) => {
  const isStartDisabled = !cameraReady || isDetecting;
  const isSingleShotDisabled =
    !cameraReady || isDetecting || awarenessStatus === "ACTIVE";

  return (
    <View style={styles.buttonContainer}>
      {/* Awareness Mode Controls */}
      {awarenessStatus === "INACTIVE" && onStartAwareness && (
        <TouchableOpacity
          style={[
            styles.startAwarenessButton,
            isStartDisabled && styles.buttonDisabled,
          ]}
          onPress={onStartAwareness}
          disabled={isStartDisabled}
          accessibilityRole="button"
          accessibilityLabel="Start Automatic Awareness Mode"
          accessibilityHint="Continuously captures images and announces new or moved objects"
        >
          <Text style={styles.startAwarenessText}>Start Awareness</Text>
        </TouchableOpacity>
      )}

      {awarenessStatus === "ACTIVE" && (
        <View style={styles.awarenessControlsRow}>
          {onPauseAwareness && (
            <TouchableOpacity
              style={styles.pauseButton}
              onPress={onPauseAwareness}
              accessibilityRole="button"
              accessibilityLabel="Pause Awareness"
            >
              <Text style={styles.pauseButtonText}>Pause</Text>
            </TouchableOpacity>
          )}
          {onStopAwareness && (
            <TouchableOpacity
              style={styles.stopButton}
              onPress={onStopAwareness}
              accessibilityRole="button"
              accessibilityLabel="Stop Awareness"
            >
              <Text style={styles.stopButtonText}>Stop Awareness</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {awarenessStatus === "PAUSED" && (
        <View style={styles.awarenessControlsRow}>
          {onResumeAwareness && (
            <TouchableOpacity
              style={styles.resumeButton}
              onPress={onResumeAwareness}
              accessibilityRole="button"
              accessibilityLabel="Resume Awareness"
            >
              <Text style={styles.resumeButtonText}>Resume</Text>
            </TouchableOpacity>
          )}
          {onStopAwareness && (
            <TouchableOpacity
              style={styles.stopButton}
              onPress={onStopAwareness}
              accessibilityRole="button"
              accessibilityLabel="Stop Awareness"
            >
              <Text style={styles.stopButtonText}>Stop Awareness</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Single-Shot Manual Detection Button */}
      <TouchableOpacity
        style={[
          styles.detectButton,
          isSingleShotDisabled && styles.buttonDisabled,
        ]}
        onPress={onDetect}
        disabled={isSingleShotDisabled}
        accessibilityRole="button"
        accessibilityLabel={
          awarenessStatus === "ACTIVE"
            ? "Single-shot detection paused while awareness is active"
            : buttonTitle
        }
        accessibilityHint="Captures a single photo, detects objects, and speaks their spatial location"
      >
        {isDetecting ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.detectButtonText}>
            {awarenessStatus === "ACTIVE"
              ? "Detect & Describe (Awareness Running)"
              : buttonTitle}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  buttonContainer: {
    position: "absolute",
    bottom: 24,
    left: 16,
    right: 16,
    zIndex: 10,
  },
  detectButton: {
    backgroundColor: "#2563eb",
    paddingVertical: 13,
    paddingHorizontal: 20,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  buttonDisabled: {
    backgroundColor: "#334155",
    opacity: 0.6,
  },
  detectButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "bold",
    letterSpacing: 0.5,
  },
  awarenessControlsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 8,
  },
  startAwarenessButton: {
    backgroundColor: "#059669",
    paddingVertical: 13,
    paddingHorizontal: 20,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  startAwarenessText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "bold",
    letterSpacing: 0.5,
  },
  pauseButton: {
    flex: 1,
    backgroundColor: "#d97706",
    paddingVertical: 12,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
  },
  pauseButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
  },
  resumeButton: {
    flex: 1,
    backgroundColor: "#059669",
    paddingVertical: 12,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
  },
  resumeButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
  },
  stopButton: {
    flex: 1,
    backgroundColor: "#dc2626",
    paddingVertical: 12,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
  },
  stopButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
  },
});
