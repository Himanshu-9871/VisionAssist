import { Asset } from "expo-asset";
import jpeg from "jpeg-js";
import { Tensor } from "onnxruntime-react-native";
import type { Detection } from "../../shared/types";
import { getClassName } from "./cocoClasses";

export const MODEL_INPUT_WIDTH = 640;
export const MODEL_INPUT_HEIGHT = 640;
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.25;

export const VALUES_PER_DETECTION = 6;
export const MAX_DETECTIONS_COUNT = 300;

export interface LetterboxInfo {
  scale: number;
  padX: number;
  padY: number;
  sourceWidth: number;
  sourceHeight: number;
}

export interface DecodedImage {
  width: number;
  height: number;
  data: Uint8Array;
}

/**
 * Loads binary bytes from a file or asset URI.
 */
export async function loadImageBytesFromUri(uri: string): Promise<Uint8Array> {
  const response = await fetch(uri);
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}

/**
 * Decodes JPEG bytes into raw RGBA pixels.
 */
export function decodeImageBytes(bytes: Uint8Array): DecodedImage {
  const decoded = jpeg.decode(bytes, { useTArray: true });

  if (!decoded || !decoded.data || !decoded.width || !decoded.height) {
    throw new Error("[YOLO26] Failed to decode JPEG image data.");
  }

  return {
    width: decoded.width,
    height: decoded.height,
    data: decoded.data,
  };
}

/**
 * Decodes the bundled regression test image into raw RGBA pixels.
 */
export async function decodeTestImage(): Promise<DecodedImage> {
  const asset = Asset.fromModule(
    require("../../../assets/test/test1.jpeg")
  );

  await asset.downloadAsync();

  if (!asset.localUri) {
    throw new Error("[YOLO26] Could not obtain local URI for test image");
  }

  const bytes = await loadImageBytesFromUri(asset.localUri);
  const image = decodeImageBytes(bytes);

  console.log(`[YOLO26] Test image decoded: ${image.width}x${image.height}`);
  return image;
}

/**
 * Converts RGBA pixels into YOLO's letterboxed NCHW Float32 tensor:
 * [1, 3, 640, 640]
 *
 * Maintains image aspect ratio, scales to fit inside 640x640,
 * fills remaining padding with standard YOLO gray (114/255),
 * and normalizes RGB values to 0-1.
 */
export function createInputTensor(
  rgba: Uint8Array,
  sourceWidth: number,
  sourceHeight: number
): {
  tensor: Tensor;
  letterbox: LetterboxInfo;
} {
  const scale = Math.min(
    MODEL_INPUT_WIDTH / sourceWidth,
    MODEL_INPUT_HEIGHT / sourceHeight
  );

  const scaledWidth = Math.round(sourceWidth * scale);
  const scaledHeight = Math.round(sourceHeight * scale);

  const padX = Math.floor((MODEL_INPUT_WIDTH - scaledWidth) / 2);
  const padY = Math.floor((MODEL_INPUT_HEIGHT - scaledHeight) / 2);

  const channelSize = MODEL_INPUT_WIDTH * MODEL_INPUT_HEIGHT;
  const input = new Float32Array(channelSize * 3);

  // Fill padding area with standard YOLO gray (114 / 255)
  input.fill(114 / 255);

  for (let y = 0; y < scaledHeight; y++) {
    const srcY = Math.min(sourceHeight - 1, Math.floor(y / scale));

    for (let x = 0; x < scaledWidth; x++) {
      const srcX = Math.min(sourceWidth - 1, Math.floor(x / scale));

      const srcIndex = (srcY * sourceWidth + srcX) * 4;
      const r = rgba[srcIndex] / 255;
      const g = rgba[srcIndex + 1] / 255;
      const b = rgba[srcIndex + 2] / 255;

      const targetX = padX + x;
      const targetY = padY + y;
      const targetIndex = targetY * MODEL_INPUT_WIDTH + targetX;

      // Planar CHW layout
      input[targetIndex] = r;
      input[channelSize + targetIndex] = g;
      input[channelSize * 2 + targetIndex] = b;
    }
  }

  const tensor = new Tensor(
    "float32",
    input,
    [1, 3, MODEL_INPUT_HEIGHT, MODEL_INPUT_WIDTH]
  );

  return {
    tensor,
    letterbox: {
      scale,
      padX,
      padY,
      sourceWidth,
      sourceHeight,
    },
  };
}

/**
 * Converts raw YOLO26 output into our domain Detection format.
 *
 * Each row contains:
 * [x1, y1, x2, y2, confidence, classId]
 *
 * If letterbox info is provided, bounding boxes are mapped back to original image space.
 */
export function parseDetections(
  output: Float32Array | number[],
  letterbox?: LetterboxInfo,
  confidenceThreshold: number = DEFAULT_CONFIDENCE_THRESHOLD
): Detection[] {
  const detections: Detection[] = [];

  for (let i = 0; i < MAX_DETECTIONS_COUNT; i++) {
    const offset = i * VALUES_PER_DETECTION;

    let x1 = output[offset];
    let y1 = output[offset + 1];
    let x2 = output[offset + 2];
    let y2 = output[offset + 3];
    const confidence = output[offset + 4];
    const classId = Math.round(output[offset + 5]);

    if (!Number.isFinite(confidence) || confidence < confidenceThreshold) {
      continue;
    }

    if (
      !Number.isFinite(x1) ||
      !Number.isFinite(y1) ||
      !Number.isFinite(x2) ||
      !Number.isFinite(y2)
    ) {
      continue;
    }

    // Map coordinates back from 640x640 letterbox space to original image space
    if (letterbox) {
      const { scale, padX, padY, sourceWidth, sourceHeight } = letterbox;
      x1 = Math.max(0, Math.min(sourceWidth, (x1 - padX) / scale));
      y1 = Math.max(0, Math.min(sourceHeight, (y1 - padY) / scale));
      x2 = Math.max(0, Math.min(sourceWidth, (x2 - padX) / scale));
      y2 = Math.max(0, Math.min(sourceHeight, (y2 - padY) / scale));
    }

    detections.push({
      classId,
      className: getClassName(classId),
      confidence,
      boundingBox: {
        x: x1,
        y: y1,
        width: x2 - x1,
        height: y2 - y1,
      },
    });
  }

  return detections;
}

/**
 * Remaps detection bounding box coordinates back to original camera coordinate space.
 */
export function remapCoordinatesToOriginalDimensions(
  detections: Detection[],
  originalWidth: number,
  originalHeight: number,
  processedWidth: number,
  processedHeight: number
): void {
  if (
    !originalWidth ||
    !originalHeight ||
    !processedWidth ||
    !processedHeight ||
    originalWidth <= 0 ||
    originalHeight <= 0
  ) {
    return;
  }

  const scaleFactorX = originalWidth / processedWidth;
  const scaleFactorY = originalHeight / processedHeight;

  for (const det of detections) {
    det.boundingBox.x = Math.round(det.boundingBox.x * scaleFactorX);
    det.boundingBox.y = Math.round(det.boundingBox.y * scaleFactorY);
    det.boundingBox.width = Math.round(det.boundingBox.width * scaleFactorX);
    det.boundingBox.height = Math.round(det.boundingBox.height * scaleFactorY);
  }
}
