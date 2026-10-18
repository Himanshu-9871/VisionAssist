# VisionAssist - On-Device Object Detection Engineering Report

**Project:** VisionAssist (Mobile Visual Assistance System)  
**Platform:** React Native (Expo SDK 54 / React Native 0.81.5)  
**Runtime:** ONNX Runtime React Native 1.24.3  
**Target Hardware:** Android 15 (ARM64-v8a, tested on Vivo V2315 / API 35)  
**Primary Model:** YOLO26n (ONNX format)  
**Date:** September 2026  

---

## 1. Executive Summary

The goal of this phase was to bring on-device deep learning inference to the VisionAssist mobile application without relying on external cloud APIs or backend servers. The implementation required integrating ONNX Runtime into Expo SDK 54, resolving native Android build issues, verifying low-level inference on a physical device, and deploying an end-to-end YOLO26n object detection pipeline with correct image preprocessing.

All milestones were completed:
1. Native C++ ONNX Runtime binaries compiled and linked successfully into an Expo SDK 54 bare/prebuild development build.
2. Baseline tensor inference verified on physical hardware with a 20 ms execution time.
3. Preprocessing upgraded from naive direct resizing to letterboxed scaling with inverse coordinate mapping, resolving low-confidence detection errors on non-square camera assets.

---

## 2. Native Runtime Integration & Patching

### 2.1 The Problem Space
Expo SDK 54 ships with React Native 0.81.5 and Gradle 8+. The official `onnxruntime-react-native` package (v1.24.3) was built against older React Native toolchains and encountered three critical blockers during native compilation and runtime initialization.

### 2.2 Issues Identified and Fixed

#### A. Autolinking Exclusion (`unimodule.json`)
- **Symptom:** At runtime, calling `InferenceSession.create()` threw `TypeError: Cannot read property 'install' of null`.
- **Root Cause:** `onnxruntime-react-native` still shipped with a legacy `unimodule.json` file in its root directory. Expo CLI's `expo-modules-autolinking` detected this legacy metadata and classified the library as an obsolete Unimodule rather than a modern React Native module. As a result, it omitted `OnnxruntimePackage` from `PackageList.java`.
- **Fix:** Removed `unimodule.json`. React Native autolinking immediately picked up the package and registered `new OnnxruntimePackage()` in the Android build.

#### B. Gradle 8+ Deprecation (`VersionNumber`)
- **Symptom:** Gradle sync failed with `Could not get unknown property 'VersionNumber' for project ':onnxruntime-react-native'`.
- **Root Cause:** Gradle 8 removed `org.gradle.util.VersionNumber`. The library's `android/build.gradle` attempted to use `VersionNumber.parse(REACT_NATIVE_VERSION)` to determine if RN was below 0.71.
- **Fix:** Patched `android/build.gradle` to parse `REACT_NATIVE_MINOR_VERSION` directly without the obsolete Gradle utility class.

#### C. Android 15 (16 KB Page Size) Compatibility
- **Symptom:** Native libraries built with 4 KB memory page alignments trigger warnings or crashes on Android 15 (API 35+) devices that mandate 16 KB page-size compatibility.
- **Fix:** Added linker flags `"-Wl,-z,max-page-size=16384"` and `"-Wl,-z,common-page-size=16384"` to `android/CMakeLists.txt`.

### 2.3 Long-Term Reproducibility
All changes to `node_modules/onnxruntime-react-native` were captured in a reproducible patch file:
- Location: `patches/onnxruntime-react-native+1.24.3.patch`
- Enforcement: Added `"postinstall": "patch-package"` in `package.json` to ensure clean installs on any CI/CD or developer machine preserve these native fixes automatically.

---

## 3. Bundler & Asset Pipeline Setup

To bundle `.onnx` and `.ort` model files alongside application code, Metro was configured in `metro.config.js`:

```javascript
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push("onnx", "ort");

module.exports = config;
```

Model assets are resolved via `expo-asset` (`Asset.fromModule(...)`), which ensures model weights are written to local device storage before passing file URIs into ONNX Runtime's native C++ initialization layer.

---

## 4. Hardware Verification (Phase 1)

Before introducing the full YOLO architecture, the native runtime was verified using a minimal Microsoft arithmetic model (`mul_1.onnx`, 130 bytes):
- **Operation:** Multiplies input matrix $X$ ($3 \times 2$) by weight matrix $W = [1, 2, 3, 4, 5, 6]$.
- **Test Input:** `[1, 2, 3, 4, 5, 6]`
- **Expected Output:** `[1, 4, 9, 16, 25, 36]`
- **Target Device:** Vivo V2315 (Android 15) connected via ADB over USB.

### Test Result
- Execution Status: `VERIFIED (OK)`
- Device Latency: **20 ms**
- Measured Output: Exactly matched expected values `[1, 4, 9, 16, 25, 36]`.

```json
[ONNX Verification] {
  "success": true,
  "latencyMs": 20,
  "input": [1, 2, 3, 4, 5, 6],
  "output": [1, 4, 9, 16, 25, 36],
  "expected": [1, 4, 9, 16, 25, 36]
}
```

This established that ONNX Runtime's C++ inference engine, JSI bindings, and tensor memory allocators operated stably on the device.

---

## 5. YOLO26n Integration & Preprocessing Overhaul

### 5.1 Model Specifications
- **Model File:** `assets/models/yolo26n.onnx`
- **Input Tensor:** `images`, Float32, shape `[1, 3, 640, 640]` (NCHW format, RGB normalized to `[0.0, 1.0]`).
- **Output Tensor:** `output0`, Float32, shape `[1, 300, 6]`.
  - Format per candidate: `[x1, y1, x2, y2, confidence, classId]`
  - Max candidates: 300 pre-filtered boxes.

### 5.2 The Image Distortion Problem
During initial end-to-end testing with a portrait water bottle image ($900 \times 1600$):
- The original preprocessing used a direct resize (`resizeRGBA`) that forced the $900 \times 1600$ image directly into $640 \times 640$.
- This caused asymmetric spatial distortion: the image was stretched horizontally by $1.78\times$ and compressed vertically by $2.5\times$.
- **Consequence:** The neural network's convolutional kernels failed to recognize the distorted object geometry. The model only produced weak, random activations (`clock: 0.144`, `potted plant: 0.101`, `bed: 0.079`), while the true object (`bottle`, COCO class 39) was suppressed below detection thresholds.

### 5.3 The Letterbox Solution
Direct resizing was replaced with standard YOLO letterboxing:

1. **Aspect Ratio Preservation:**
   $$\text{scale} = \min\left(\frac{640}{\text{width}}, \frac{640}{\text{height}}\right)$$
   For a $900 \times 1600$ source image, $\text{scale} = \min(0.711, 0.400) = 0.400$.  
   The image scales uniformly to $360 \times 640$, completely preserving object proportions.

2. **Centering & Neutral Padding:**
   $$\text{padX} = \left\lfloor\frac{640 - 360}{2}\right\rfloor = 140, \quad \text{padY} = \left\lfloor\frac{640 - 640}{2}\right\rfloor = 0$$
   Unused canvas areas are filled with standard YOLO neutral gray (`114 / 255` $\approx 0.447$).

3. **Optimized Tensor Generation:**
   The pixel sampling and tensor construction were merged into a single pass directly into a `Float32Array(3 * 640 * 640)`, eliminating intermediate bitmap allocations and memory thrashing.

4. **Inverse Coordinate Remapping (Un-Letterboxing):**
   Because the model predicts bounding boxes within the $640 \times 640$ letterbox frame, raw coordinates must be converted back to original image space before being exposed to the UI or assistive engine:
   $$\text{origX} = \frac{x - \text{padX}}{\text{scale}}, \quad \text{origY} = \frac{y - \text{padY}}{\text{scale}}$$
   Coordinates are then clamped to $[0, \text{sourceWidth}]$ and $[0, \text{sourceHeight}]$.

### 5.4 Class Mapping & Threshold Calibration
- Verified and fixed the standard 80-class COCO array in `objectDetectionService.ts` so index 0 represents `person` and index 39 represents `bottle`.
- Set `CONFIDENCE_THRESHOLD = 0.25`, filtering background noise while capturing valid detections.

---

## 6. Architecture & Code Structure

The project structure keeps domain logic modular and decoupled:

```
VisionAssist/
├── assets/
│   ├── models/
│   │   ├── mul_1.onnx               # Baseline verification model
│   │   └── yolo26n.onnx             # YOLO26n object detection model
│   └── test/
│       ├── bottle.jpeg              # Reference test image
│       └── test2.jpeg               # Validation image
├── patches/
│   └── onnxruntime-react-native+1.24.3.patch  # Native Gradle & autolink fixes
├── src/
│   └── services/
│       ├── camera/
│       │   ├── cameraService.ts     # Frame capture abstractions
│       │   └── CameraView.tsx       # Live camera view & diagnostic HUD
│       ├── onnx/
│       │   ├── onnxService.ts       # Low-level session & runtime verifier
│       │   └── index.ts             # Barrel export
│       └── objectDetection/
│           ├── objectDetectionService.ts # Preprocessing, inference, box parsing
│           └── index.ts             # Barrel export
├── metro.config.js                  # ONNX asset resolution rules
└── package.json                     # Postinstall patch-package configuration
```

---

## 7. Current Project Status & Immediate Next Steps

| Component | Status | Notes |
|---|---|---|
| ONNX Runtime C++ Binaries | Operational | Running on Android 15 physical device |
| Baseline Tensor Inference | Verified | 20 ms execution time |
| YOLO26n Model Loading | Operational | Cached session via `expo-asset` |
| Image Preprocessing | Operational | Aspect-ratio preserving letterbox + un-letterbox mapping |
| Bounding Box Parser | Operational | `[1, 300, 6]` format mapped back to source image |
| Live Camera Stream Pipeline | Pending | Next milestone: wire real-time camera frames into detector |
| Accessibility Feedback | Pending | Next milestone: audio/haptic cues based on detection bounding boxes |

### Recommended Next Steps:
1. **Live Frame Feeding:** Connect `CameraView` frame-capture buffer or Skia/VisionCamera frame processors directly into `createInputTensor`.
2. **Inference Throttling:** Run object detection on an asynchronous worker loop (e.g., 5–10 FPS) so the camera UI thread maintains a steady 60 FPS without dropping frames.
3. **Spatial Guidance Engine:** Translate normalized bounding box coordinates into directional audio guidance (e.g., "Bottle, center ahead", "Chair, 2 meters left").
