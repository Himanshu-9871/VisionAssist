import { CameraView } from "expo-camera";
import { Frame } from "../../shared/types/Frame";

export async function captureFrame(
  camera: CameraView
): Promise<Frame> {
  try {
    const photo = await camera.takePictureAsync();

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