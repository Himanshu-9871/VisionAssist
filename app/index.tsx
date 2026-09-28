import { useState } from "react";
import { StyleSheet, View, Button } from "react-native";
import { CameraPreview } from "../src/services/camera";
import {
  detectObjectsFromImage,
  testYOLO26,
  type Detection,
} from "../src/services/objectDetection";

function HomeScreen() {
  const [isDetecting, setIsDetecting] = useState(false);

  /**
   * Orchestration layer: receives the captured image URI from the Camera module,
   * passes it to the Object Detection module (YOLO26), and logs the detections.
   */
  const handleDetectObjects = async (imageUri: string) => {
    try {
      setIsDetecting(true);
      const detections: Detection[] = await detectObjectsFromImage(imageUri);
      console.log(
        "[YOLO26] Final Detections:",
        JSON.stringify(detections, null, 2)
      );
    } catch (error) {
      console.error("[HomeScreen] Detection failed:", error);
    } finally {
      setIsDetecting(false);
    }
  };

  /**
   * Regression test: runs static test image detection to verify YOLO baseline.
   */
  const handleRegressionTest = async () => {
    try {
      const detections = await testYOLO26();
      console.log(
        "YOLO26 STATIC TEST DETECTIONS:",
        JSON.stringify(detections, null, 2)
      );
    } catch (error) {
      console.error("YOLO26 STATIC TEST FAILED:", error);
    }
  };

  return (
    <View style={styles.container}>
      <CameraPreview
        onDetect={handleDetectObjects}
        isDetecting={isDetecting}
      />

      <View style={styles.regressionButtonContainer}>
        <Button
          title="Test YOLO26 (Static Image)"
          onPress={handleRegressionTest}
          color="#334155"
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