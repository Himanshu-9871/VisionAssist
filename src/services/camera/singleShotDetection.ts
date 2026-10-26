import { detectObjectsFromImage, type Detection } from "../objectDetection";
import {
  describeDetections,
  type SpatialDescriptionResult,
} from "../spatialAwareness";
import { resolveImageDimensions } from "./cameraService";

export interface SingleShotScanResult {
  description: string;
  detections: Detection[];
  spatialResult: SpatialDescriptionResult;
  dimensions: { width: number; height: number };
}

/**
 * Executes a complete single-shot detection and spatial description pipeline on a captured image.
 *
 * 1. Resolves accurate image dimensions without guessing.
 * 2. Runs YOLO26 object detection with coordinate remapping.
 * 3. Analyzes spatial distribution (LEFT, CENTER, RIGHT).
 * 4. Synthesizes a natural, concise spoken description.
 *
 * @param imageUri URI of the captured photo
 * @param width Optional known photo width
 * @param height Optional known photo height
 */
export async function executeSingleShotScan(
  imageUri: string,
  width?: number,
  height?: number
): Promise<SingleShotScanResult> {
  const dimensions = await resolveImageDimensions(imageUri, width, height);

  console.log(
    `[SingleShotScan] Processing image: ${imageUri} (${dimensions.width}x${dimensions.height})`
  );

  const detections = await detectObjectsFromImage(
    imageUri,
    dimensions.width,
    dimensions.height
  );

  const spatialResult = describeDetections(detections, dimensions.width);

  return {
    description: spatialResult.description,
    detections,
    spatialResult,
    dimensions,
  };
}
