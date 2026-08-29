//For every detected object, we need to know its position and size in the image. This is where the bounding box comes in.

//THis interface should answer three things 
// "1. What object was detected?
// 2. How confident is the model?
// 3. Where is the object in the image?"
import { BoundingBox } from "./BoundingBox";

export interface Detection {
  label: string;
  confidence: number;
  boundingBox: BoundingBox;
}