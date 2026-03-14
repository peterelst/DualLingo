import http from "node:http";
import crypto from "node:crypto";

import { buildMergedSegments } from "./lib/subtitles.mjs";
import { discoverYouTubeSubtitles, downloadTrack } from "./lib/yt-dlp.mjs";

const port = Number(process.env.PORT ?? 8789);
const jobs = new Map();
const queue = [];
let activeJobId = null;

const sendJson = (response, statusCode, payload) => {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload, null, 2));
};

const readBody = (request) =>
  new Promise((resolve, reject) => {
    const chunks = [];

    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(new Error("Request body must be valid JSON."));
      }
    });
    request.on("error", reject);
  });

const getSourceUrl = (body) => body?.source?.url;
const getTrackIds = (body) => (Array.isArray(body?.trackIds) ? body.trackIds.filter(Boolean) : []);

const getQueuePosition = (jobId) => {
  const index = queue.findIndex((queuedJobId) => queuedJobId === jobId);
  return index === -1 ? null : index + 1;
};

const serializeJob = (job) => ({
  id: job.id,
  status: job.status,
  createdAt: job.createdAt,
  startedAt: job.startedAt,
  completedAt: job.completedAt,
  error: job.error,
  source: job.source,
  trackIds: job.trackIds,
  queuePosition: job.status === "queued" ? getQueuePosition(job.id) : null,
  result: job.status === "completed" ? job.result : null,
});

const runNextJob = async () => {
  if (activeJobId || !queue.length) {
    return;
  }

  const nextJobId = queue.shift();
  const job = jobs.get(nextJobId);

  if (!job) {
    await runNextJob();
    return;
  }

  activeJobId = nextJobId;
  job.status = "running";
  job.startedAt = new Date().toISOString();
  job.error = null;

  try {
    const tracks = await Promise.all(job.trackIds.map((trackId) => downloadTrack(job.source.url, trackId)));
    const segments = buildMergedSegments(tracks);

    job.status = "completed";
    job.completedAt = new Date().toISOString();
    job.result = {
      source: job.source,
      tracks: tracks.map(({ track }) => track),
      segments,
    };
  } catch (error) {
    job.status = "failed";
    job.completedAt = new Date().toISOString();
    job.error = error.message;
  } finally {
    activeJobId = null;
    void runNextJob();
  }
};

const handleDiscover = async (body, response) => {
  const url = getSourceUrl(body);
  if (!url) {
    sendJson(response, 400, { error: "source.url is required" });
    return;
  }

  const result = await discoverYouTubeSubtitles(url);
  sendJson(response, 200, {
    source: body.source,
    title: result.title,
    tracks: result.tracks,
  });
};

const handleMerge = async (body, response) => {
  const url = getSourceUrl(body);
  const trackIds = getTrackIds(body);

  if (!url) {
    sendJson(response, 400, { error: "source.url is required" });
    return;
  }

  if (!trackIds.length) {
    sendJson(response, 400, { error: "trackIds must contain at least one subtitle track id" });
    return;
  }

  const job = {
    id: crypto.randomUUID(),
    status: "queued",
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    error: null,
    source: body.source,
    trackIds,
    result: null,
  };

  jobs.set(job.id, job);
  queue.push(job.id);
  void runNextJob();

  sendJson(response, 202, serializeJob(job));
};

const handleGetJob = (request, response) => {
  const match = request.url?.match(/^\/v1\/jobs\/([^/]+)$/);
  const jobId = match?.[1];

  if (!jobId) {
    sendJson(response, 404, { error: "Not found" });
    return;
  }

  const job = jobs.get(jobId);
  if (!job) {
    sendJson(response, 404, { error: "Job not found" });
    return;
  }

  sendJson(response, 200, serializeJob(job));
};

const server = http.createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    sendJson(response, 200, {
      ok: true,
      activeJobId,
      queuedJobs: queue.length,
      totalJobs: jobs.size,
    });
    return;
  }

  if (request.method === "POST" && request.url === "/v1/subtitles/discover") {
    try {
      const body = await readBody(request);
      await handleDiscover(body, response);
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  if (request.method === "POST" && request.url === "/v1/subtitles/merge") {
    try {
      const body = await readBody(request);
      await handleMerge(body, response);
    } catch (error) {
      sendJson(response, 500, { error: error.message });
    }
    return;
  }

  if (request.method === "GET" && request.url?.startsWith("/v1/jobs/")) {
    handleGetJob(request, response);
    return;
  }

  sendJson(response, 404, { error: "Not found" });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Subtitle API listening on port ${port}`);
});
