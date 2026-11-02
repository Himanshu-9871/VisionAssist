import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  CameraPreview,
  executeSingleShotScan,
  type CameraPreviewHandle,
} from "../src/services/camera";
import { speak, stopSpeech, isSpeaking } from "../src/services/tts";
import { useAwarenessMode } from "../src/services/awareness";

/**
 * Main application coordinator screen.
 *
 * Coordinates:
 * - Camera preview and permissions
 * - Automatic Awareness Mode continuous monitoring
 * - Manual single-shot scan and spatial description
 * - Voice playback, stopping, and replay
 */
function HomeScreen() {
  const [isDetecting, setIsDetecting] = useState(false);
  const [descriptionText, setDescriptionText] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [speakingActive, setSpeakingActive] = useState(false);

  const cameraPreviewRef = useRef<CameraPreviewHandle>(null);

  // Automatic Awareness Mode Hook
  const awareness = useAwarenessMode({
    cameraRef: cameraPreviewRef,
  });

  // Poll speaking status periodically when speech is active to keep UI state synchronized
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    if (speakingActive) {
      interval = setInterval(async () => {
        const active = await isSpeaking();
        if (!active) {
          setSpeakingActive(false);
        }
      }, 500);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [speakingActive]);

  /**
   * Executes a single-shot capture, object detection, spatial analysis, and spoken description.
   */
  const handleDetectAndDescribe = async (
    imageUri: string,
    width?: number,
    height?: number
  ) => {
    if (isDetecting || awareness.isProcessing) {
      return;
    }

    // Temporarily pause awareness during manual single-shot scan
    if (awareness.status === "ACTIVE") {
      await awareness.pauseAwareness();
    }

    try {
      setIsDetecting(true);
      setStatusText("Capturing and analyzing...");

      // Stop any ongoing speech before announcing new detection
      await stopSpeech();
      setSpeakingActive(false);

      setStatusText("Detecting objects with YOLO26...");
      const { description } = await executeSingleShotScan(
        imageUri,
        width,
        height
      );

      setDescriptionText(description);
      setStatusText(null);

      // Announce description through on-device TTS
      setSpeakingActive(true);
      await speak(description, {
        onDone: () => setSpeakingActive(false),
        onStopped: () => setSpeakingActive(false),
        onError: () => setSpeakingActive(false),
      });
    } catch (error) {
      console.error("[HomeScreen] Detection & description failed:", error);
      const errorMessage = "Detection failed. Please try again.";
      setDescriptionText(errorMessage);

      await speak(errorMessage, {
        onDone: () => setSpeakingActive(false),
        onStopped: () => setSpeakingActive(false),
      });
    } finally {
      setIsDetecting(false);
      setStatusText(null);
    }
  };

  /**
   * Stops ongoing voice speech immediately.
   */
  const handleStopSpeech = async () => {
    await stopSpeech();
    setSpeakingActive(false);
  };

  /**
   * Replays the current description or awareness announcement text.
   */
  const handleReplaySpeech = async () => {
    const textToReplay = descriptionText || awareness.lastAnnouncement;
    if (!textToReplay) return;

    setSpeakingActive(true);
    await speak(textToReplay, {
      onDone: () => setSpeakingActive(false),
      onStopped: () => setSpeakingActive(false),
      onError: () => setSpeakingActive(false),
    });
  };

  return (
    <View style={styles.container}>
      <CameraPreview
        ref={cameraPreviewRef}
        onDetect={handleDetectAndDescribe}
        isDetecting={isDetecting}
        buttonTitle="Detect & Describe"
        descriptionText={descriptionText || awareness.lastAnnouncement}
        statusText={statusText}
        onStopSpeech={handleStopSpeech}
        onReplaySpeech={handleReplaySpeech}
        isSpeaking={speakingActive}
        // Automatic Awareness Mode Controls & State
        awarenessStatus={awareness.status}
        onStartAwareness={awareness.startAwareness}
        onPauseAwareness={awareness.pauseAwareness}
        onResumeAwareness={awareness.resumeAwareness}
        onStopAwareness={awareness.stopAwareness}
        isAwarenessProcessing={awareness.isProcessing}
        lastAnnouncementText={awareness.lastAnnouncement}
        latestDetections={awareness.latestDetections}
        trackedObjectsCount={awareness.trackedObjects.length}
        awarenessError={awareness.error?.message ?? null}
        captureIntervalMs={awareness.captureIntervalMs}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
});

export default HomeScreen;