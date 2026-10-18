import type { TtsOptions } from "./types";

/**
 * Text-to-Speech service.
 *
 * Currently operating in safe visual/console mode to run seamlessly with the
 * existing Android build without requiring native APK recompilation.
 * When the native APK is recompiled with expo-speech, full audio playback can be enabled.
 */

let speechActive = false;

export async function stopSpeech(): Promise<void> {
  speechActive = false;
}

export async function isSpeaking(): Promise<boolean> {
  return speechActive;
}

export async function speak(
  message: string | null | undefined,
  options?: TtsOptions
): Promise<void> {
  if (!message || typeof message !== "string" || message.trim() === "") {
    return;
  }

  const textToSpeak = message.trim();
  console.log("[TTS Announcement]:", textToSpeak);

  speechActive = true;
  options?.onDone?.();
  setTimeout(() => {
    speechActive = false;
  }, 1000);
}
