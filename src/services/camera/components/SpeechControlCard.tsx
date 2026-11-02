import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface SpeechControlCardProps {
  descriptionText: string | null;
  statusText: string | null;
  isDetecting: boolean;
  isSpeaking: boolean;
  onStopSpeech?: () => void;
  onReplaySpeech?: () => void;
}

/**
 * Spoken object description overlay card with Stop Voice and Replay playback controls.
 */
export const SpeechControlCard: React.FC<SpeechControlCardProps> = ({
  descriptionText,
  statusText,
  isDetecting,
  isSpeaking,
  onStopSpeech,
  onReplaySpeech,
}) => {
  const isVisible = Boolean(descriptionText || statusText || isDetecting);
  if (!isVisible) return null;

  const canReplay = !isSpeaking && !isDetecting && Boolean(descriptionText) && Boolean(onReplaySpeech);

  return (
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

          {canReplay && (
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
        <Text style={styles.descriptionText}>{descriptionText}</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  descriptionCard: {
    position: "absolute",
    bottom: 132,
    left: 16,
    right: 16,
    backgroundColor: "rgba(15, 23, 42, 0.94)",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: "rgba(96, 165, 250, 0.4)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 6,
    maxHeight: 140,
    zIndex: 8,
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
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 21,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  statusText: {
    color: "#94a3b8",
    fontSize: 13,
    fontStyle: "italic",
  },
});
