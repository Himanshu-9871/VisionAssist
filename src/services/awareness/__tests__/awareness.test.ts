import { calculateIoU, compareScenes } from "../sceneComparison";
import { decideAnnouncement } from "../announcementEngine";
import { AwarenessController } from "../awarenessController";
import { DEFAULT_AWARENESS_CONFIG, MIN_CAPTURE_INTERVAL_MS } from "../config";
import type { Detection } from "../../objectDetection";
import type { Frame } from "../../../shared/types/Frame";

/**
 * Verification test suite for Automatic Awareness Mode.
 */
async function runTests() {
  console.log("=================================================");
  console.log("--- Starting Awareness Mode Verification Tests ---");
  console.log("=================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      failed++;
    }
  }

  const config = { ...DEFAULT_AWARENESS_CONFIG };
  const imageWidth = 640;
  const t0 = 100000;

  // -----------------------------------------------------------------
  // Test 1: calculateIoU
  // -----------------------------------------------------------------
  const box1 = { x: 100, y: 100, width: 100, height: 100 };
  const box2 = { x: 100, y: 100, width: 100, height: 100 };
  assert(calculateIoU(box1, box2) === 1.0, "IoU identical boxes is 1.0");

  const box3 = { x: 300, y: 300, width: 100, height: 100 };
  assert(calculateIoU(box1, box3) === 0.0, "IoU non-overlapping boxes is 0.0");

  const box4 = { x: 150, y: 100, width: 100, height: 100 };
  const iou50 = calculateIoU(box1, box4);
  // intersection: 50x100 = 5000. union: 10000 + 10000 - 5000 = 15000. iou = 5000/15000 = 0.3333...
  assert(Math.abs(iou50 - 1 / 3) < 0.01, "IoU 50% horizontal overlap is ~0.33");

  // -----------------------------------------------------------------
  // Test 2: Initial detection -> Marked as new objects
  // -----------------------------------------------------------------
  const detectionsCycle1: Detection[] = [
    {
      classId: 0,
      className: "person",
      confidence: 0.9,
      boundingBox: { x: 50, y: 100, width: 80, height: 200 }, // center ~90 (90/640=0.14 -> LEFT)
    },
    {
      classId: 39,
      className: "bottle",
      confidence: 0.85,
      boundingBox: { x: 300, y: 250, width: 40, height: 100 }, // center ~320 (320/640=0.5 -> CENTER)
    },
  ];

  const comp1 = compareScenes(detectionsCycle1, imageWidth, [], config, t0);
  assert(comp1.newObjects.length === 2, "Cycle 1: 2 new objects identified");
  assert(comp1.persistentObjects.length === 0, "Cycle 1: 0 persistent objects");
  assert(comp1.changedObjects.length === 0, "Cycle 1: 0 changed objects");
  assert(comp1.allTrackedObjects.length === 2, "Cycle 1: 2 objects actively tracked");

  // Decision 1: Should speak both new objects
  const dec1 = decideAnnouncement(comp1, config, 0, t0, false);
  assert(dec1.shouldSpeak === true, "Cycle 1: Engine decides to speak new objects");
  assert(
    dec1.spokenText !== null &&
      dec1.spokenText.toLowerCase().includes("person") &&
      dec1.spokenText.toLowerCase().includes("bottle"),
    `Cycle 1: Spoken text mentions person and bottle: "${dec1.spokenText}"`
  );

  // -----------------------------------------------------------------
  // Test 3: Cycle 2 with identical detections -> Persistent objects, SILENCE!
  // -----------------------------------------------------------------
  const t1 = t0 + 1500;
  const detectionsCycle2: Detection[] = [
    {
      classId: 0,
      className: "person",
      confidence: 0.88,
      boundingBox: { x: 52, y: 102, width: 80, height: 198 },
    },
    {
      classId: 39,
      className: "bottle",
      confidence: 0.86,
      boundingBox: { x: 301, y: 252, width: 40, height: 98 },
    },
  ];

  const comp2 = compareScenes(
    detectionsCycle2,
    imageWidth,
    comp1.allTrackedObjects,
    config,
    t1
  );
  assert(comp2.newObjects.length === 0, "Cycle 2: 0 new objects");
  assert(comp2.persistentObjects.length === 2, "Cycle 2: Both objects recognized as persistent");
  assert(comp2.changedObjects.length === 0, "Cycle 2: 0 changed objects");

  // Decision 2: MUST REMAIN SILENT for persistent unchanged objects
  const dec2 = decideAnnouncement(comp2, config, t0, t1, false);
  assert(
    dec2.shouldSpeak === false,
    `Cycle 2: Engine remains silent for persistent objects (spokenText=${dec2.spokenText}, reason="${dec2.reason}")`
  );

  // -----------------------------------------------------------------
  // Test 4: Cycle 3 with temporary detection drop (person missed by detector)
  // -----------------------------------------------------------------
  const t2 = t1 + 1500;
  const detectionsCycle3: Detection[] = [
    // person is missing due to detector flicker
    {
      classId: 39,
      className: "bottle",
      confidence: 0.87,
      boundingBox: { x: 300, y: 250, width: 40, height: 100 },
    },
  ];

  const comp3 = compareScenes(
    detectionsCycle3,
    imageWidth,
    comp2.allTrackedObjects,
    config,
    t2
  );
  assert(
    comp3.departedObjects.length === 0,
    "Cycle 3: Person NOT treated as departed after single missing detection"
  );
  assert(
    comp3.allTrackedObjects.length === 2,
    "Cycle 3: Person retained in allTrackedObjects with consecutiveMissingFrames=1"
  );
  const trackedPerson = comp3.allTrackedObjects.find((o) => o.className === "person");
  assert(
    trackedPerson !== undefined && trackedPerson.consecutiveMissingFrames === 1,
    "Cycle 3: Person consecutiveMissingFrames is incremented to 1"
  );

  // -----------------------------------------------------------------
  // Test 5: Cycle 4 with person returning -> re-matched, NOT announced as new
  // -----------------------------------------------------------------
  const t3 = t2 + 1500;
  const detectionsCycle4: Detection[] = [
    {
      classId: 0,
      className: "person",
      confidence: 0.91,
      boundingBox: { x: 50, y: 100, width: 80, height: 200 },
    },
    {
      classId: 39,
      className: "bottle",
      confidence: 0.85,
      boundingBox: { x: 300, y: 250, width: 40, height: 100 },
    },
  ];

  const comp4 = compareScenes(
    detectionsCycle4,
    imageWidth,
    comp3.allTrackedObjects,
    config,
    t3
  );
  assert(
    comp4.newObjects.length === 0,
    "Cycle 4: Person returning is matched to tracked object, NOT announced as new object"
  );
  assert(
    comp4.persistentObjects.length === 2,
    "Cycle 4: Both objects persistent, consecutiveMissingFrames reset to 0"
  );

  const dec4 = decideAnnouncement(comp4, config, t0, t3, false);
  assert(
    dec4.shouldSpeak === false,
    "Cycle 4: Still silent, preventing spurious re-announcements"
  );

  // -----------------------------------------------------------------
  // Test 6: Cycle 5 with object moving across regions
  // -----------------------------------------------------------------
  const t4 = t3 + 3000;
  const detectionsCycle5: Detection[] = [
    {
      classId: 0,
      // Person shifted from LEFT (center ~90) to CENTER (center ~320)
      className: "person",
      confidence: 0.92,
      boundingBox: { x: 280, y: 100, width: 80, height: 200 },
    },
    {
      classId: 39,
      className: "bottle",
      confidence: 0.85,
      boundingBox: { x: 300, y: 250, width: 40, height: 100 },
    },
  ];

  const comp5 = compareScenes(
    detectionsCycle5,
    imageWidth,
    comp4.allTrackedObjects,
    config,
    t4
  );
  assert(comp5.changedObjects.length === 1, "Cycle 5: Person flagged as changed object");
  assert(
    comp5.changedObjects[0].region === "CENTER",
    "Cycle 5: Person region updated to CENTER"
  );

  const dec5 = decideAnnouncement(comp5, config, t0, t4, false);
  assert(dec5.shouldSpeak === true, "Cycle 5: Movement announcement triggered");
  assert(
    dec5.spokenText !== null &&
      dec5.spokenText.toLowerCase().includes("moved to the center"),
    `Cycle 5: Spoken text announced movement: "${dec5.spokenText}"`
  );

  // -----------------------------------------------------------------
  // Test 7: Guard against overlapping speech when TTS is active
  // -----------------------------------------------------------------
  const decSpeaking = decideAnnouncement(comp1, config, 0, t4, true);
  assert(
    decSpeaking.shouldSpeak === false,
    "Speech guard: Does not speak when TTS is currently speaking"
  );

  // -----------------------------------------------------------------
  // Test 8: Controller lifecycle test (Start, Pause, Resume, Stop)
  // -----------------------------------------------------------------
  console.log("\n--- Testing AwarenessController Lifecycle ---");

  let spokeCount = 0;
  let lastSpoken = "";

  const mockDeps = {
    captureFrame: async (): Promise<Frame | null> => {
      return {
        uri: "file://mock.jpg",
        width: 640,
        height: 640,
      };
    },
    detectObjects: async (): Promise<Detection[]> => {
      return [
        {
          classId: 0,
          className: "person",
          confidence: 0.9,
          boundingBox: { x: 50, y: 100, width: 80, height: 200 },
        },
      ];
    },
    speakText: async (msg: string) => {
      spokeCount++;
      lastSpoken = msg;
    },
    stopSpeechFn: async () => {},
    isSpeakingFn: async () => false,
  };

  const controller = new AwarenessController(mockDeps, {
    captureIntervalMs: 50,
    speakStatusTransitions: true,
  });

  assert(controller.getStatus() === "INACTIVE", "Controller initial status is INACTIVE");

  // Start controller
  await controller.start();
  assert(controller.getStatus() === "ACTIVE", "Controller status becomes ACTIVE on start");
  assert(
    lastSpoken === "Awareness mode started.",
    "Controller vocalizes 'Awareness mode started.'"
  );

  // Pause controller
  await controller.pause();
  assert(controller.getStatus() === "PAUSED", "Controller status becomes PAUSED on pause");
  assert(
    lastSpoken === "Awareness paused.",
    "Controller vocalizes 'Awareness paused.'"
  );

  // Resume controller
  await controller.resume();
  assert(controller.getStatus() === "ACTIVE", "Controller status becomes ACTIVE on resume");
  assert(
    lastSpoken === "Awareness resumed.",
    "Controller vocalizes 'Awareness resumed.'"
  );

  // Stop controller
  await controller.stop();
  assert(controller.getStatus() === "INACTIVE", "Controller status becomes INACTIVE on stop");
  assert(
    lastSpoken === "Awareness mode stopped.",
    "Controller vocalizes 'Awareness mode stopped.'"
  );
  assert(spokeCount === 4, `Controller spoke 4 lifecycle transitions (spokeCount=${spokeCount})`);

  // Teardown
  controller.destroy();

  // -----------------------------------------------------------------
  // Test 9: Encapsulation & Getter Immutability
  // -----------------------------------------------------------------
  console.log("\n--- Testing Encapsulation & Immutability ---");
  const encapController = new AwarenessController(mockDeps);
  const configCopy = encapController.getConfig();
  configCopy.captureIntervalMs = 99999;
  assert(
    encapController.getConfig().captureIntervalMs !== 99999,
    "Mutating getConfig() return object does not mutate internal config"
  );
  encapController.destroy();

  // -----------------------------------------------------------------
  // Test 10: Interval Clamping (Constants)
  // -----------------------------------------------------------------
  console.log("\n--- Testing Constants & Interval Clamping ---");
  const clampController = new AwarenessController(mockDeps);
  clampController.setCaptureInterval(100);
  assert(
    clampController.getConfig().captureIntervalMs === MIN_CAPTURE_INTERVAL_MS,
    `Interval clamped to MIN_CAPTURE_INTERVAL_MS (${MIN_CAPTURE_INTERVAL_MS}ms) when set below minimum`
  );
  clampController.destroy();

  // -----------------------------------------------------------------
  // Test 11: Async Safety - In-flight Cancellation on Stop
  // -----------------------------------------------------------------
  console.log("\n--- Testing Async Cancellation on Stop ---");
  let delayedResolve: (f: Frame | null) => void;
  const delayedCapture = new Promise<Frame | null>((resolve) => {
    delayedResolve = resolve;
  });

  let spokenAfterStop = false;
  const cancelController = new AwarenessController(
    {
      captureFrame: () => delayedCapture,
      detectObjects: async () => [
        {
          classId: 0,
          className: "person",
          confidence: 0.9,
          boundingBox: { x: 50, y: 100, width: 80, height: 200 },
        },
      ],
      speakText: async () => {
        spokenAfterStop = true;
      },
      stopSpeech: async () => {},
      isSpeaking: async () => false,
    },
    { speakStatusTransitions: false }
  );

  await cancelController.start();
  await cancelController.stop();
  assert(cancelController.getStatus() === "INACTIVE", "Controller is INACTIVE after stop");

  delayedResolve!({ uri: "file://delayed.jpg", width: 640, height: 640 });
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert(spokenAfterStop === false, "In-flight capture was safely aborted after stop");
  assert(cancelController.getTrackedObjects().length === 0, "No tracked objects committed after stop");
  cancelController.destroy();

  console.log("\n=================================================");
  console.log(`Results: ${passed} PASSED, ${failed} FAILED`);
  console.log("=================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
