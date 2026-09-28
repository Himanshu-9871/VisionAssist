import { Asset } from "expo-asset";
import { InferenceSession, Tensor } from "onnxruntime-react-native";

// 130-byte Microsoft ONNX Runtime test model (mul_1.onnx)
// Operation: Y = X * W, where W is fixed weights [1.0, 2.0, 3.0, 4.0, 5.0, 6.0] with shape [3, 2]
const EMBEDDED_MODEL_BASE64 =
  "CAMSBmNoZW50YTpwChUKAVgKAVcSAVkaBW11bF8xIgNNdWwSCG11bCB0ZXN0KiMIAwgCEAEiGAAAgD8AAABAAABAQAAAgEAAAKBAAADAQEIBV1oTCgFYEg4KDAgBEggKAggDCgIIAmITCgFZEg4KDAgBEggKAggDCgIIAkIECgAQBw==";

export interface OnnxVerificationResult {
  success: boolean;
  input: number[];
  output: number[];
  expected: number[];
  latencyMs: number;
  error?: string;
}

let cachedSession: InferenceSession | null = null;

/**
 * Resolves the path or buffer for mul_1.onnx.
 * First tries loading from bundled assets via expo-asset.
 * Falls back to the embedded in-memory byte buffer if asset extraction is unavailable.
 */
export async function getModelSource(): Promise<string | Uint8Array> {
  try {
    const asset = Asset.fromModule(require("../../../assets/models/mul_1.onnx"));
    await asset.downloadAsync();

    if (asset.localUri) {
      return asset.localUri;
    }
  } catch (error) {
    console.warn("Asset load failed, falling back to embedded byte array:", error);
  }

  // Convert embedded base64 to Uint8Array as safe fallback
  const binaryString = atob(EMBEDDED_MODEL_BASE64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Initializes and caches an InferenceSession for the test model.
 */
export async function initOnnxModel(): Promise<InferenceSession> {
  if (cachedSession) {
    return cachedSession;
  }

  const modelSource = await getModelSource();
  const session =
    typeof modelSource === "string"
      ? await InferenceSession.create(modelSource)
      : await InferenceSession.create(modelSource);

  cachedSession = session;
  return session;
}

/**
 * Runs inference with the provided 3x2 float array.
 */
export async function runSimpleInference(
  session: InferenceSession,
  inputData: number[] = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0]
): Promise<{ output: number[]; latencyMs: number }> {
  if (inputData.length !== 6) {
    throw new Error(`Expected 6 numbers for [3, 2] tensor, got ${inputData.length}`);
  }

  const float32Data = new Float32Array(inputData);
  const inputTensor = new Tensor("float32", float32Data, [3, 2]);

  const startTime = Date.now();
  const feeds = { X: inputTensor };
  const results = await session.run(feeds);
  const latencyMs = Date.now() - startTime;

  const outputTensor = results.Y;
  if (!outputTensor) {
    throw new Error("Model did not produce expected output 'Y'");
  }

  const outputArray = Array.from(outputTensor.data as Float32Array);
  return { output: outputArray, latencyMs };
}

/**
 * Complete end-to-end verification of ONNX Runtime on device.
 * Multiplies input [1, 2, 3, 4, 5, 6] by model weights [1, 2, 3, 4, 5, 6].
 * Expects element-wise output [1, 4, 9, 16, 25, 36].
 */
export async function verifyOnnxRuntime(): Promise<OnnxVerificationResult> {
  const input = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0];
  const expected = [1.0, 4.0, 9.0, 16.0, 25.0, 36.0];

  try {
    const session = await initOnnxModel();
    const { output, latencyMs } = await runSimpleInference(session, input);

    // Check outputs within epsilon
    const epsilon = 1e-4;
    const isMatch =
      output.length === expected.length &&
      output.every((val, idx) => Math.abs(val - expected[idx]) < epsilon);

    if (!isMatch) {
      return {
        success: false,
        input,
        output,
        expected,
        latencyMs,
        error: `Output mismatch: got [${output.join(", ")}], expected [${expected.join(", ")}]`,
      };
    }

    return {
      success: true,
      input,
      output,
      expected,
      latencyMs,
    };
  } catch (error: any) {
    console.error("ONNX verification failed:", error);
    return {
      success: false,
      input,
      output: [],
      expected,
      latencyMs: 0,
      error: error?.message || String(error),
    };
  }
}
