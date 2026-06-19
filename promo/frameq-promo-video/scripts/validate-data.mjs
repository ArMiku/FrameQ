import fs from "node:fs";
import path from "node:path";

const dataPath = path.join(process.cwd(), "src", "promoData.json");

if (!fs.existsSync(dataPath)) {
  throw new Error("Missing src/promoData.json");
}

const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));

const expected = {
  fps: 30,
  width: 1080,
  height: 1350,
  durationInFrames: 1350,
};

const isObject = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;

for (const [key, value] of Object.entries(expected)) {
  if (data.composition?.[key] !== value) {
    throw new Error(`composition.${key} must be ${value}`);
  }
}

if (!Array.isArray(data.scenes) || data.scenes.length !== 5) {
  throw new Error("Expected exactly 5 scenes");
}

if (!Array.isArray(data.captions) || data.captions.length !== 5) {
  throw new Error("Expected exactly 5 caption groups");
}

for (const [index, scene] of data.scenes.entries()) {
  if (!isObject(scene)) {
    throw new Error(`Scene ${index} must be an object`);
  }
  if (!isNonEmptyString(scene.id)) {
    throw new Error(`Scene ${index}.id must be a non-empty string`);
  }
  if (!isNonEmptyString(scene.label)) {
    throw new Error(`Scene ${scene.id}.label must be a non-empty string`);
  }
  if (!Number.isInteger(scene.startFrame) || !Number.isFinite(scene.startFrame)) {
    throw new Error(`Scene ${scene.id}.startFrame must be a finite integer`);
  }
  if (!Number.isInteger(scene.endFrame) || !Number.isFinite(scene.endFrame)) {
    throw new Error(`Scene ${scene.id}.endFrame must be a finite integer`);
  }
  if (scene.startFrame < 0 || scene.endFrame > expected.durationInFrames) {
    throw new Error(`Scene ${scene.id} is outside composition bounds`);
  }
  if (scene.endFrame <= scene.startFrame) {
    throw new Error(`Scene ${scene.id} has invalid frame range`);
  }
}

for (let index = 1; index < data.scenes.length; index += 1) {
  const previous = data.scenes[index - 1];
  const current = data.scenes[index];
  if (previous.endFrame !== current.startFrame) {
    throw new Error(`Scene ${previous.id} must end where ${current.id} starts`);
  }
}

if (data.scenes[0].startFrame !== 0) {
  throw new Error("First scene must start at frame 0");
}

if (data.scenes[data.scenes.length - 1].endFrame !== expected.durationInFrames) {
  throw new Error("Last scene must end at frame 1350");
}

for (const [index, caption] of data.captions.entries()) {
  if (!isObject(caption)) {
    throw new Error(`Caption ${index} must be an object`);
  }
  if (!isNonEmptyString(caption.text)) {
    throw new Error(`Caption ${index}.text must be a non-empty string`);
  }
  if (!isNonEmptyString(caption.highlight)) {
    throw new Error(`Caption ${index}.highlight must be a non-empty string`);
  }
  if (!Number.isInteger(caption.startFrame) || !Number.isFinite(caption.startFrame)) {
    throw new Error(`Caption ${index}.startFrame must be a finite integer`);
  }
  if (!Number.isInteger(caption.endFrame) || !Number.isFinite(caption.endFrame)) {
    throw new Error(`Caption ${index}.endFrame must be a finite integer`);
  }
  if (caption.startFrame < 0 || caption.endFrame > expected.durationInFrames) {
    throw new Error(`Caption ${index} is outside composition bounds`);
  }
  if (caption.endFrame <= caption.startFrame) {
    throw new Error(`Caption ${index} has invalid frame range`);
  }

  const scene = data.scenes[index];
  if (caption.startFrame !== scene.startFrame || caption.endFrame !== scene.endFrame) {
    throw new Error(`Caption ${index} must match scene ${scene.id} frame range`);
  }
  if (!caption.text.includes(caption.highlight)) {
    throw new Error(`Caption ${index}.text must include its highlight`);
  }
}

if (!Array.isArray(data.keywords)) {
  throw new Error("keywords must be an array");
}

for (const [index, keyword] of data.keywords.entries()) {
  if (!isNonEmptyString(keyword)) {
    throw new Error(`keywords[${index}] must be a non-empty string`);
  }
}

const requiredKeywords = ["本地优先", "文字稿", "启发话题点", "轻量分发"];
for (const keyword of requiredKeywords) {
  if (!data.keywords.includes(keyword)) {
    throw new Error(`Missing keyword: ${keyword}`);
  }
}

if (!Array.isArray(data.captionWords) || data.captionWords.length === 0) {
  throw new Error("captionWords must contain at least one item");
}

for (const [index, item] of data.captionWords.entries()) {
  if (typeof item.text !== "string" || item.text.trim().length === 0) {
    throw new Error(`captionWords[${index}].text must be a non-empty string`);
  }

  for (const key of ["startMs", "endMs", "timestampMs", "confidence"]) {
    if (typeof item[key] !== "number" || !Number.isFinite(item[key])) {
      throw new Error(`captionWords[${index}].${key} must be a finite number`);
    }
  }

  if (item.startMs < 0) {
    throw new Error(`captionWords[${index}].startMs must be >= 0`);
  }

  if (item.endMs <= item.startMs) {
    throw new Error(`captionWords[${index}].endMs must be greater than startMs`);
  }

  if (item.timestampMs !== item.startMs) {
    throw new Error(`captionWords[${index}].timestampMs must equal startMs`);
  }

  if (item.confidence < 0 || item.confidence > 1) {
    throw new Error(`captionWords[${index}].confidence must be between 0 and 1`);
  }

  if (index === 0 && item.startMs !== 0) {
    throw new Error("First captionWords item must start at 0ms");
  }

  if (index > 0) {
    const previous = data.captionWords[index - 1];
    if (previous.endMs !== item.startMs) {
      throw new Error(`captionWords[${index - 1}] must end where captionWords[${index}] starts`);
    }
  }
}

if (data.captionWords[data.captionWords.length - 1].endMs !== 45000) {
  throw new Error("Last captionWords item must end at 45000ms");
}

console.log("promo data ok");
