import { Asset } from "expo-asset";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import jpeg from "jpeg-js";
import { InferenceSession, Tensor } from "onnxruntime-react-native";

export interface Detection {
  classId: number;
  className: string;
  confidence: number;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

const MODEL_WIDTH = 640;
const MODEL_HEIGHT = 640;
const CONFIDENCE_THRESHOLD = 0.25;

// YOLO uses COCO class IDs for the pretrained model.
const COCO_CLASSES = [
  "person",
  "bicycle",
  "car",
  "motorcycle",
  "Fan",
  "bus",
  "train",
  "truck",
  "boat",
  "light",
  "fire hydrant",
  "stop sign",
  "parking meter",
  "bench",
  "bird",
  "cat",
  "dog",
  "horse",
  "sheep",
  "cow",
  "elephant",
  "bear",
  "zebra",
  "giraffe",
  "backpack",
  "umbrella",
  "handbag",
  "tie",
  "suitcase",
  "frisbee",
  "skis",
  "snowboard",
  "sports ball",
  "kite",
  "baseball bat",
  "baseball glove",
  "skateboard",
  "surfboard",
  "tennis racket",
  "bottle",
  "wine glass",
  "cup",
  "fork",
  "knife",
  "spoon",
  "bowl",
  "banana",
  "apple",
  "sandwich",
  "orange",
  "broccoli",
  "carrot",
  "hot dog",
  "pizza",
  "donut",
  "cake",
  "chair",
  "couch",
  "potted plant",
  "bed",
  "dining table",
  "toilet",
  "tv",
  "laptop",
  "mouse",
  "remote",
  "keyboard",
  "cell phone",
  "microwave",
  "oven",
  "toaster",
  "sink",
  "refrigerator",
  "book",
  "clock",
  "vase",
  "scissors",
  "teddy bear",
  "hair drier",
  "toothbrush",
];

let cachedSession: InferenceSession | null = null;

/**
 * Load the YOLO26n ONNX model from the bundled assets.
 */
async function getModelPath(): Promise<string> {
  const asset = Asset.fromModule(
    require("../../../assets/models/yolo26n.onnx")
  );

  await asset.downloadAsync();

  if (!asset.localUri) {
    throw new Error("Could not obtain local URI for YOLO26n model");
  }

  return asset.localUri;
}

/**
 * Create and cache the YOLO26n ONNX session.
 */
async function getSession(): Promise<InferenceSession> {
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
 * Load binary bytes from a file or asset URI.
 */
async function loadImageBytesFromUri(uri: string): Promise<Uint8Array> {
  const response = await fetch(uri);
  const buffer = await response.arrayBuffer();

  return new Uint8Array(buffer);
}

/**
 * Decode JPEG bytes into raw RGBA pixels.
 */
function decodeImageBytes(bytes: Uint8Array): {
  width: number;
  height: number;
  data: Uint8Array;
} {
  const decoded = jpeg.decode(bytes, {
    useTArray: true,
  });

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
 * Decode bundled test image into raw RGBA pixels (regression test helper).
 */
async function decodeTestImage(): Promise<{
  width: number;
  height: number;
  data: Uint8Array;
}> {
  const asset = Asset.fromModule(
    require("../../../assets/test/test1.jpeg")
  );

  await asset.downloadAsync();

  if (!asset.localUri) {
    throw new Error("Could not obtain local URI for test image");
  }

  const bytes = await loadImageBytesFromUri(asset.localUri);
  const image = decodeImageBytes(bytes);

  console.log(
    `[YOLO26] Test image decoded: ${image.width}x${image.height}`
  );

  return image;
}

interface LetterboxInfo {
  scale: number;
  padX: number;
  padY: number;
  sourceWidth: number;
  sourceHeight: number;
}

/**
 * Convert RGBA pixels into YOLO's letterboxed NCHW Float32 tensor:
 *
 * [1, 3, 640, 640]
 *
 * Maintains image aspect ratio, scales to fit inside 640x640,
 * fills remaining padding with standard YOLO gray (114/255),
 * and normalizes RGB values to 0-1.
 */
function createInputTensor(
  rgba: Uint8Array,
  sourceWidth: number,
  sourceHeight: number
): {
  tensor: Tensor;
  letterbox: LetterboxInfo;
} {
  const scale = Math.min(
    MODEL_WIDTH / sourceWidth,
    MODEL_HEIGHT / sourceHeight
  );

  const scaledWidth = Math.round(sourceWidth * scale);
  const scaledHeight = Math.round(sourceHeight * scale);

  const padX = Math.floor((MODEL_WIDTH - scaledWidth) / 2);
  const padY = Math.floor((MODEL_HEIGHT - scaledHeight) / 2);

  const channelSize = MODEL_WIDTH * MODEL_HEIGHT;
  const input = new Float32Array(channelSize * 3);

  // Fill remaining padding area with standard YOLO gray (114 / 255)
  input.fill(114 / 255);

  for (let y = 0; y < scaledHeight; y++) {
    const srcY = Math.min(
      sourceHeight - 1,
      Math.floor(y / scale)
    );

    for (let x = 0; x < scaledWidth; x++) {
      const srcX = Math.min(
        sourceWidth - 1,
        Math.floor(x / scale)
      );

      const srcIndex = (srcY * sourceWidth + srcX) * 4;
      const r = rgba[srcIndex] / 255;
      const g = rgba[srcIndex + 1] / 255;
      const b = rgba[srcIndex + 2] / 255;

      const targetX = padX + x;
      const targetY = padY + y;
      const targetIndex = targetY * MODEL_WIDTH + targetX;

      // CHW layout
      input[targetIndex] = r;
      input[channelSize + targetIndex] = g;
      input[channelSize * 2 + targetIndex] = b;
    }
  }

  const tensor = new Tensor(
    "float32",
    input,
    [1, 3, MODEL_HEIGHT, MODEL_WIDTH]
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
 * Convert YOLO26 output into our Detection format.
 *
 * Each row contains:
 * [x1, y1, x2, y2, confidence, classId]
 *
 * If letterbox info is provided, bounding boxes are mapped back to original image space.
 */
function parseDetections(
  output: Float32Array | number[],
  letterbox?: LetterboxInfo
): Detection[] {
  const detections: Detection[] = [];

  const valuesPerDetection = 6;

  for (let i = 0; i < 300; i++) {
    const offset = i * valuesPerDetection;

    let x1 = output[offset];
    let y1 = output[offset + 1];
    let x2 = output[offset + 2];
    let y2 = output[offset + 3];
    const confidence = output[offset + 4];
    const classId = Math.round(output[offset + 5]);

    if (!Number.isFinite(confidence) || confidence < CONFIDENCE_THRESHOLD) {
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
      className: COCO_CLASSES[classId] ?? `class_${classId}`,
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
 * Common YOLO26 inference pipeline:
 * 1. Letterbox pre-processing
 * 2. Tensor creation
 * 3. Model inference
 * 4. Detection parsing and inverse letterbox coordinate remapping
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

  const results = await session.run({
    images: inputTensor,
  });

  const latencyMs = Date.now() - startTime;

  const outputTensor = results.output0;

  if (!outputTensor) {
    throw new Error("YOLO26 did not produce output0");
  }

  const output = outputTensor.data as Float32Array;
  console.log(`[YOLO26] Inference time: ${latencyMs} ms`);

  const detections = parseDetections(output, letterbox);

  console.log("[YOLO26] Detections:", detections);

  return detections;
}

/**
 * Run YOLO26n on the bundled static test image (regression test).
 */
export async function testYOLO26(): Promise<Detection[]> {
  console.log("[YOLO26] Starting test...");

  const image = await decodeTestImage();

  return runInferenceOnImageData(image.data, image.width, image.height);
}

/**
 * Run YOLO26n object detection on an image from a given URI (e.g., captured camera photo).
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

  // 1. Native Hardware Resize (scales photo to 640px in C++ in ~20ms, eliminating 3+ seconds of JS decode)
  try {
    const resizeStartTime = Date.now();
    const manipulated = await manipulateAsync(
      imageUri,
      [{ resize: { width: MODEL_WIDTH } }],
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
    const scaleFactorX = originalWidth / image.width;
    const scaleFactorY = originalHeight / image.height;

    for (const det of detections) {
      det.boundingBox.x = Math.round(det.boundingBox.x * scaleFactorX);
      det.boundingBox.y = Math.round(det.boundingBox.y * scaleFactorY);
      det.boundingBox.width = Math.round(det.boundingBox.width * scaleFactorX);
      det.boundingBox.height = Math.round(det.boundingBox.height * scaleFactorY);
    }
  }

  console.log(`[YOLO26] Total detection time: ${Date.now() - totalStartTime} ms`);

  return detections;
}
