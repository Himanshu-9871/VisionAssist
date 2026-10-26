import { Asset } from "expo-asset";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { InferenceSession } from "onnxruntime-react-native";
import type { Detection } from "../../shared/types";
import {
  createInputTensor,
  decodeImageBytes,
  decodeTestImage,
  loadImageBytesFromUri,
  parseDetections,
  remapCoordinatesToOriginalDimensions,
  MODEL_INPUT_WIDTH,
} from "./imagePreprocessing";

// Re-export domain Detection interface and COCO class helpers for consumers
export type { Detection };
export { COCO_CLASSES, getClassName } from "./cocoClasses";
export {
  MODEL_INPUT_WIDTH,
  MODEL_INPUT_HEIGHT,
  DEFAULT_CONFIDENCE_THRESHOLD,
} from "./imagePreprocessing";

let cachedSession: InferenceSession | null = null;

/**
 * Loads the YOLO26n ONNX model from the bundled assets.
 */
async function getModelPath(): Promise<string> {
  const asset = Asset.fromModule(
    require("../../../assets/models/yolo26n.onnx")
  );

  await asset.downloadAsync();

  if (!asset.localUri) {
    throw new Error("[YOLO26] Could not obtain local URI for YOLO26n model");
  }

  return asset.localUri;
}

/**
 * Creates or retrieves the cached YOLO26n ONNX InferenceSession.
 */
export async function getSession(): Promise<InferenceSession> {
  if (cachedSession) {
    return cachedSession;
  }

  const modelPath = await getModelPath();
  console.log("[YOLO26] Loading model:", modelPath);

  cachedSession = await InferenceSession.create(modelPath, {
    intraOpNumThreads: 4,
    graphOptimizationLevel: "all",
    enableCpuMemArena: true,
    enableMemPattern: true,
  });

  console.log("[YOLO26] Model loaded successfully with multi-threading & optimizations");
  return cachedSession;
}

/**
 * Executes YOLO26 inference on raw RGBA image pixels.
 *
 * Workflow:
 * 1. Letterbox pre-processing and input tensor creation.
 * 2. Model inference via cached ONNX session.
 * 3. Detection parsing and inverse letterbox coordinate remapping.
 */
async function runInferenceOnImageData(
  rgba: Uint8Array,
  width: number,
  height: number
): Promise<Detection[]> {
  const session = await getSession();

  const { tensor: inputTensor, letterbox } = createInputTensor(
    rgba,
    width,
    height
  );

  console.log("[YOLO26] Input tensor created:", inputTensor.dims);

  const startTime = Date.now();
  const results = await session.run({ images: inputTensor });
  const latencyMs = Date.now() - startTime;

  const outputTensor = results.output0;
  if (!outputTensor) {
    throw new Error("[YOLO26] Model inference did not produce output0");
  }

  const output = outputTensor.data as Float32Array;
  console.log(`[YOLO26] Inference time: ${latencyMs} ms`);

  const detections = parseDetections(output, letterbox);
  console.log("[YOLO26] Detections count:", detections.length);

  return detections;
}

/**
 * Runs YOLO26n on the bundled static test image (regression test).
 */
export async function testYOLO26(): Promise<Detection[]> {
  console.log("[YOLO26] Starting test...");
  const image = await decodeTestImage();
  return runInferenceOnImageData(image.data, image.width, image.height);
}

/**
 * Runs YOLO26n object detection on an image from a given URI (e.g. captured camera photo).
 *
 * Performance-optimized:
 * 1. Uses native hardware scaling (expo-image-manipulator) to downscale to 640px in ~20ms,
 *    bypassing slow multi-second JavaScript JPEG decoding of 12MP photos.
 * 2. Decodes compact JPEG in JS in ~20ms.
 * 3. Runs multi-threaded ONNX inference in ~150-250ms.
 * 4. Remaps bounding boxes back to original camera coordinate space if dimensions provided.
 *
 * @param imageUri Local file URI or remote URI to the JPEG image
 * @param originalWidth Optional original photo width for box scaling
 * @param originalHeight Optional original photo height for box scaling
 * @returns Array of detected objects with class names, confidence, and bounding boxes
 */
export async function detectObjectsFromImage(
  imageUri: string,
  originalWidth?: number,
  originalHeight?: number
): Promise<Detection[]> {
  if (!imageUri || typeof imageUri !== "string" || imageUri.trim() === "") {
    throw new Error(`[YOLO26] Invalid image URI provided: ${imageUri}`);
  }

  const totalStartTime = Date.now();
  console.log("[YOLO26] Starting detection pipeline...");

  let targetUri = imageUri;

  // 1. Native Hardware Resize (scales photo in C++ in ~20ms)
  try {
    const resizeStartTime = Date.now();
    const manipulated = await manipulateAsync(
      imageUri,
      [{ resize: { width: MODEL_INPUT_WIDTH } }],
      { compress: 0.8, format: SaveFormat.JPEG }
    );
    targetUri = manipulated.uri;
    console.log(
      `[YOLO26] Native hardware downscale: ${manipulated.width}x${manipulated.height} in ${Date.now() - resizeStartTime} ms`
    );
  } catch (resizeError) {
    console.warn("[YOLO26] Native resize skipped or failed, falling back to direct decode:", resizeError);
  }

  // 2. Fast decode of compact JPEG in JS
  const decodeStartTime = Date.now();
  const bytes = await loadImageBytesFromUri(targetUri);
  const image = decodeImageBytes(bytes);
  console.log(`[YOLO26] Compact image decoded: ${image.width}x${image.height} in ${Date.now() - decodeStartTime} ms`);

  // 3. Multi-threaded ONNX Inference
  const detections = await runInferenceOnImageData(image.data, image.width, image.height);

  // 4. Remap bounding boxes back to original photo coordinate space if requested
  if (originalWidth && originalWidth > 0 && originalHeight && originalHeight > 0) {
    remapCoordinatesToOriginalDimensions(
      detections,
      originalWidth,
      originalHeight,
      image.width,
      image.height
    );
  }

  console.log(`[YOLO26] Total detection time: ${Date.now() - totalStartTime} ms`);
  return detections;
}
