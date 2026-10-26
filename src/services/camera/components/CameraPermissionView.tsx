import React from "react";
import { Button, StyleSheet, Text, View } from "react-native";
import type { PermissionResponse } from "expo-camera";

interface CameraPermissionViewProps {
  permission: PermissionResponse | null;
  onRequestPermission: () => void;
}

/**
 * Renders permission state screens when camera access is pending or denied.
 */
export const CameraPermissionView: React.FC<CameraPermissionViewProps> = ({
  permission,
  onRequestPermission,
}) => {
  if (!permission) {
    return (
      <View style={styles.container}>
        <Text style={styles.permissionText}>Checking camera permission...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.permissionText}>Camera permission is required.</Text>
      <Button title="Allow Camera" onPress={onRequestPermission} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  permissionText: {
    color: "#fff",
    fontSize: 16,
    marginBottom: 16,
    textAlign: "center",
  },
});
