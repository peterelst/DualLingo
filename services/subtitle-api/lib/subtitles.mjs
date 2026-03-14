const LANGUAGE_LABELS = {
  ar: "Arabic",
  ca: "Catalan",
  cy: "Welsh",
  da: "Danish",
  de: "German",
  en: "English",
  "en-orig": "English",
  es: "Spanish",
  eu: "Basque",
  fi: "Finnish",
  fr: "French",
  ga: "Irish",
  gd: "Scottish Gaelic",
  gl: "Galician",
  it: "Italian",
  ja: "Japanese",
  ko: "Korean",
  nl: "Dutch",
  no: "Norwegian",
  pl: "Polish",
  pt: "Portuguese",
  "pt-pt": "Portuguese",
  ro: "Romanian",
  ru: "Russian",
  sv: "Swedish",
  tr: "Turkish",
  uk: "Ukrainian",
  zh: "Chinese",
  "zh-hans": "Chinese (Simplified)",
  "zh-hant": "Chinese (Traditional)",
};

const toTitleCase = (value) => value.replace(/\b\w/g, (character) => character.toUpperCase());

const normalizeLanguageCode = (value) => {
  if (!value) {
    return null;
  }

  return value.trim().toLowerCase().replace(/_/g, "-");
};

const getLanguageLabel = (code) => {
  if (!code) {
    return null;
  }

  if (LANGUAGE_LABELS[code]) {
    return LANGUAGE_LABELS[code];
  }

  const baseCode = code.split("-")[0];
  if (LANGUAGE_LABELS[baseCode]) {
    return LANGUAGE_LABELS[baseCode];
  }

  return toTitleCase(code.replace(/-/g, " "));
};

const parseTimestamp = (value) => {
  const [hours, minutes, seconds] = value.replace(",", ".").split(":");
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
};

const cleanText = (input) =>
  input
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const parseSubtitleContent = (content, format = "vtt") => {
  if (format === "srt") {
    return parseSrt(content);
  }

  return parseVtt(content);
};

const parseVtt = (content) => {
  const lines = content.replace(/\r/g, "").split("\n");
  const cues = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();

    if (!line || line === "WEBVTT" || line.startsWith("Kind:") || line.startsWith("Language:")) {
      continue;
    }

    if (/^\d+$/.test(line) && lines[index + 1]?.includes("-->")) {
      continue;
    }

    if (!line.includes("-->")) {
      continue;
    }

    const [rawStart, rawEnd] = line.split("-->");
    const start = parseTimestamp(rawStart.trim());
    const end = parseTimestamp(rawEnd.trim().split(" ")[0]);
    const textLines = [];

    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const nextLine = lines[cursor];
      if (!nextLine.trim()) {
        index = cursor;
        break;
      }
      textLines.push(nextLine);
      if (cursor === lines.length - 1) {
        index = cursor;
      }
    }

    const text = cleanText(textLines.join(" "));
    if (text) {
      cues.push({ start, end, text });
    }
  }

  return cues;
};

const parseSrt = (content) => {
  const blocks = content.replace(/\r/g, "").trim().split("\n\n");
  const cues = [];

  blocks.forEach((block) => {
    const lines = block.split("\n").filter(Boolean);
    const timeLine = lines.find((line) => line.includes("-->"));
    if (!timeLine) {
      return;
    }

    const [rawStart, rawEnd] = timeLine.split("-->");
    const textLines = lines.slice(lines.indexOf(timeLine) + 1);
    const text = cleanText(textLines.join(" "));
    if (!text) {
      return;
    }

    cues.push({
      start: parseTimestamp(rawStart.trim()),
      end: parseTimestamp(rawEnd.trim()),
      text,
    });
  });

  return cues;
};

export const normalizeTrack = ({ id, languageCode, languageLabel, origin, format = "vtt" }) => {
  const normalizedLanguageCode = normalizeLanguageCode(languageCode) ?? id;
  return {
    id,
    languageCode: normalizedLanguageCode,
    languageLabel: languageLabel ?? getLanguageLabel(normalizedLanguageCode) ?? id,
    origin,
    format,
  };
};

export const buildMergedSegments = (tracks) => {
  const boundaries = new Set();

  tracks.forEach((track) => {
    track.cues.forEach((cue) => {
      boundaries.add(Number(cue.start.toFixed(3)));
      boundaries.add(Number(cue.end.toFixed(3)));
    });
  });

  const points = [...boundaries].sort((left, right) => left - right);
  const segments = [];

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];

    if (end <= start) {
      continue;
    }

    const cues = {};

    tracks.forEach((track) => {
      const overlapping = track.cues.filter((cue) => cue.start < end && cue.end > start);
      if (!overlapping.length) {
        return;
      }

      const text = [...new Set(overlapping.map((cue) => cue.text).filter(Boolean))].join(" ");
      if (!text) {
        return;
      }

      cues[track.track.id] = {
        start: Number(Math.min(...overlapping.map((cue) => cue.start)).toFixed(3)),
        end: Number(Math.max(...overlapping.map((cue) => cue.end)).toFixed(3)),
        text,
      };
    });

    if (!Object.keys(cues).length) {
      continue;
    }

    const previous = segments.at(-1);
    const cueSignature = JSON.stringify(cues);

    if (previous && previous.signature === cueSignature) {
      previous.end = Number(end.toFixed(3));
      continue;
    }

    segments.push({
      id: `${segments.length + 1}`,
      start: Number(start.toFixed(3)),
      end: Number(end.toFixed(3)),
      cues,
      signature: cueSignature,
    });
  }

  return segments.map(({ signature, ...segment }) => segment);
};
