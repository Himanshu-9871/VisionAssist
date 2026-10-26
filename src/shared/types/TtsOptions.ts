export interface TtsOptions {
  /**
   * Language code (e.g., 'en-US'). Defaults to 'en-US'.
   */
  language?: string;

  /**
   * Pitch of the voice. 1.0 is default pitch.
   */
  pitch?: number;

  /**
   * Speech rate / speed. 1.0 is normal rate.
   */
  rate?: number;

  /**
   * Volume between 0.0 and 1.0. Defaults to 1.0.
   */
  volume?: number;

  /**
   * Callback fired when speech completes.
   */
  onDone?: () => void;

  /**
   * Callback fired when speech is interrupted or stopped.
   */
  onStopped?: () => void;

  /**
   * Callback fired on error.
   */
  onError?: (error: Error) => void;
}
