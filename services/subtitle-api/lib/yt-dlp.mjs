import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { normalizeTrack, parseSubtitleContent } from "./subtitles.mjs";

const execFileAsync = promisify(execFile);
const cookiesPath = process.env.YTDLP_COOKIES_PATH;

const getBaseArgs = () => {
  const args = ["--js-runtimes", "node"];

  if (cookiesPath) {
    args.push("--cookies", cookiesPath);
  }

  return args;
};

const parseTrackLine = (line, origin) => {
  const match = line.match(/^\s*([A-Za-z0-9_-]+)(?:\s+([^\[]+?))?\s+vtt\b/i);
  if (!match) {
    return null;
  }

  const [, languageCode, rawLabel] = match;
  const trackId = origin === "auto" ? `${languageCode}-auto` : languageCode;

  return normalizeTrack({
    id: trackId,
    languageCode,
    origin,
    format: "vtt",
    languageLabel: rawLabel?.trim(),
  });
};

const parseListSubsOutput = (stdout) => {
  const lines = stdout.split("\n");
  const tracks = [];
  let currentSection = null;

  lines.forEach((line) => {
    if (line.includes("Language") && line.includes("Formats")) {
      return;
    }

    if (line.includes("Available subtitles for")) {
      currentSection = "manual";
      return;
    }

    if (line.includes("Available automatic captions for")) {
      currentSection = "auto";
      return;
    }

    if (!currentSection || !line.trim()) {
      return;
    }

    const track = parseTrackLine(line, currentSection);
    if (track) {
      tracks.push(track);
    }
  });

  return tracks;
};

export const discoverYouTubeSubtitles = async (url) => {
  const { stdout } = await execFileAsync(
    "yt-dlp",
    [...getBaseArgs(), "--skip-download", "--list-subs", url],
    {
      maxBuffer: 10 * 1024 * 1024,
    },
  );

  const titleMatch = stdout.match(/\[info\] Available subtitles for .*?:\s*(.+)/);
  const autoTitleMatch = stdout.match(/\[info\] Available automatic captions for .*?:\s*(.+)/);

  return {
    title: titleMatch?.[1] ?? autoTitleMatch?.[1] ?? null,
    tracks: parseListSubsOutput(stdout),
  };
};

const buildSubtitleArgs = (languageCode, origin, outputTemplate, url) => {
  const args = [...getBaseArgs(), "--skip-download", "--sub-format", "vtt", "-o", outputTemplate];

  if (origin === "auto") {
    args.push("--write-auto-sub");
  } else {
    args.push("--write-sub");
  }

  args.push("--sub-lang", languageCode, url);
  return args;
};

const findDownloadedSubtitle = async (directory) => {
  const files = await fs.readdir(directory);
  const match = files.find((file) => file.endsWith(".vtt") || file.endsWith(".srt"));
  if (!match) {
    throw new Error("No subtitle file was downloaded.");
  }

  return path.join(directory, match);
};

export const downloadTrack = async (url, trackId) => {
  const origin = trackId.endsWith("-auto") ? "auto" : "manual";
  const languageCode = origin === "auto" ? trackId.replace(/-auto$/, "") : trackId;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "linguasync-track-"));
  const outputTemplate = path.join(directory, "subtitle.%(ext)s");

  try {
    await execFileAsync("yt-dlp", buildSubtitleArgs(languageCode, origin, outputTemplate, url), {
      maxBuffer: 10 * 1024 * 1024,
    });

    const filePath = await findDownloadedSubtitle(directory);
    const content = await fs.readFile(filePath, "utf8");
    const format = filePath.endsWith(".srt") ? "srt" : "vtt";

    return {
      track: normalizeTrack({ id: trackId, languageCode, origin, format }),
      cues: parseSubtitleContent(content, format),
      raw: content,
    };
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
};
