//This module will work as a response to the other modules 
// All the other modules will use this module to send their response to the user interface module.

export type ResponsePriority =
  | "LOW"
  | "NORMAL"
  | "HIGH"
  | "CRITICAL";

export interface Response {
  message: string;
  priority: ResponsePriority;
}  


//this will generate confidence values and response metadata