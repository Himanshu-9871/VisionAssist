// 1 st
// building the camera UI

import { CameraView, useCameraPermissions } from "expo-camera";
import { useRef, useState } from "react";
import { Button, StyleSheet, Text, View } from "react-native";
import { captureFrame } from "./cameraService";

export default function CameraPreview() {
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);

  const cameraRef = useRef<CameraView>(null);

  if (!permission) {
    return (
      <View style={styles.container}>
        <Text>Checking camera permission...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text>Camera permission is required.</Text>

        <Button title="Allow Camera" onPress={requestPermission} />
      </View>
    );
  }

  const capturePhoto = async () => {
    if (!cameraRef.current || !cameraReady) {
      return;
    }

    try {
        
      const frame = await captureFrame(cameraRef.current);
      console.log("Captured frame:", frame);

    } catch (error) {
      console.error("Camera capture failed:", error);
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

      <View style={styles.buttonContainer}>
        <Button
          title="Capture"
          onPress={capturePhoto}
          disabled={!cameraReady}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  camera: {
    flex: 1,
  },

  buttonContainer: {
    position: "absolute",
    bottom: 40,
    left: 20,
    right: 20,
  },
});
