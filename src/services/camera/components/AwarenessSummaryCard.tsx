import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { Detection } from "../../objectDetection";
import type { AwarenessStatus } from "../../awareness";

interface AwarenessSummaryCardProps {
  status: AwarenessStatus;
  error: string | null;
  lastAnnouncementText: string | null;
  latestDetections: Detection[];
  isProcessing: boolean;
  captureIntervalMs: number;
}

/**
 * Compact summary overlay presenting recent detections, spoken announcements, and monitoring status.
 */
export const AwarenessSummaryCard: React.FC<AwarenessSummaryCardProps> = ({
  status,
  error,
  lastAnnouncementText,
  latestDetections,
  isProcessing,
  captureIntervalMs,
}) => {
  const isVisible =
    status === "ACTIVE" ||
    status === "PAUSED" ||
    Boolean(error) ||
    latestDetections.length > 0;

  if (!isVisible) return null;

  return (
    <View style={styles.awarenessSummaryCard}>
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>Notice: {error}</Text>
        </View>
      )}

      {lastAnnouncementText && (
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Last Spoken: </Text>
          <Text style={styles.summaryValue} numberOfLines={2}>
            {`"${lastAnnouncementText}"`}
          </Text>
        </View>
      )}

      {latestDetections.length > 0 ? (
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>
            In View ({latestDetections.length}):{" "}
          </Text>
          <Text style={styles.summaryDetections} numberOfLines={2}>
            {latestDetections
              .slice(0, 5)
              .map((d) => `${d.className} (${Math.round(d.confidence * 100)}%)`)
              .join(", ")}
            {latestDetections.length > 5
              ? ` +${latestDetections.length - 5} more`
              : ""}
          </Text>
        </View>
      ) : status === "ACTIVE" ? (
        <Text style={styles.monitoringStatusText}>
          {isProcessing
            ? "Analyzing surroundings..."
            : `Monitoring scene (~${(captureIntervalMs / 1000).toFixed(1)}s interval)...`}
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  awarenessSummaryCard: {
    position: "absolute",
    top: 90,
    left: 16,
    right: 16,
    backgroundColor: "rgba(15, 23, 42, 0.92)",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    zIndex: 9,
  },
  errorBanner: {
    backgroundColor: "rgba(220, 38, 38, 0.2)",
    padding: 6,
    borderRadius: 6,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.4)",
  },
  errorBannerText: {
    color: "#fca5a5",
    fontSize: 11,
    fontWeight: "600",
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 4,
    marginBottom: 4,
  },
  summaryLabel: {
    color: "#93c5fd",
    fontSize: 12,
    fontWeight: "700",
  },
  summaryValue: {
    color: "#f8fafc",
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
  },
  summaryDetections: {
    color: "#cbd5e1",
    fontSize: 12,
    flex: 1,
  },
  monitoringStatusText: {
    color: "#94a3b8",
    fontSize: 11,
    fontStyle: "italic",
  },
});
