/**
 * Irregular plurals commonly found in object detection class sets (COCO classes).
 */
export const IRREGULAR_PLURALS: Readonly<Record<string, string>> = {
  person: "people",
  knife: "knives",
  mouse: "mice",
  sheep: "sheep",
  bear: "bears",
  bus: "buses",
  bench: "benches",
  sandwich: "sandwiches",
  couch: "couches",
  toothbrush: "toothbrushes",
  wine_glass: "wine glasses",
  "wine glass": "wine glasses",
  sports_ball: "sports balls",
  "sports ball": "sports balls",
  baseball_bat: "baseball bats",
  "baseball bat": "baseball bats",
  baseball_glove: "baseball gloves",
  "baseball glove": "baseball gloves",
  traffic_light: "traffic lights",
  "traffic light": "traffic lights",
  fire_hydrant: "fire hydrants",
  "fire hydrant": "fire hydrants",
  stop_sign: "stop signs",
  "stop sign": "stop signs",
  parking_meter: "parking meters",
  "parking meter": "parking meters",
  potted_plant: "potted plants",
  "potted plant": "potted plants",
  dining_table: "dining tables",
  "dining table": "dining tables",
  cell_phone: "cell phones",
  "cell phone": "cell phones",
  hair_drier: "hair driers",
  "hair drier": "hair driers",
  teddy_bear: "teddy bears",
  "teddy bear": "teddy bears",
};

/**
 * Returns the plural form of a noun for natural spoken text.
 *
 * @param className Base singular class name.
 * @param count Number of instances detected.
 */
export function getPluralName(className: string, count: number): string {
  const cleanName = className.replace(/_/g, " ").trim();
  if (count <= 1) {
    return cleanName;
  }

  const lower = cleanName.toLowerCase();
  if (IRREGULAR_PLURALS[lower]) {
    return IRREGULAR_PLURALS[lower];
  }

  // Words that are already plural
  if (lower === "scissors" || lower === "skis") {
    return cleanName;
  }

  if (
    lower.endsWith("ch") ||
    lower.endsWith("sh") ||
    lower.endsWith("ss") ||
    lower.endsWith("x") ||
    lower.endsWith("z")
  ) {
    return cleanName + "es";
  }

  if (lower.endsWith("y") && !/[aeiou]y$/i.test(lower)) {
    return cleanName.slice(0, -1) + "ies";
  }

  return cleanName + "s";
}

/**
 * Capitalizes the first letter of a sentence.
 */
export function capitalize(text: string): string {
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}
