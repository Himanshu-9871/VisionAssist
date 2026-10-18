import { CameraView } from "expo-camera";
import { Image } from "react-native";
import { Frame } from "../../shared/types/Frame";

/**
 * Captures a single frame from the camera, returning the image URI and exact photo dimensions.
 */
export async function captureFrame(
  camera: CameraView
): Promise<Frame> {
  try {
    const photo = await camera.takePictureAsync({
      quality: 0.7,
      skipProcessing: false,
    });

    if (!photo) {
      throw new Error("Camera did not return a photo.");
    }

    return {
      uri: photo.uri,
      width: photo.width,
      height: photo.height,
    };
  } catch (error) {
    console.error("Camera capture failed:", error);

    throw new Error("Failed to capture image from camera.");
  }
}

/**
 * Retrieves the exact width and height of an image file from its URI without guessing.
 */
export function getImageDimensions(
  uri: string
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (error) => reject(error)
    );
  });
}