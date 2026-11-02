import type { TtsOptions } from "../../shared/types/TtsOptions";

/**
 * Text-to-Speech service using expo-speech for high-clarity on-device vocalization.
 */

let speechModule: typeof import("expo-speech") | null = null;
let moduleCheckDone = false;

function getSpeech(): typeof import("expo-speech") | null {
  if (moduleCheckDone) return speechModule;
  try {
    // Lazily load expo-speech to prevent fatal crash if native binary lacks module
    speechModule = require("expo-speech");
  } catch (error) {
    console.warn(
      "[TTS] Native module ExpoSpeech is not available in the current APK binary:",
      error
    );
    speechModule = null;
  }
  moduleCheckDone = true;
  return speechModule;
}

let speechActive = false;

/**
 * Stops ongoing voice speech.
 */
export async function stopSpeech(): Promise<void> {
  const Speech = getSpeech();
  speechActive = false;
  if (!Speech) return;

  try {
    await Speech.stop();
  } catch (error) {
    console.warn("[TTS] Error stopping speech:", error);
  }
}

/**
 * Checks if speech is actively speaking on the device.
 */
export async function isSpeaking(): Promise<boolean> {
  const Speech = getSpeech();
  if (!Speech) return speechActive;

  try {
    const nativeSpeaking = await Speech.isSpeakingAsync();
    return nativeSpeaking || speechActive;
  } catch {
    return speechActive;
  }
}

/**
 * Speaks an announcement or description using the device's native speech engine.
 *
 * @param message The text description to speak aloud.
 * @param options Configuration for language, rate, pitch, volume, and callbacks.
 */
export async function speak(
  message: string | null | undefined,
  options?: TtsOptions
): Promise<void> {
  if (!message || typeof message !== "string" || message.trim() === "") {
    return;
  }

  const textToSpeak = message.trim();
  console.log("[TTS Announcement]:", textToSpeak);

  const Speech = getSpeech();
  if (!Speech) {
    console.warn(
      "[TTS] Cannot find native module 'ExpoSpeech'. Please ensure the updated APK with expo-speech is installed."
    );
    options?.onError?.(
      new Error(
        "Cannot find native module 'ExpoSpeech'. Please install the updated APK."
      )
    );
    return;
  }

  try {
    // Stop any existing speech before starting a new announcement
    try {
      await Speech.stop();
    } catch {
      // Ignore stop failure if nothing was active
    }

    speechActive = true;

    Speech.speak(textToSpeak, {
      language: options?.language ?? "en-US",
      pitch: options?.pitch ?? 1.0,
      rate: options?.rate ?? 0.95,
      volume: options?.volume ?? 1.0,
      onStart: () => {
        speechActive = true;
      },
      onDone: () => {
        speechActive = false;
        options?.onDone?.();
      },
      onStopped: () => {
        speechActive = false;
        options?.onStopped?.();
      },
      onError: (error: Error) => {
        console.error("[TTS] Speech playback error:", error);
        speechActive = false;
        options?.onError?.(error);
      },
    });
  } catch (error) {
    console.error("[TTS] Failed to execute Speech.speak:", error);
    speechActive = false;
    options?.onError?.(
      error instanceof Error ? error : new Error(String(error))
    );
  }
}


