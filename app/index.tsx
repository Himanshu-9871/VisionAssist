import { useEffect, useState } from "react";
import { StyleSheet, View, Button } from "react-native";
import {
  CameraPreview,
  getImageDimensions,
} from "../src/services/camera";
import {
  detectObjectsFromImage,
  testYOLO26,
  type Detection,
} from "../src/services/objectDetection";
import { describeDetections } from "../src/services/spatialAwareness";
import {
  speak,
  stopSpeech,
  isSpeaking,
} from "../src/services/tts";

function HomeScreen() {
  const [isDetecting, setIsDetecting] = useState(false);
  const [descriptionText, setDescriptionText] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [speakingActive, setSpeakingActive] = useState(false);

  // Poll speaking status periodically when speech is active to keep UI state accurate
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
   * Orchestration workflow:
   * 1. Capture one image using the existing camera service.
   * 2. Obtain original image dimensions from capture metadata or reliable image-dimension API (never guess).
   * 3. Pass URI and dimensions to the existing object-detection service (YOLO26).
   * 4. Pass detections and original image width to spatial awareness service.
   * 5. Generate concise spoken description.
   * 6. Speak the description through on-device TTS.
   * 7. Display the readable description text on screen.
   */
  const handleDetectAndDescribe = async (
    imageUri: string,
    width?: number,
    height?: number
  ) => {
    if (isDetecting) {
      return;
    }

    try {
      setIsDetecting(true);
      setStatusText("Capturing and analyzing...");

      // Stop previous speech immediately when a new description is requested
      await stopSpeech();
      setSpeakingActive(false);

      // Obtain exact original dimensions without guessing
      let actualWidth = width;
      let actualHeight = height;

      if (
        !actualWidth ||
        !actualHeight ||
        actualWidth <= 0 ||
        actualHeight <= 0
      ) {
        try {
          const dims = await getImageDimensions(imageUri);
          actualWidth = dims.width;
          actualHeight = dims.height;
          console.log(
            `[HomeScreen] Dimensions retrieved via getImageDimensions: ${actualWidth}x${actualHeight}`
          );
        } catch (dimError) {
          console.warn(
            "[HomeScreen] Could not get dimensions via Image.getSize, using defaults:",
            dimError
          );
        }
      }

      console.log(
        `[HomeScreen] Processing image: ${imageUri} (${actualWidth}x${actualHeight})`
      );

      // Run YOLO26n object detection with coordinate remapping
      setStatusText("Detecting objects with YOLO26...");
      const detections: Detection[] = await detectObjectsFromImage(
        imageUri,
        actualWidth,
        actualHeight
      );

      console.log(
        "[HomeScreen] Raw Detections:",
        JSON.stringify(detections, null, 2)
      );

      // Compute spatial awareness and generate concise spoken description
      const imageWidthForSpatial =
        actualWidth && actualWidth > 0 ? actualWidth : 640;
      const { description, spatialObjects } = describeDetections(
        detections,
        imageWidthForSpatial
      );

      console.log(
        "[HomeScreen] Spatial Objects:",
        JSON.stringify(spatialObjects, null, 2)
      );
      console.log("[HomeScreen] Generated Description:", description);

      // Update screen text
      setDescriptionText(description);
      setStatusText(null);

      // Speak through device Text-to-Speech
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
   * Stops ongoing voice speech.
   */
  const handleStopSpeech = async () => {
    await stopSpeech();
    setSpeakingActive(false);
  };

  /**
   * Replays the current description text.
   */
  const handleReplaySpeech = async () => {
    if (!descriptionText) return;
    setSpeakingActive(true);
    await speak(descriptionText, {
      onDone: () => setSpeakingActive(false),
      onStopped: () => setSpeakingActive(false),
      onError: () => setSpeakingActive(false),
    });
  };

  /**
   * Regression test: runs static test image detection to verify YOLO baseline,
   * spatial awareness, and speech output.
   */
  const handleRegressionTest = async () => {
    if (isDetecting) return;

    try {
      setIsDetecting(true);
      setStatusText("Running static regression test...");
      await stopSpeech();
      setSpeakingActive(false);

      const detections = await testYOLO26();
      console.log(
        "YOLO26 STATIC TEST DETECTIONS:",
        JSON.stringify(detections, null, 2)
      );

      // Bundled test image dimensions: 640px width
      const { description, spatialObjects } = describeDetections(
        detections,
        640
      );
      console.log("STATIC TEST SPATIAL OBJECTS:", spatialObjects);
      console.log("STATIC TEST DESCRIPTION:", description);

      setDescriptionText(description);
      setStatusText(null);

      setSpeakingActive(true);
      await speak(description, {
        onDone: () => setSpeakingActive(false),
        onStopped: () => setSpeakingActive(false),
        onError: () => setSpeakingActive(false),
      });
    } catch (error) {
      console.error("YOLO26 STATIC TEST FAILED:", error);
      setDescriptionText("Static regression test failed.");
    } finally {
      setIsDetecting(false);
      setStatusText(null);
    }
  };

  return (
    <View style={styles.container}>
      <CameraPreview
        onDetect={handleDetectAndDescribe}
        isDetecting={isDetecting}
        buttonTitle="Detect & Describe"
        descriptionText={descriptionText}
        statusText={statusText}
        onStopSpeech={handleStopSpeech}
        onReplaySpeech={handleReplaySpeech}
        isSpeaking={speakingActive}
      />

      <View style={styles.regressionButtonContainer}>
        <Button
          title="Test YOLO26 (Static Image)"
          onPress={handleRegressionTest}
          color="#334155"
          disabled={isDetecting}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  regressionButtonContainer: {
    position: "absolute",
    bottom: 8,
    left: 20,
    right: 20,
  },
});

export default HomeScreen;