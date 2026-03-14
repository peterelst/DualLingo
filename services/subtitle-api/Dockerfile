FROM node:20-alpine

RUN apk add --no-cache python3 py3-pip ffmpeg \
  && pip3 install --break-system-packages yt-dlp

WORKDIR /app

COPY services/subtitle-api ./services/subtitle-api

WORKDIR /app/services/subtitle-api

ENV PORT=8789

CMD ["node", "server.mjs"]
