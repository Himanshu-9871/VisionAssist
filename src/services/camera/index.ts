export {
  captureFrame,
  getImageDimensions,
  resolveImageDimensions,
} from "./cameraService";

export {
  executeSingleShotScan,
  type SingleShotScanResult,
} from "./singleShotDetection";

export {
  default as CameraPreview,
  type CameraPreviewProps,
  type CameraPreviewHandle,
} from "./CameraView";