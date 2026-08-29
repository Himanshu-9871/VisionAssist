import { Frame } from "./types/Frame";
import { BoundingBox } from "./types/BoundingBox";
import { Detection } from "./types/Detection";
import { Region } from "./types/Region";
import { PositionedObject } from "./types/PositionedObject";
import { Intent } from "./types/Intent";
import { Response } from "./types/Response";

import {
  MIN_DETECTION_CONFIDENCE,
} from "./constants/detection";

import {
  LEFT_REGION_END,
  CENTER_REGION_END,
} from "./constants/regions";

// 1. Frame
const frame: Frame = {
  uri: "test-image.jpg",
  width: 1080,
  height: 1920,
};

// 2. Bounding Box
const boundingBox: BoundingBox = {
  x: 700,
  y: 500,
  width: 150,
  height: 300,
};

// 3. Detection
const detection: Detection = {
  label: "bottle",
  confidence: 0.92,
    boundingBox: boundingBox,
};

// 4. Region
const region: Region = "RIGHT";

// 5. Positioned Object
const positionedObject: PositionedObject = {
  label: detection.label,
  confidence: detection.confidence,
  region,
};

// 6. Intent
const intent: Intent = {
  mode: "FIND_OBJECT",
  target: "bottle",
};

// 7. Response
const response: Response = {
  message: "Bottle is on your right",
  priority: "NORMAL",
};

console.log({
  frame,
  detection,
  positionedObject,
  intent,
  response,
  MIN_DETECTION_CONFIDENCE,
  LEFT_REGION_END,
  CENTER_REGION_END,
});