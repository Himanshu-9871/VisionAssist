# VisionAssist — Complete Architecture & Codebase Guide (English)

Welcome to the comprehensive codebase guide for **VisionAssist**. This guide explains every file in the project: why it exists, what it does, how it fits into the overall system, and key code examples to help you explain and understand the entire architecture with confidence.

---

## 1. System Architecture Overview

VisionAssist is an on-device AI assistant built with **React Native (Expo)** designed to assist blind and visually impaired users. It runs entirely on the device without requiring cloud internet access.

### End-to-End Data Flow Diagram

```mermaid
flowchart TD
    A[Camera Viewport] -->|Captures Frame JPEG| B[cameraService.ts]
    B -->|Downscales & Normalizes| C[imagePreprocessing.ts]
    C -->|NCHW Tensor 1x3x640x640| D[objectDetectionService.ts / YOLO26n ONNX]
    D -->|Raw 300x6 Bounding Boxes| C
    C -->|Inverse Letterbox Coordinates| E[Detection[] Contract]
    E -->|Single-Shot Mode| F[spatialAwarenessService.ts]
    E -->|Continuous Awareness Mode| G[sceneComparison.ts / sceneTracker]
    G -->|Object Persistence & Movement| H[announcementEngine.ts]
    F -->|Natural Spoken Description| I[ttsService.ts / expo-speech]
    H -->|Smart Throttled Speech| I
    I -->|Audio Voice Output| J[User Speaker / Earphones]
```

---

## 2. Main Entry & Application Coordination

### `app/_layout.tsx`
- **Why it was created:** Expo Router requires a root layout file to define screen navigation and navigation stacks.
- **What it does:** Wraps all screens in a fullscreen stack navigation without headers (`headerShown: false`) for a seamless, accessible camera view.
```tsx
import { Stack } from "expo-router";

export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

---

### `app/index.tsx` (Main Coordinator Screen)
- **Why it was created:** Serves as the single coordinator for the entire mobile application following Clean Code principles. It keeps state clean without cluttering UI with low-level algorithms.
- **What it does:**
  1. Manages high-level UI states (`isDetecting`, `descriptionText`, `statusText`, `speakingActive`).
  2. Binds the continuous background awareness loop via `useAwarenessMode`.
  3. Coordinates single-shot scans via `executeSingleShotScan`.
  4. Keeps speech status synchronized and handles immediate stopping/replaying of spoken announcements.
```tsx
// Key snippet from app/index.tsx:
const handleDetectAndDescribe = async (imageUri: string, width?: number, height?: number) => {
  if (isDetecting || awareness.isProcessing) return;

  if (awareness.status === "ACTIVE") {
    await awareness.pauseAwareness();
  }

  try {
    setIsDetecting(true);
    await stopSpeech();
    
    // Calls clean single-shot pipeline
    const { description } = await executeSingleShotScan(imageUri, width, height);
    setDescriptionText(description);

    // Announces result via device TTS
    await speak(description, {
      onDone: () => setSpeakingActive(false),
      onStopped: () => setSpeakingActive(false),
    });
  } catch (error) {
    const errorMsg = "Detection failed. Please try again.";
    setDescriptionText(errorMsg);
    await speak(errorMsg);
  } finally {
    setIsDetecting(false);
  }
};
```

---

## 3. Camera Service & Presentation UI (`src/services/camera/`)

### `src/services/camera/cameraService.ts`
- **Why it was created:** Isolates all native interaction with the device's physical camera hardware and image dimensions.
- **What it does:**
  - `captureFrame(camera)`: Imperatively commands `expo-camera` to take a photo and returns `{ uri, width, height }`.
  - `getImageDimensions(uri)`: Uses React Native's `Image.getSize` to determine exact image pixel dimensions asynchronously.
  - `resolveImageDimensions(uri, width, height)`: Validates dimensions or falls back safely to `Image.getSize`.
```typescript
export async function captureFrame(camera: CameraView): Promise<Frame> {
  const photo = await camera.takePictureAsync({
    quality: 0.7,
    skipProcessing: false,
  });
  if (!photo) throw new Error("Camera did not return a photo.");
  return { uri: photo.uri, width: photo.width, height: photo.height };
}
```

---

### `src/services/camera/singleShotDetection.ts`
- **Why it was created:** Adheres to the Single Responsibility Principle by decoupling manual single-shot scan execution from the React UI component.
- **What it does:** Chains together: (1) dimension validation $\rightarrow$ (2) YOLO26 object detection with coordinate remapping $\rightarrow$ (3) spatial geometry classification $\rightarrow$ (4) natural language sentence synthesis.
```typescript
export async function executeSingleShotScan(
  imageUri: string,
  width?: number,
  height?: number
): Promise<SingleShotScanResult> {
  const dimensions = await resolveImageDimensions(imageUri, width, height);
  const detections = await detectObjectsFromImage(imageUri, dimensions.width, dimensions.height);
  const spatialResult = describeDetections(detections, dimensions.width);

  return {
    description: spatialResult.description,
    detections,
    spatialResult,
    dimensions,
  };
}
```

---

### `src/services/camera/CameraView.tsx`
- **Why it was created:** The top-level camera viewport component. Refactored from a 925-line monolith into a 220-line declarative orchestrator.
- **What it does:**
  1. Renders native camera stream (`ExpoCameraView`).
  2. Handles camera permissions via `useCameraPermissions`.
  3. Exposes an imperative `CameraPreviewHandle` (`capture()`, `isReady()`) via `useImperativeHandle`.
  4. Runs initial ONNX health check on startup.
  5. Composes focused child components (`AwarenessStatusBadge`, `OnnxDiagnosticsCard`, `AwarenessSummaryCard`, `SpeechControlCard`, `AwarenessActionControls`).

---

### Camera UI Subcomponents (`src/services/camera/components/`)

1. **`CameraPermissionView.tsx`**: Renders friendly permission request cards if camera permission is missing or denied.
2. **`AwarenessStatusBadge.tsx`**: Top bar pill showing `AWARENESS ACTIVE` (green pulse dot + activity spinner), `PAUSED` (amber), or `IDLE` (slate), along with a compact ONNX diagnostic button.
3. **`OnnxDiagnosticsCard.tsx`**: Collapsible diagnostic overlay displaying ONNX runtime status, latency in milliseconds, inputs/outputs, and a manual "Run Test" trigger.
4. **`AwarenessSummaryCard.tsx`**: Lightweight HUD card showing the last spoken announcement, the list of objects currently in view (e.g. `person (85%), bottle (92%)`), or monitoring interval status.
5. **`SpeechControlCard.tsx`**: Floating speech card displaying generated spatial descriptions with accessible **Stop Voice** and **Replay** controls.
6. **`AwarenessActionControls.tsx`**: Bottom interactive controls containing **Start Awareness**, **Pause**, **Resume**, **Stop Awareness**, and the manual **Detect & Describe** button.

---

## 4. Object Detection & Image Preprocessing (`src/services/objectDetection/`)

### `src/services/objectDetection/cocoClasses.ts`
- **Why it was created:** Separates the 80 static COCO class names and custom model mappings from active inference code.
- **What it does:** Contains the readonly `COCO_CLASSES` array and `getClassName(classId)` helper. Preserves model-specific indices (e.g., class 4: "Fan", class 9: "light").

---

### `src/services/objectDetection/imagePreprocessing.ts`
- **Why it was created:** Centralizes all mathematical, image decoding, letterboxing, and tensor construction operations.
- **What it does:**
  1. `decodeImageBytes(bytes)`: Decodes JPEG into raw RGBA pixels using `jpeg-js`.
  2. `createInputTensor(rgba, sourceWidth, sourceHeight)`:
     - Maintains aspect ratio while scaling into a $640 \times 640$ bounding box.
     - Letterbox pads unscaled areas with standard YOLO gray value ($114 / 255$).
     - Constructs a 4-dimensional NCHW Float32 tensor: `[1, 3, 640, 640]`.
  3. `parseDetections(output, letterbox)`: Iterates up to 300 detected predictions, applies confidence threshold ($0.25$), and maps coordinates back to original image space.
  4. `remapCoordinatesToOriginalDimensions()`: Scales detection boxes back to original camera photo dimensions.
```typescript
// Letterbox padding calculation:
const scale = Math.min(640 / sourceWidth, 640 / sourceHeight);
const scaledWidth = Math.round(sourceWidth * scale);
const scaledHeight = Math.round(sourceHeight * scale);
const padX = Math.floor((640 - scaledWidth) / 2);
const padY = Math.floor((640 - scaledHeight) / 2);
```

---

### `src/services/objectDetection/objectDetectionService.ts`
- **Why it was created:** Coordinates model asset loading and ONNX InferenceSession execution.
- **What it does:**
  1. Loads `yolo26n.onnx` from local application assets via `Asset.fromModule()`.
  2. Lazily initializes and caches `InferenceSession` with 4 CPU threads and memory pattern optimizations.
  3. `detectObjectsFromImage(imageUri, width, height)`:
     - Uses native hardware scaling (`expo-image-manipulator`) to resize high-res camera photos in ~20ms.
     - Decodes compact JPEG in JS in ~20ms.
     - Runs multi-threaded ONNX inference in ~150–250ms.
     - Remaps bounding boxes back to true camera coordinate space.
  4. `testYOLO26()`: Automated regression test executing inference on `assets/test/test1.jpeg`.

---

## 5. Spatial Awareness (`src/services/spatialAwareness/`)

### `src/services/spatialAwareness/config.ts` & `types.ts`
- **Why it was created:** Defines boundaries and interfaces for dividing the camera field of view horizontally.
- **What it does:**
  - Standard 3-column thresholds:
    - `0% to 33%`: **LEFT**
    - `33% to 66%`: **CENTER**
    - `66% to 100%`: **RIGHT**
  - Defines `SpatiallyAwareObject` and `SpatialRegion = "LEFT" | "CENTER" | "RIGHT"`.

---

### `src/services/spatialAwareness/spatialAwarenessService.ts`
- **Why it was created:** Pure geometric spatial classification and spoken natural language sentence construction.
- **What it does:**
  1. `classifyHorizontalPosition(normalizedX)`: Returns `"LEFT"`, `"CENTER"`, or `"RIGHT"`.
  2. `analyzeSpatialDetections(detections, imageWidth)`: Computes the horizontal center ($x + \text{width}/2$), normalizes against image width, and assigns a spatial region.
  3. `generateSpokenDescription(spatialObjects)`: Groups detections by region and class to prevent repeated phrases (e.g. "2 bottles in the center" rather than "bottle in center, bottle in center").
  4. `describeDetections(detections, imageWidth)`: Complete helper returning both structured objects and spoken text (e.g., *"Person on the left. Bottle in the center."*).

---

## 6. Automatic Awareness Subsystem (`src/services/awareness/`)

This subsystem enables visually impaired users to walk through an environment without touching the screen. The app continuously takes photos, tracks objects across frames, and speaks only when something meaningful happens.

### `src/services/awareness/types.ts`
Defines core tracking data structures:
- `TrackedObject`: Stores persistent object ID, class name, bounding box, spatial region, `consecutiveMissingFrames` (hysteresis counter), and timestamp.
- `AwarenessStatus`: `"INACTIVE" | "ACTIVE" | "PAUSED"`.
- `SceneComparison`: Lists `newObjects`, `persistentObjects`, `changedObjects`, and `departedObjects`.

---

### `src/services/awareness/config.ts`
Defines smart thresholds:
- `captureIntervalMs: 1500` (Capture every 1.5 seconds).
- `minAnnouncementIntervalMs: 2500` (Throttles speech to avoid audio overload).
- `iouMatchThreshold: 0.25` (Intersection-over-Union threshold for frame-to-frame matching).
- `maxConsecutiveMissingFrames: 2` (Prevents false "departed" alerts if an object is briefly occluded).

---

### `src/services/awareness/sceneComparison.ts`
- **Why it was created:** Provides robust frame-to-frame object matching and change tracking.
- **What it does:**
  1. `calculateIoU(boxA, boxB)`: Calculates standard Intersection-over-Union between two bounding boxes.
  2. `compareScenes(trackedObjects, currentDetections, imageWidth)`:
     - Matches incoming detections to existing tracked objects using IoU and lateral proximity.
     - Increments `consecutiveMissingFrames` when an object is temporarily occluded.
     - Flags `changedObjects` when an object moves laterally across spatial boundaries (e.g., from `LEFT` to `CENTER`).
     - Detects brand new objects entering the field of view.

---

### `src/services/awareness/announcementEngine.ts`
- **Why it was created:** Prevents chatty, annoying speech by deciding **when** and **what** to speak.
- **What it does:**
  - Speech Guards:
    - If TTS is currently speaking $\rightarrow$ **Silence**.
    - If elapsed time since last speech $< 2500\text{ms}$ and changes are minor $\rightarrow$ **Throttled Silence**.
    - If scene is completely unchanged $\rightarrow$ **Silence**.
  - Announcement Generation:
    - New objects: *"Person on the left. Bottle in the center."*
    - Moved objects: *"Person moved to the center."*
    - Departed objects: Announced only after missing for 2+ consecutive frames.

---

### `src/services/awareness/awarenessController.ts`
- **Why it was created:** Background state machine and recurring timer coordinator.
- **What it does:**
  1. Implements `start()`, `pause()`, `resume()`, and `stop()` lifecycle methods.
  2. Manages recurring async timer: Captures frame $\rightarrow$ Detects objects $\rightarrow$ Compares scene $\rightarrow$ Runs announcement engine $\rightarrow$ Speaks.
  3. Vocalizes lifecycle status changes (*"Awareness mode started."*, *"Awareness paused."*, etc.).
  4. Guarantees 100% timer and memory cleanup when stopped.

---

### `src/services/awareness/useAwarenessMode.ts`
- **Why it was created:** Custom React hook exposing awareness state to UI components with zero memory leaks.
- **What it does:**
  - Instantiates `AwarenessController`.
  - Re-renders React components when state changes (`status`, `latestDetections`, `lastAnnouncement`).
  - Automatically cleans up controller on component unmount.

---

### `src/services/awareness/__tests__/awareness.test.ts`
- **Why it was created:** Complete unit and integration test suite executing 34 automated assertions.
- **What it verifies:**
  - IoU calculations.
  - Multi-cycle frame tracking (appearance, occlusion hysteresis, movement across regions).
  - Speech throttling and overlap prevention.
  - Complete `AwarenessController` lifecycle transitions.

---

## 7. Supporting Services & Utilities

### `src/services/tts/ttsService.ts`
- **Why it was created:** Encapsulates on-device speech synthesis using `expo-speech`.
- **What it does:**
  - `speak(text, options)`: Speaks text with rate, pitch, and completion callbacks.
  - `stopSpeech()`: Immediately silences ongoing speech.
  - `isSpeaking()`: Checks if speech audio is currently playing.

---

### `src/services/onnx/onnxService.ts`
- **Why it was created:** Hardware and native binary sanity check.
- **What it does:**
  - Executes a minimal matrix multiplication model (`mul_1.onnx`) with inputs `[2.0, 3.0]` and weights `[3.0, 4.0]`.
  - Confirms ONNX Runtime native C++ libraries are loaded and measure raw latency (~3–8ms).

---

### `src/utils/grammar.ts`
- **Why it was created:** Clean English linguistic helper.
- **What it does:**
  - Handles irregular plurals (e.g. `person` $\rightarrow$ `people`, `knife` $\rightarrow$ `knives`, `mouse` $\rightarrow$ `mice`).
  - Formats plural suffixes (`buses`, `berries`, `bottles`).
  - Capitalizes sentence initials.

---

### `src/shared/types/`
- **`BoundingBox.ts`**: `{ x: number, y: number, width: number, height: number }`
- **`Detection.ts`**: Unified vision detection contract: `{ classId: number, className: string, confidence: number, boundingBox: BoundingBox }`
- **`Frame.ts`**: `{ uri: string, width: number, height: number }`
- **`Region.ts`**: `"LEFT" | "CENTER" | "RIGHT"`
- **`TtsOptions.ts`**: Speech configuration options (`rate`, `pitch`, callbacks).

---

## 8. Summary Table: Files at a Glance

| File Path | Type | Main Purpose |
| :--- | :--- | :--- |
| `app/index.tsx` | Screen | Main screen UI coordinator for single-shot & awareness modes. |
| `app/_layout.tsx` | Navigation | Root navigation stack configuration. |
| `src/services/camera/CameraView.tsx` | Component | Declarative camera stream view & subcomponent container. |
| `src/services/camera/cameraService.ts` | Service | Imperative camera capture & image dimension discovery. |
| `src/services/camera/singleShotDetection.ts` | Pipeline | End-to-end single-shot scan and description pipeline. |
| `src/services/camera/components/*` | UI | Modular HUD badges, diagnostic cards, and control buttons. |
| `src/services/objectDetection/objectDetectionService.ts` | Service | ONNX model session loading & high-speed inference. |
| `src/services/objectDetection/imagePreprocessing.ts` | Utility | Fast JPEG decode, letterbox tensor creation, and box scaling. |
| `src/services/objectDetection/cocoClasses.ts` | Constant | 80 COCO dataset labels & name resolver. |
| `src/services/spatialAwareness/spatialAwarenessService.ts`| Service | Lateral position classification & sentence synthesis. |
| `src/services/awareness/awarenessController.ts` | Service | Recurring timer loop & state machine for continuous monitoring. |
| `src/services/awareness/sceneComparison.ts` | Service | Frame-to-frame IoU object matching & movement detection. |
| `src/services/awareness/announcementEngine.ts` | Service | Smart speech throttling & natural movement announcements. |
| `src/services/awareness/useAwarenessMode.ts` | Hook | React hook binding awareness state to UI. |
| `src/services/tts/ttsService.ts` | Service | Text-to-speech audio playback via `expo-speech`. |
| `src/services/onnx/onnxService.ts` | Diagnostics| ONNX Runtime verification and latency benchmark. |
| `src/utils/grammar.ts` | Utility | Natural English plurals and capitalization. |
| `src/shared/types/*` | Types | Immutable, shared domain interfaces for the entire project. |
