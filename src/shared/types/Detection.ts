import { BoundingBox } from "./BoundingBox";

/**
 * Authoritative domain representation of an object detected by the vision model.
 */
export interface Detection {
  classId: number;
  className: string;
  confidence: number;
  boundingBox: BoundingBox;
}