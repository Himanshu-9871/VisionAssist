# Awareness Module — How It Works

---

## What Does This Module Do?

The **Awareness Mode** in BlindVision automatically captures camera frames, detects objects, and announces them aloud for visually-impaired users — e.g. *"Person on the left. Bottle in the center."*

This runs in a **continuous loop**, approximately every 1.5 seconds.

---

## File Structure — Who Does What

```
src/services/awareness/
│
├── index.ts               ← 📦 ENTRY POINT  (all exports live here)
├── types.ts               ← 📋 Type definitions only  (no logic)
├── config.ts              ← ⚙️  Default settings and named constants
├── awarenessController.ts ← 🧠 MAIN BRAIN  — orchestrates the entire loop
├── sceneComparison.ts     ← 🔍 Compares detections between two frames
└── announcementEngine.ts  ← 🗣️  Decides what (if anything) to announce
```

---

## Entry Point → `index.ts`

```
App / Component
      ↓
  index.ts   ← import everything from here
```

This file does no work itself — it is purely a **re-export gate**. Everything inside the module is published through it.

```ts
// How the app imports from this module:
import { AwarenessController, useAwarenessMode } from "../services/awareness";
//                                                    ↑
//                                              this is index.ts
```

**What gets exported and where it comes from:**

| Export | Source file |
|--------|-------------|
| `AwarenessController` | `awarenessController.ts` |
| `useAwarenessMode` | `useAwarenessMode.ts` |
| `compareScenes`, `calculateIoU` | `sceneComparison.ts` |
| `decideAnnouncement` | `announcementEngine.ts` |
| `DEFAULT_AWARENESS_CONFIG` + constants | `config.ts` |
| All types | `types.ts` |

---

## How One Cycle Runs — Step by Step

```
AwarenessController.executeCycle()
        │
        ▼
1. 📷  captureCurrentFrame()
        │  Take a photo from the camera
        │  If no frame returned → abort this cycle
        ▼
2. 🤖  detectFrameObjects()
        │  Run the AI model on the photo
        │  Returns: [{ className: "person", boundingBox: {...} }, ...]
        ▼
3. 🔍  compareScenes()            ← sceneComparison.ts
        │  Match new detections against previously tracked objects
        │  Returns: { newObjects, changedObjects, persistentObjects }
        ▼
4. 🧠  evaluateAnnouncement()     ← announcementEngine.ts
        │  Should we say anything?
        │  TTS still speaking?   → stay silent
        │  Less than 2.5s ago?   → stay silent
        │  New object detected?  → announce it
        ▼
5. 🔊  handleAnnouncement()
        │  speakText("Person on the left.")
        ▼
6. 📡  broadcastCycleResult()
        │  Notify all subscribers that the cycle completed
        ▼
7. ⏱️  scheduleNextCycle()
        └── Wait 1500ms, then repeat from step 1
```

---

## Each File's Responsibility

### `types.ts` — Definitions Only
No logic here — just TypeScript type contracts:
- `AwarenessStatus` → `"INACTIVE" | "ACTIVE" | "PAUSED"`
- `TrackedSceneObject` → an object being tracked across frames
- `AwarenessConfig` → shape of the settings object
- `AnnouncementDecision` → what to say (or whether to stay silent)

---

### `config.ts` — Default Settings
```ts
captureIntervalMs: 1500         // one cycle every 1.5 seconds
objectCooldownMs: 15000         // don't re-announce the same object for 15s
minAnnouncementIntervalMs: 2500 // minimum gap between any two announcements
STARTUP_CYCLE_DELAY_MS: 800     // wait 800ms after start() before first cycle
```

---

### `sceneComparison.ts` — Compare the Scene
Compares what was visible in the previous frame against what is visible now.

```
Previous frame: [Person (left),   Bottle (center)]
Current frame:  [Person (center), Bottle (center)]
                       ↓
Result:  Person → changedObjects  (moved left → center)
         Bottle → persistentObjects (unchanged)
```

Uses **IoU (Intersection over Union)** to determine whether two bounding boxes in different frames refer to the same physical object.

---

### `announcementEngine.ts` — Decide What to Say
Applies priority rules in order:

1. TTS is currently speaking? → **stay silent**
2. Less than 2.5 seconds since last announcement? → **stay silent**
3. New object appeared? → **"Person on the left."**
4. Object moved to a different region? → **"Person moved to the center."**
5. Nothing meaningful changed? → **stay silent**

---

### `awarenessController.ts` — The Main Brain
Orchestrates the full flow and manages the lifecycle:

```
start()   → INACTIVE → ACTIVE   → loop begins
pause()   → ACTIVE   → PAUSED   → loop pauses
resume()  → PAUSED   → ACTIVE   → loop resumes
stop()    → ACTIVE   → INACTIVE → loop ends
destroy() → cleans up everything (timers, listeners, state)
```

Uses a **session token** — if `stop()` is called while a cycle is mid-flight, the in-flight cycle detects the session mismatch and discards its result safely.

---

## Data Flow — In One Line

```
App → [index.ts] → AwarenessController → captureFrame → detectObjects
    → compareScenes → decideAnnouncement → speakText → User hears it
```

---

## Where Should You Import From?

**Always from `index.ts` — never directly from an internal file.**

```ts
// ✅ Correct
import { AwarenessController } from "../services/awareness";

// ❌ Wrong — do not import internal files directly
import { AwarenessController } from "../services/awareness/awarenessController";
```

`index.ts` is the **public API boundary**. If an internal file is renamed or restructured, no external code breaks as long as `index.ts` keeps exporting the same names.
