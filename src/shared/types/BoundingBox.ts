export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

//any object that has x,y,width,height properties can be used as a bounding box
//this is useful for defining the area of an object in a 2D space, such as an image or a video frame.