import { Region } from "./Region";

export interface PositionedObject {
    label: string; // The label of the detected object, which is a string that describes the object (e.g., "person", "car", "dog").
    confidence: number; //which is a number between 0 and 1
    region: Region; // The region of the detected object, which is a string that describes the position of the object in the image (e.g., "Left", "Center", "Right").
}
