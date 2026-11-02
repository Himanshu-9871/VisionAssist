# VisionAssist — Codebase Guide (Hinglish Version)

Bhai, ye document **VisionAssist** project ke har ek file ko aasan aur bilkul simple Hinglish me explain karta hai.
Iska maqsad ye hai ki tum:
1. Har ek file ka purpose (kyun bani hai aur kya karti hai) khud deeply samajh sako.
2. Kisi aur developer ya interviewer ko confidently explain kar sako.

---

## 1. Project Ka Main Concept Kya Hai?

**VisionAssist** ek React Native (Expo) mobile app hai jo visually impaired (blind) users ke liye banayi gayi hai.
App camera se aage ki cheezein dekhti hai, **YOLO26n** AI model se objects detect karti hai, pata lagati hai ki cheez **Left**, **Center**, ya **Right** me hai, aur user ko bolkar (Text-to-Speech) batati hai.

Sabse khaas baat: Ye **100% on-device** chalta hai. Koi cloud server ya internet connection nahi chahiye!

```
[Camera Photo] 
      ⬇️
[Image Preprocessing (Downscale & 640x640 Letterbox)] 
      ⬇️
[ONNX Runtime (YOLO26n AI Model)] 
      ⬇️
[Spatial Awareness (Left / Center / Right Classification)] 
      ⬇️
[Awareness Engine (Tracking & Smart Silence Throttling)] 
      ⬇️
[Expo Speech (TTS Awaz me bolna)]
```

---

## 2. Main Entry Points (App Kaise Start Hoti Hai)

### `app/_layout.tsx`
- **Kyun banayi:** Expo Router me har app ko ek root layout chahiye hota hai navigation define karne ke liye.
- **Kya karti hai:** Fullscreen stack setup karti hai aur top header bar ko hide (`headerShown: false`) kar deti hai taaki camera screen bina kisi rukawat ke poori screen par dikhe.

```tsx
import { Stack } from "expo-router";

export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

---

### `app/index.tsx` (Main Coordinator Screen)
- **Kyun banayi:** Clean Code ka sabse bada rule hai: **"Main screen coordinator honi chahiye, god object nahi."** Yahan par saare UI states ko ek jagah organize kiya gaya hai.
- **Kya karti hai:**
  1. Screen ke states ko manage karti hai (`isDetecting`, `descriptionText`, `speakingActive`).
  2. `useAwarenessMode` hook ko call karti hai jo background me continuous monitoring karta hai.
  3. Jab user button dabata hai, to `executeSingleShotScan` ko call karti hai.
  4. TTS speech ko start, stop aur replay karne ka control sambhalti hai.

```tsx
// app/index.tsx ka main flow:
const handleDetectAndDescribe = async (imageUri: string, width?: number, height?: number) => {
  if (isDetecting || awareness.isProcessing) return;

  // Agar continuous awareness chal rahi thi, to single shot lene ke liye use pause karo
  if (awareness.status === "ACTIVE") {
    await awareness.pauseAwareness();
  }

  try {
    setIsDetecting(true);
    await stopSpeech(); // Pehle ki aawaz band karo
    
    // Single-shot pipeline chalana: capture -> detect -> describe
    const { description } = await executeSingleShotScan(imageUri, width, height);
    setDescriptionText(description);

    // Awaz me bolna
    await speak(description, {
      onDone: () => setSpeakingActive(false),
      onStopped: () => setSpeakingActive(false),
    });
  } catch (error) {
    const errorMsg = "Detection failed. Please try again.";
    setDescriptionText(errorMsg);
    await speak(errorMsg);
  } finally {
    setIsDetecting(false);
  }
};
```

---

## 3. Camera Service & UI Components (`src/services/camera/`)

Pehle `CameraView.tsx` 925 lines ki ek bohot badi file thi jisme camera, permission, ONNX test, buttons, cards sab mix tha. Refactoring ke baad ise chote-chote focused components me baanta gaya hai.

### `src/services/camera/cameraService.ts`
- **Kyun banayi:** Phone ke physical camera hardware aur image dimension handling ko alag rakhne ke liye.
- **Kya karti hai:**
  - `captureFrame(camera)`: Native camera se photo kheenchti hai aur uska local file URI, width aur height return karti hai.
  - `getImageDimensions(uri)`: React Native ke `Image.getSize` ka use karke photo ka exact width aur height nikaalti hai (bina koi guess lagaye).
  - `resolveImageDimensions(uri, width, height)`: Photo dimensions ko safely verify karti hai.

---

### `src/services/camera/singleShotDetection.ts`
- **Kyun banayi:** Single-shot scan (Photo kheencho $\rightarrow$ Detect karo $\rightarrow$ Position nikalo $\rightarrow$ Bolo) ka business logic UI screen se bahar nikaalne ke liye.
- **Kya karti hai:**
  1. Photo ke exact dimensions nikaalti hai.
  2. `detectObjectsFromImage` ko call karke YOLO model chalati hai.
  3. `describeDetections` ko call karke natural English sentence banati hai (e.g. *"Bottle in the center. Person on the left."*).
  4. Clean result object return karti hai.

---

### `src/services/camera/CameraView.tsx`
- **Kyun banayi:** Ye camera screen ka main view hai. Refactoring ke baad ye sirf **220 lines** ka reh gaya hai.
- **Kya karti hai:**
  1. Native camera view (`ExpoCameraView`) render karti hai.
  2. Camera permissions check karti hai (`useCameraPermissions`).
  3. Imperative ref (`capture()`, `isReady()`) expose karti hai taaki background awareness loop photos capture kar sake.
  4. Chote UI components ko cleanly assemble karti hai.

---

### Camera UI Subcomponents (`src/services/camera/components/`)

1. **`CameraPermissionView.tsx`**: Agar user ne camera permission nahi di ya permission mangni hai, to clean UI card dikhata hai "Allow Camera" button ke saath.
2. **`AwarenessStatusBadge.tsx`**: Screen ke top bar par green dot aur status dikhata hai: `AWARENESS ACTIVE`, `PAUSED`, ya `IDLE`. Saath me chota sa `ONNX OK` button bhi hai.
3. **`OnnxDiagnosticsCard.tsx`**: Jab ONNX button par click karte hain, to ye card khulta hai aur batata hai ki ONNX Runtime initialize hua ya nahi, kitne milliseconds (latency) lage, aur "Run Test" button provide karta hai.
4. **`AwarenessSummaryCard.tsx`**: Screen par ek compact card jisme dikhta hai: "Last Spoken" aawaz me kya bola gaya tha, aur abhi camera me kaun-kaun se objects dikh rahe hain (e.g. `person (85%), bottle (90%)`).
5. **`SpeechControlCard.tsx`**: Jab detection hoti hai, to description yahan text me dikhti hai, saath me **Stop Voice** aur **Replay** ke accessible buttons milte hain.
6. **`AwarenessActionControls.tsx`**: Bottom me action buttons hote hain: **Start Awareness**, **Pause**, **Resume**, **Stop Awareness**, aur single-shot **Detect & Describe**.

---

## 4. Object Detection & AI Preprocessing (`src/services/objectDetection/`)

### `src/services/objectDetection/cocoClasses.ts`
- **Kyun banayi:** 80 COCO classes ki lambi list ko main detection code se alag rakhne ke liye taaki code saaf dikhe.
- **Kya karti hai:** COCO dataset ke sabhi 80 class labels store karti hai aur `getClassName(classId)` function deti hai (jaise ID `0` $\rightarrow$ `"person"`, ID `39` $\rightarrow$ `"bottle"`).

---

### `src/services/objectDetection/imagePreprocessing.ts`
- **Kyun banayi:** AI model raw camera photo ko direct nahi samajh sakta. Photo ko model ke format me convert karne ke liye ye file banayi gayi hai.
- **Kya karti hai:**
  1. **JPEG Decoding (`decodeImageBytes`):** Image bytes ko `jpeg-js` se decode karke raw RGBA pixels banati hai.
  2. **Letterboxing (`createInputTensor`):**
     - YOLO26n model ko exact $640 \times 640$ size chahiye.
     - Agar photo rectangle hai (jaise $1920 \times 1080$), to use bina distort kiye scale kiya jata hai aur bachi hui jagah par standard gray color ($114 / 255$) fill kiya jata hai.
     - Isko Float32 planar tensor `[1, 3, 640, 640]` me convert kiya jata hai.
  3. **Output Parsing (`parseDetections`):** Model se nikle 300 boxes ko check karti hai, jinki confidence $25\%$ se kam ho unhe filter karti hai, aur letterbox offset hata kar original coordinates me map karti hai.
  4. **Coordinate Remapping:** Bounding boxes ko original camera resolution par wapas scale karti hai.

```typescript
// Letterbox math: Aspect ratio barkaraar rakhna aur gray padding lagana
const scale = Math.min(640 / sourceWidth, 640 / sourceHeight);
const scaledWidth = Math.round(sourceWidth * scale);
const scaledHeight = Math.round(sourceHeight * scale);
const padX = Math.floor((640 - scaledWidth) / 2);
const padY = Math.floor((640 - scaledHeight) / 2);
```

---

### `src/services/objectDetection/objectDetectionService.ts`
- **Kyun banayi:** ONNX Runtime session ko manage karna aur inference run karna. Refactored to ~183 lines.
- **Kya karti hai:**
  1. App assets se `yolo26n.onnx` model load karti hai.
  2. Ek baar model load karke cache me rakh leti hai (`InferenceSession`) 4 CPU threads ke saath.
  3. `detectObjectsFromImage(imageUri, width, height)`:
     - **Performance Trick:** Pehle `expo-image-manipulator` se hardware downscale karti hai 640px par (~20ms me), jisse 12-megapixel ki badi photo ko JS me decode karne ka 3 second ka lag khatam ho jata hai.
     - Compact photo ko decode karke model me daalti hai (~150-250ms me detection).
     - Final `Detection[]` array return karti hai.

---

## 5. Spatial Awareness (`src/services/spatialAwareness/`)

### `src/services/spatialAwareness/config.ts` & `types.ts`
- **Kyun banayi:** Camera frame ko horizontally 3 hisso me baantne ke thresholds define karti hai.
- **Kya karti hai:**
  - `0% se 33%`: **LEFT**
  - `33% se 66%`: **CENTER**
  - `66% se 100%`: **RIGHT**

---

### `src/services/spatialAwareness/spatialAwarenessService.ts`
- **Kyun banayi:** Pata lagane ke liye ki detected cheez user ke samne kahan hai aur aasan sentence banane ke liye.
- **Kya karti hai:**
  1. `analyzeSpatialDetections`: Bounding box ka center point nikaalti hai ($x + \text{width} / 2$), image width se divide karti hai, aur classify karti hai ki object **LEFT**, **CENTER**, ya **RIGHT** me hai.
  2. `generateSpokenDescription`: Objects ko group karti hai taaki baar-baar ek hi cheez na bolni pade. Jaise agar 2 bottles center me hain, to *"2 bottles in the center"* bolegi, na ki *"Bottle in center. Bottle in center."*

---

## 6. Automatic Awareness Subsystem (`src/services/awareness/`)

Ye project ka sabse smart feature hai. Blind user ko baar-baar button dabane ki zarurat nahi hai. App har 1.5 second me photo leti hai aur sirf tab bolti hai jab koi nayi cheez samne aaye ya purani cheez move kare.

### `src/services/awareness/types.ts`
- Tracking ke data types:
  - `TrackedObject`: Har tracked cheez ki ID, class name, bounding box, spatial region, aur `consecutiveMissingFrames` counter.
  - `AwarenessStatus`: `"ACTIVE" | "PAUSED" | "INACTIVE"`.
  - `SceneComparison`: Naye objects, purane objects, moved objects, aur chale gaye objects ki list.

---

### `src/services/awareness/config.ts`
- Timing aur thresholds:
  - `captureIntervalMs: 1500` (Har 1.5 second me ek snapshot).
  - `minAnnouncementIntervalMs: 2500` (Kam se kam 2.5 second ka gap do aawazon ke beech taaki user audio se confuse na ho).
  - `iouMatchThreshold: 0.25` (Boxes ke beech overlap check).
  - `maxConsecutiveMissingFrames: 2` (Agar 1 frame me koi cheez miss ho jaye to foran "departed" mat bolo, 2 frames wait karo — ise *hysteresis* kehte hain).

---

### `src/services/awareness/sceneComparison.ts`
- **Kyun banayi:** Frame-to-frame objects ko match karne aur movement detect karne ke liye.
- **Kya karti hai:**
  1. `calculateIoU`: Do boxes ke beech **Intersection-over-Union** calculate karti hai.
  2. `compareScenes`:
     - Pichle frame ke tracked objects ko naye detections se match karti hai.
     - Agar koi cheez pehle `LEFT` me thi aur ab `CENTER` me aa gayi, to use `changedObjects` me daalti hai.
     - Agar koi nayi cheez aayi to `newObjects` me daalti hai.

---

### `src/services/awareness/announcementEngine.ts`
- **Kyun banayi:** Ye "Dimaag" (Brain) hai jo decide karta hai ki **kab bolna hai aur kab chup rehna hai**.
- **Kya karti hai:**
  - **Speech Guards:**
    - Agar phone abhi bol raha hai $\rightarrow$ **Chup raho** (overlapping speech nahi honi chahiye).
    - Agar pichle 2.5 second me abhi bola tha aur koi khaas change nahi hua $\rightarrow$ **Throttled Silence**.
    - Agar scene me koi change nahi hua $\rightarrow$ **Chup raho**.
  - **Announcement Generation:**
    - Naye object aane par: *"Person on the left. Bottle in the center."*
    - Move hone par: *"Person moved to the center."*

---

### `src/services/awareness/awarenessController.ts`
- **Kyun banayi:** Continuous background loop aur lifecycle state machine ko run karne ke liye.
- **Kya karti hai:**
  1. `startAwareness()`, `pauseAwareness()`, `resumeAwareness()`, `stopAwareness()` provide karti hai.
  2. Timer loop chalati hai jo har cycle me camera frame capture karke detection, comparison aur speech pipeline run karta hai.
  3. Status badalne par aawaz me bolti hai (*"Awareness mode started."*, *"Awareness paused."*, etc.).
  4. Jab stop hoti hai to saare timers aur memory ko safely clean kar deti hai.

---

### `src/services/awareness/useAwarenessMode.ts`
- **Kyun banayi:** React Hook jo `AwarenessController` ko React UI components se jodta hai bina memory leak ke.
- **Kya karti hai:** React components ko simple state (`status`, `latestDetections`, `lastAnnouncement`) deti hai aur buttons ke functions (`startAwareness`, `stopAwareness`, etc.) provide karti hai.

---

### `src/services/awareness/__tests__/awareness.test.ts`
- **Kyun banayi:** Pure system ko automate karke verify karne ke liye test suite.
- **Kya karti hai:** 34 test cases run karti hai (IoU math, tracking hysteresis, lateral movement, speech throttling, state machine lifecycle). Sabhi **34 PASSED** hote hain!

---

## 7. Supporting Services & Utilities

### `src/services/tts/ttsService.ts`
- **Kyun banayi:** Device ke speaker se aawaz nikaalne ke liye (`expo-speech` wrapper).
- **Kya karti hai:**
  - `speak(text)`: Text ko natural aawaz me bolti hai.
  - `stopSpeech()`: Foran aawaz ko chup karati hai jab naya command aaye.
  - `isSpeaking()`: Check karti hai ki kya phone abhi bol raha hai.

---

### `src/services/onnx/onnxService.ts`
- **Kyun banayi:** Device par native ONNX C++ library theek se load hui ya nahi, ye verify karne ke liye.
- **Kya karti hai:** Chota sa dummy model (`mul_1.onnx`) chalakar 5ms me latency check karti hai aur verify karti hai ki ONNX native engine working condition me hai.

---

### `src/utils/grammar.ts`
- **Kyun banayi:** English grammar ki galatiyan theek karne ke liye taaki TTS sunne me natural lage.
- **Kya karti hai:**
  - Irregular plurals theek karti hai: `person` $\rightarrow$ `people`, `knife` $\rightarrow$ `knives`, `mouse` $\rightarrow$ `mice`.
  - Normal plurals banati hai: `bottle` $\rightarrow$ `bottles`, `bus` $\rightarrow$ `buses`.
  - Sentence ka pehla letter capital karti hai.

---

### `src/shared/types/`
- **`BoundingBox.ts`**: Box ke coordinates `{ x, y, width, height }`.
- **`Detection.ts`**: AI model ka final detection result `{ classId, className, confidence, boundingBox }`.
- **`Frame.ts`**: Camera photo metadata `{ uri, width, height }`.
- **`Region.ts`**: `"LEFT" | "CENTER" | "RIGHT"`.
- **`TtsOptions.ts`**: Speech settings (`rate`, `pitch`, callbacks).

---

## 8. Summary Table: Ek Nazar Me Kaunsi File Kya Karti Hai

| File Path | Category | Main Kaam |
| :--- | :--- | :--- |
| `app/index.tsx` | Main Screen | Poore app ka UI coordinator (single-shot aur continuous awareness dono handle karta hai). |
| `app/_layout.tsx` | Navigation | Fullscreen camera ke liye header-less stack navigation. |
| `src/services/camera/CameraView.tsx` | Camera View | Camera stream dikhana aur subcomponents ko assemble karna (220 lines). |
| `src/services/camera/cameraService.ts` | Camera Service | Photo capture karna aur accurate dimensions nikaalna. |
| `src/services/camera/singleShotDetection.ts` | Pipeline | Button dabane par photo kheench kar bolne ka complete pipeline. |
| `src/services/camera/components/*` | UI Cards | Top badge, ONNX card, summary card, speech replay aur action buttons. |
| `src/services/objectDetection/objectDetectionService.ts` | AI Model | ONNX session cache karna aur fast inference run karna (183 lines). |
| `src/services/objectDetection/imagePreprocessing.ts` | Math / Tensor | Fast hardware downscale, letterbox padding aur NCHW tensor creation. |
| `src/services/objectDetection/cocoClasses.ts` | Constants | 80 COCO classes ki mapping aur names. |
| `src/services/spatialAwareness/spatialAwarenessService.ts` | Geometry | Left, Center, Right nikaalna aur natural English sentences banana. |
| `src/services/awareness/awarenessController.ts` | State Machine | Background continuous awareness loop aur timers ko manage karna. |
| `src/services/awareness/sceneComparison.ts` | Tracking | IoU se check karna ki pichli photo aur abhi ki photo me kya badla. |
| `src/services/awareness/announcementEngine.ts` | Decision Engine | Faltu bolne se bachna (throttling) aur sahi time par sahi sentence bolna. |
| `src/services/awareness/useAwarenessMode.ts` | React Hook | Awareness mode ko safely React screen se connect karna. |
| `src/services/tts/ttsService.ts` | Voice Audio | `expo-speech` se audio play karna aur speech stop karna. |
| `src/services/onnx/onnxService.ts` | Test Health | Native ONNX engine ka test aur latency benchmark. |
| `src/utils/grammar.ts` | Grammar | Natural English pluralization (`people`, `bottles`, `knives`). |
| `src/shared/types/*` | Shared Types | Poore project ke common TypeScript interfaces (Single Source of Truth). |
