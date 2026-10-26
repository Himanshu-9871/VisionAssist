import { CameraView } from "expo-camera";
import { Image } from "react-native";
import type { Frame } from "../../shared/types";

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
    console.error("[CameraService] Camera capture failed:", error);
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

/**
 * Resolves exact photo dimensions from capture metadata or retrieves them via Image.getSize.
 */
export async function resolveImageDimensions(
  uri: string,
  providedWidth?: number,
  providedHeight?: number
): Promise<{ width: number; height: number }> {
  if (
    providedWidth &&
    providedHeight &&
    providedWidth > 0 &&
    providedHeight > 0
  ) {
    return { width: providedWidth, height: providedHeight };
  }

  try {
    return await getImageDimensions(uri);
  } catch (err) {
    console.warn(
      "[CameraService] Could not retrieve dimensions via Image.getSize, using 640x640 default:",
      err
    );
    return { width: 640, height: 640 };
  }
}