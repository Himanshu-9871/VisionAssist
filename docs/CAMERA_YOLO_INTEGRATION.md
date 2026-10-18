# Camera & YOLO26 Object Detection Integration

**Project:** VisionAssist  
**Module:** Camera $\rightarrow$ Object Detection Pipeline  
**Date:** September 2026  

---

## 1. Executive Summary

This document explains how the **Camera Module** was integrated with the **Object Detection (YOLO26)** module, detailing the exact lifecycle of a captured image: where the file is stored by Android, how its reference is passed through the app, and how it is transformed into an AI tensor for on-device inference.

---

## 2. System Architecture & Separation of Concerns

The integration follows a strict **decoupled architecture**:
* The **Camera Module** (`src/services/camera/`) knows **nothing** about YOLO or machine learning. Its only responsibility is camera preview, permission handling, and capturing an image file.
* The **Object Detection Module** (`src/services/objectDetection/`) knows **nothing** about the Camera component. Its only responsibility is accepting an image URI, preprocessing the pixels, running the ONNX neural network, and returning bounding boxes.
* The **Orchestration Layer** (`app/index.tsx`) connects the two independent modules.

```
┌────────────────────────────────┐
│         CameraPreview          │
│   (Camera UI + Permissions)    │
└───────────────┬────────────────┘
                │
                │ User presses "Detect Objects"
                │ Captures photo & generates local URI
                ▼
┌────────────────────────────────┐
│      HomeScreen Component      │  ◄── Application / Orchestration Layer
│       (app/index.tsx)          │      (Connects Camera to AI)
└───────────────┬────────────────┘
                │
                │ Calls detectObjectsFromImage(imageUri)
                ▼
┌────────────────────────────────┐
│     ObjectDetectionService     │
│   - Reads binary file bytes    │
│   - Decodes JPEG to RGBA       │
│   - Letterboxes to 640x640     │
│   - Executes YOLO26 ONNX       │
│   - Remaps coords to original  │
└───────────────┬────────────────┘
                │
                ▼
      Returns: Detection[]
```

---

## 3. The Lifecycle of an Image: Where Does it Go?

When you press the **"Detect Objects"** button, the image traverses 6 distinct stages:

```
[1. Real World Scene]
         │  Camera sensor capture via Android Camera2 API
         ▼
[2. Android Cache Storage] ─── File saved to /data/user/0/.../cache/Camera/<uuid>.jpg
         │  URI emitted: "file:///data/user/0/.../<uuid>.jpg"
         ▼
[3. HomeScreen Orchestrator] ─── Passes URI string to detectObjectsFromImage()
         │
         ▼
[4. JavaScript Heap Memory] ─── File read into ArrayBuffer ──► Decoded to RGBA Uint8Array
         │
         ▼
[5. Model Tensor Memory] ─── Scaled & letterboxed to Float32Array [1, 3, 640, 640]
         │
         ▼
[6. ONNX C++ Runtime Engine] ─── Native neural network calculates detections
         │
         ▼
[7. Final Detections] ─── Remapped bounding boxes returned to app
```

### Stage 1: The Camera Sensor & Native Android OS Capture
When the user taps **Detect Objects**, `cameraRef.current.takePictureAsync()` is called. The native Android OS camera driver writes the uncompressed sensor frame as a compressed JPEG directly into the app's isolated private sandbox directory:
```
/data/user/0/com.himanshu.visionassist/cache/Camera/<unique-uuid>.jpg
```
* **Security & Isolation:** This folder is protected by Android Unix permissions (`u0_a437`). Other apps cannot access it.
* **Format:** Standard JPEG file (~3 MB to 5 MB on high-resolution sensors).

### Stage 2: Returning the URI to the Orchestrator
The Camera service packages the file details into a `Frame` object and returns the file URI:
```typescript
{
  uri: "file:///data/user/0/com.himanshu.visionassist/cache/Camera/a2e876e9-2748-42fb-8431-f34b99330638.jpg",
  width: 3060,
  height: 4080
}
```
`CameraPreview` logs:
```
[Camera] Photo captured: file:///data/user/0/com.himanshu.visionassist/cache/Camera/...
```
and executes `props.onDetect(frame.uri)`.

### Stage 3: Reading Bytes into JavaScript Memory
`objectDetectionService.ts` receives the `imageUri`. It uses React Native's internal networking/file blob layer (`fetch(uri)`) to read the raw binary file off disk into memory:
```typescript
const response = await fetch(imageUri);
const buffer = await response.arrayBuffer();
const bytes = new Uint8Array(buffer); // Compressed JPEG binary data
```

### Stage 4: JPEG Decompression into Raw Pixels
Because neural networks cannot process compressed JPEG stream bytes directly, the bytes are passed to `jpeg.decode()`:
```typescript
const decoded = jpeg.decode(bytes, { useTArray: true });
// Produces: decoded.width, decoded.height, and decoded.data (raw RGBA bytes)
```
Each pixel contains 4 bytes: `[Red, Green, Blue, Alpha]`.

### Stage 5: Letterbox Preprocessing & Tensor Construction
The YOLO26 model expects an exact square Float32 tensor: `[1, 3, 640, 640]` ($1 \text{ batch} \times 3 \text{ channels (RGB)} \times 640 \text{ height} \times 640 \text{ width}$).
Since phone cameras produce tall rectangular photos (e.g., $3060 \times 4080$), direct resizing would distort objects:
1. **Aspect Ratio Preservation:** The image scales down uniformly so its longest dimension fits 640 pixels:
   $$\text{scale} = \min\left(\frac{640}{\text{width}}, \frac{640}{\text{height}}\right)$$
2. **Neutral Gray Padding:** The remaining empty canvas is padded with standard YOLO neutral gray (`114 / 255` $\approx 0.447$).
3. **RGB Normalization:** Pixel values ($0 \dots 255$) are normalized to $[0.0, 1.0]$.
4. **Layout:** Stored in **NCHW** order (Channel Red plane, Channel Green plane, Channel Blue plane).

### Stage 6: ONNX Runtime Native Inference
The `Float32Array` tensor is dispatched across the React Native JSI (JavaScript Interface) boundary directly to the native C++ ONNX Runtime engine:
```typescript
const results = await session.run({ images: inputTensor });
```
The neural network processes the image in ~100–300 ms on device silicon.

### Stage 7: Un-letterboxing & Detection Parsing
The model outputs tensor `output0` with shape `[1, 300, 6]`:
* Each row represents: `[x1, y1, x2, y2, confidence, classId]`.
* Filtered by `CONFIDENCE_THRESHOLD = 0.25`.
* Coordinates are remapped from $640 \times 640$ letterbox space back to original photo dimensions:
  $$\text{origX} = \frac{x - \text{padX}}{\text{scale}}, \quad \text{origY} = \frac{y - \text{padY}}{\text{scale}}$$
* Result is returned as standard `Detection[]`.

---

## 4. Code Implementation Details

### 4.1 Object Detection Service (`src/services/objectDetection/objectDetectionService.ts`)

#### Adding `detectObjectsFromImage` & Reusing the Inference Pipeline
```typescript
/**
 * Common YOLO26 inference pipeline shared by static test and live camera captures:
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
  const results = await session.run({ images: inputTensor });
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
 * Public API: Run YOLO26n on an image URI (e.g. captured camera photo).
 * Optimized with native hardware scaling (expo-image-manipulator) to bypass
 * multi-second JavaScript JPEG decoding on 12MP photos.
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

  // 1. Native Hardware Resize (~20ms in C++ vs 3+ seconds in JS)
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
    console.warn("[YOLO26] Native resize skipped, falling back to direct decode:", resizeError);
  }

  // 2. Fast decode of compact JPEG in JS (~20ms)
  const decodeStartTime = Date.now();
  const bytes = await loadImageBytesFromUri(targetUri);
  const image = decodeImageBytes(bytes);
  console.log(`[YOLO26] Compact image decoded in ${Date.now() - decodeStartTime} ms`);

  // 3. Multi-threaded ONNX Inference (~150-250ms)
  const detections = await runInferenceOnImageData(image.data, image.width, image.height);

  // 4. Remap bounding boxes back to original camera coordinate space
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

/**
 * Regression Test: Run YOLO26n on bundled test asset (test1.jpeg).
 */
export async function testYOLO26(): Promise<Detection[]> {
  console.log("[YOLO26] Starting test...");
  const image = await decodeTestImage();
  return runInferenceOnImageData(image.data, image.width, image.height);
}
```

---

### 4.2 Camera View & UI Trigger (`src/services/camera/CameraView.tsx`)

```typescript
export interface CameraPreviewProps {
  onDetect?: (imageUri: string, width?: number, height?: number) => Promise<void> | void;
  isDetecting?: boolean;
}

export default function CameraPreview({
  onDetect,
  isDetecting = false,
}: CameraPreviewProps = {}) {
  // ... camera permissions & state ...

  const handleDetectObjects = async () => {
    if (!cameraRef.current || !cameraReady || isDetecting) {
      if (!cameraReady) {
        console.warn("[Camera] Camera is not ready yet.");
      }
      return;
    }

    try {
      const frame = await captureFrame(cameraRef.current);
      console.log(`[Camera] Photo captured: ${frame.uri}`);

      if (onDetect) {
        await onDetect(frame.uri);
      }
    } catch (error) {
      console.error("[Camera] Capture failed:", error);
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

      {/* Diagnostic HUD Card */}
      {/* ... */}

      {/* Detect Objects Action Button */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[
            styles.detectButton,
            (!cameraReady || isDetecting) && styles.buttonDisabled,
          ]}
          onPress={handleDetectObjects}
          disabled={!cameraReady || isDetecting}
        >
          {isDetecting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.detectButtonText}>Detect Objects</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}
```

---

### 4.3 Orchestration Layer (`app/index.tsx`)

```typescript
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

  // Bridges the Camera capture with the YOLO26 detector
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

export default HomeScreen;
```

---

## 5. Summary Table: Responsibilities Matrix

| Component | Responsibility | Inputs | Outputs |
|---|---|---|---|
| **`cameraService.ts`** | Interacts with native camera hardware | `CameraView` reference | `Frame` `{ uri, width, height }` |
| **`CameraView.tsx`** | Viewfinder UI, permissions, HUD, capture button | `onDetect`, `isDetecting` | Trigger event + photo capture |
| **`HomeScreen (index.tsx)`** | Orchestrates flow between camera and detector | User interaction | Relays URI to `detectObjectsFromImage` |
| **`objectDetectionService.ts`** | File loading, decoding, letterboxing, ONNX inference | `imageUri` | `Detection[]` |
