//In this project frame is a data structure that represents a single frame of a video or an image. It contains information about the frame's dimensions, pixel data, and other metadata. The Frame type is used to define the structure of the data that is passed between different components of the VisionAssist application, such as the object detection module and the user interface. By using a consistent data structure for frames, 
//this could be processed by other module in the application

export interface Frame {
    uri: string; // The URI of the frame, which can be a local file path or a remote URL.
    width: number; // The width of the frame in pixels.
    height: number; // The height of the frame in pixels.
}

//Later our Camera module will be responsible for creating this object 

//initially, we will use a static image as a frame for testing purposes.

