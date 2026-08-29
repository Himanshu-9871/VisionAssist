export type IntentMode =
  | "EXPLORE"
  | "FIND_OBJECT"
  | "READ_TEXT"
  | "STOP"
  | "UNKNOWN";

export interface Intent {
  mode: IntentMode;
  target?: string;
}