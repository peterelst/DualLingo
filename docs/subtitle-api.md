# Subtitle API

This is a private-development subtitle service intended for a Hostinger VPS or any Docker-capable box.

## What it does

- `POST /v1/subtitles/discover`
  - lists all subtitle tracks `yt-dlp` can see for a YouTube URL
- `POST /v1/subtitles/merge`
  - creates a merge job for the selected tracks
- `GET /v1/jobs/:jobId`
  - returns the current job status
  - includes the merged segments keyed by track id once complete

## Run locally

```bash
docker compose -f docker-compose.subtitle-api.yml up --build
```

For YouTube, you will likely need cookies from a real browser session because server IPs often hit the "Sign in to confirm you're not a bot" wall.

Create this file before starting the container:

```bash
mkdir -p secrets
```

Then save your exported YouTube cookies as:

```bash
secrets/youtube-cookies.txt
```

The compose file mounts that path into the container automatically.

Health check:

```bash
curl -i http://localhost:8789/health
```

## Discover example

```bash
curl -sS -X POST http://localhost:8789/v1/subtitles/discover \
  -H 'content-type: application/json' \
  --data '{
    "source": {
      "kind": "youtube",
      "url": "https://www.youtube.com/watch?v=CT1DO_KyOek"
    }
  }'
```

## Merge example

```bash
curl -sS -X POST http://localhost:8789/v1/subtitles/merge \
  -H 'content-type: application/json' \
  --data '{
    "source": {
      "kind": "youtube",
      "url": "https://www.youtube.com/watch?v=CT1DO_KyOek"
    },
    "trackIds": ["en", "ga"]
  }'
```

Example response:

```json
{
  "id": "job-id",
  "status": "queued",
  "createdAt": "2025-03-04T16:00:00.000Z",
  "startedAt": null,
  "completedAt": null,
  "error": null,
  "source": {
    "kind": "youtube",
    "url": "https://www.youtube.com/watch?v=CT1DO_KyOek"
  },
  "trackIds": ["en", "ga"],
  "queuePosition": 1,
  "result": null
}
```

## Poll a job

```bash
curl -sS http://localhost:8789/v1/jobs/JOB_ID
```

Job statuses:

- `queued`
- `running`
- `completed`
- `failed`

When a job is `completed`, `result.segments` contains the merged output.

## Track ids

- Manual subtitles use the language code directly, for example `en` or `ga`
- Auto subtitles use `-auto`, for example `en-auto`

## Hostinger VPS

1. Create the VPS with the Docker template.
2. Copy this repo to the VPS.
3. Create a cookies directory:

```bash
mkdir -p /root/DualLingo/secrets
```

4. Export your YouTube cookies from your browser in Netscape format and upload them to:

```bash
/root/DualLingo/secrets/youtube-cookies.txt
```

5. Run:

```bash
docker compose -f docker-compose.subtitle-api.yml up --build -d
```

6. Test:

```bash
curl -i http://YOUR_VPS_IP:8789/health
```

This queue is intentionally simple and process-local for private development. Restarting the container clears queued jobs and completed results. Add persistent storage and authentication later.
