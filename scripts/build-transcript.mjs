import fs from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const subtitleDir = path.join(rootDir, "assets", "subtitles");
const outputDir = path.join(rootDir, "src", "data");
const videoId = process.argv[2] ?? "fRaUe_ZkjnA";
const outputFile = path.join(outputDir, `${videoId}.dual.json`);

const parseTimestamp = (value) => {
  const [hours, minutes, seconds] = value.replace(",", ".").split(":");
  return (
    Number(hours) * 3600 +
    Number(minutes) * 60 +
    Number(seconds)
  );
};

const cleanText = (input) =>
  input
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

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

const uniqueText = (cues) => {
  const seen = new Set();
  return cues
    .map((cue) => cue.text)
    .filter((text) => {
      if (!text || seen.has(text)) {
        return false;
      }
      seen.add(text);
      return true;
    })
    .join(" ");
};

const overlaps = (a, b) => a.start < b.end && b.start < a.end;

const midpointDistance = (a, b) =>
  Math.abs((a.start + a.end) / 2 - (b.start + b.end) / 2);

const pushSegment = (segments, englishCues, irishCues) => {
  const englishText = uniqueText(englishCues);
  const irishText = uniqueText(irishCues);

  if (!englishText && !irishText) {
    return;
  }

  const allCues = [...englishCues, ...irishCues];
  const start = Math.min(...allCues.map((cue) => cue.start));
  const end = Math.max(...allCues.map((cue) => cue.end));
  const englishStart = englishCues.length
    ? Math.min(...englishCues.map((cue) => cue.start))
    : null;
  const englishEnd = englishCues.length
    ? Math.max(...englishCues.map((cue) => cue.end))
    : null;
  const irishStart = irishCues.length
    ? Math.min(...irishCues.map((cue) => cue.start))
    : null;
  const irishEnd = irishCues.length
    ? Math.max(...irishCues.map((cue) => cue.end))
    : null;

  segments.push({
    id: `${segments.length + 1}`,
    start: Number(start.toFixed(3)),
    end: Number(end.toFixed(3)),
    englishStart: englishStart === null ? null : Number(englishStart.toFixed(3)),
    englishEnd: englishEnd === null ? null : Number(englishEnd.toFixed(3)),
    irishStart: irishStart === null ? null : Number(irishStart.toFixed(3)),
    irishEnd: irishEnd === null ? null : Number(irishEnd.toFixed(3)),
    english: englishText,
    irish: irishText,
  });
};

const buildSegments = (english, irish) => {
  const segments = [];
  const consumedIrish = new Set();
  let gaIndex = 0;

  english.forEach((englishCue) => {
    while (irish[gaIndex] && irish[gaIndex].end <= englishCue.start) {
      if (!consumedIrish.has(gaIndex)) {
        pushSegment(segments, [], [irish[gaIndex]]);
        consumedIrish.add(gaIndex);
      }
      gaIndex += 1;
    }

    const matchedIrish = [];
    let cursor = gaIndex;

    while (irish[cursor] && irish[cursor].start < englishCue.end) {
      if (!consumedIrish.has(cursor) && overlaps(englishCue, irish[cursor])) {
        matchedIrish.push(irish[cursor]);
        consumedIrish.add(cursor);
      }
      cursor += 1;
    }

    if (!matchedIrish.length && irish[gaIndex]) {
      const candidate = irish[gaIndex];
      if (midpointDistance(englishCue, candidate) <= 1.5) {
        matchedIrish.push(candidate);
        consumedIrish.add(gaIndex);
      }
    }

    pushSegment(segments, [englishCue], matchedIrish);
  });

  irish.forEach((irishCue, index) => {
    if (!consumedIrish.has(index)) {
      pushSegment(segments, [], [irishCue]);
    }
  });

  return segments.sort((left, right) => left.start - right.start);
};

const main = async () => {
  const [englishRaw, irishRaw] = await Promise.all([
    fs.readFile(path.join(subtitleDir, `${videoId}.en.vtt`), "utf8"),
    fs.readFile(path.join(subtitleDir, `${videoId}.ga.vtt`), "utf8"),
  ]);

  const english = parseVtt(englishRaw);
  const irish = parseVtt(irishRaw);
  const transcript = buildSegments(english, irish);

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(outputFile, JSON.stringify(transcript, null, 2));

  console.log(`Generated ${transcript.length} dual-language transcript segments for ${videoId}.`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
