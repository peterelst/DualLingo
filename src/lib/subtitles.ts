import type { TranscriptSegment } from "@/types/youtube";

export interface ParsedCue {
  start: number;
  end: number;
  text: string;
}

export interface ParsedSubtitleFile {
  cues: ParsedCue[];
  duration: number;
}

const parseTimestamp = (value: string) => {
  const [hours, minutes, seconds] = value.replace(",", ".").split(":");
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
};

const cleanText = (input: string) =>
  input
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const parseVtt = (content: string) => {
  const lines = content.replace(/\r/g, "").split("\n");
  const cues: ParsedCue[] = [];

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
    const textLines: string[] = [];

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

const parseSrt = (content: string) => {
  const blocks = content.replace(/\r/g, "").trim().split("\n\n");
  const cues: ParsedCue[] = [];

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

const uniqueText = (cues: ParsedCue[]) => {
  const seen = new Set<string>();
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

const overlaps = (a: ParsedCue, b: ParsedCue) => a.start < b.end && b.start < a.end;

const midpointDistance = (a: ParsedCue, b: ParsedCue) =>
  Math.abs((a.start + a.end) / 2 - (b.start + b.end) / 2);

const pushSegment = (segments: TranscriptSegment[], firstCues: ParsedCue[], secondCues: ParsedCue[]) => {
  const englishText = uniqueText(firstCues);
  const irishText = uniqueText(secondCues);

  if (!englishText && !irishText) {
    return;
  }

  const allCues = [...firstCues, ...secondCues];
  const start = Math.min(...allCues.map((cue) => cue.start));
  const end = Math.max(...allCues.map((cue) => cue.end));
  const englishStart = firstCues.length ? Math.min(...firstCues.map((cue) => cue.start)) : null;
  const englishEnd = firstCues.length ? Math.max(...firstCues.map((cue) => cue.end)) : null;
  const irishStart = secondCues.length ? Math.min(...secondCues.map((cue) => cue.start)) : null;
  const irishEnd = secondCues.length ? Math.max(...secondCues.map((cue) => cue.end)) : null;

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

export const buildDualTranscript = (first: ParsedCue[], second: ParsedCue[]) => {
  const segments: TranscriptSegment[] = [];
  const consumedSecond = new Set<number>();
  let secondIndex = 0;

  first.forEach((firstCue) => {
    while (second[secondIndex] && second[secondIndex].end <= firstCue.start) {
      if (!consumedSecond.has(secondIndex)) {
        pushSegment(segments, [], [second[secondIndex]]);
        consumedSecond.add(secondIndex);
      }
      secondIndex += 1;
    }

    const matchedSecond: ParsedCue[] = [];
    let cursor = secondIndex;

    while (second[cursor] && second[cursor].start < firstCue.end) {
      if (!consumedSecond.has(cursor) && overlaps(firstCue, second[cursor])) {
        matchedSecond.push(second[cursor]);
        consumedSecond.add(cursor);
      }
      cursor += 1;
    }

    if (!matchedSecond.length && second[secondIndex]) {
      const candidate = second[secondIndex];
      if (midpointDistance(firstCue, candidate) <= 1.5) {
        matchedSecond.push(candidate);
        consumedSecond.add(secondIndex);
      }
    }

    pushSegment(segments, [firstCue], matchedSecond);
  });

  second.forEach((secondCue, index) => {
    if (!consumedSecond.has(index)) {
      pushSegment(segments, [], [secondCue]);
    }
  });

  return segments.sort((left, right) => left.start - right.start);
};

export const parseSubtitleText = (content: string, fileName: string) => {
  const lowerName = fileName.toLowerCase();
  const cues = lowerName.endsWith(".vtt") ? parseVtt(content) : parseSrt(content);
  return {
    cues,
    duration: cues.length ? cues[cues.length - 1].end : 0,
  } satisfies ParsedSubtitleFile;
};

export const validateSubtitlePair = (first: ParsedSubtitleFile, second: ParsedSubtitleFile) => {
  if (!first.cues.length || !second.cues.length) {
    return "Both subtitle files need at least one valid cue.";
  }

  const durationDifference = Math.abs(first.duration - second.duration);
  const longestDuration = Math.max(first.duration, second.duration, 1);
  const cueCountRatio = Math.max(first.cues.length, second.cues.length) /
    Math.max(1, Math.min(first.cues.length, second.cues.length));

  if (durationDifference > Math.max(8, longestDuration * 0.12)) {
    return "The subtitle files appear to have different total durations.";
  }

  if (cueCountRatio > 3) {
    return "The subtitle files have very different cue counts and may not match the same video.";
  }

  return null;
};

export const extractYouTubeVideoId = (input: string) => {
  const value = input.trim();
  const match = value.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)?([A-Za-z0-9_-]{11})/,
  );

  return match?.[1] ?? null;
};

export const getYouTubeThumbnailUrl = (videoId: string) =>
  `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
