import { useEffect, useRef, useState } from "react";
import type { YouTubePlayer } from "@/types/youtube";

let apiLoadPromise: Promise<void> | null = null;

const loadYouTubeApi = () => {
  if (window.YT?.Player) {
    return Promise.resolve();
  }

  if (apiLoadPromise) {
    return apiLoadPromise;
  }

  apiLoadPromise = new Promise((resolve) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://www.youtube.com/iframe_api"]',
    );

    if (existingScript) {
      const previousReady = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previousReady?.();
        resolve();
      };
      return;
    }

    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;

    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      resolve();
    };

    document.body.appendChild(script);
  });

  return apiLoadPromise;
};

const isReadyPlayer = (player: YouTubePlayer | null): player is YouTubePlayer =>
  Boolean(
    player &&
      typeof player.getCurrentTime === "function" &&
      typeof player.getDuration === "function" &&
      typeof player.seekTo === "function" &&
      typeof player.playVideo === "function" &&
      typeof player.pauseVideo === "function",
  );

interface UseYouTubePlayerOptions {
  playbackRate: 0.5 | 0.75 | 1;
  preferredCaptionLanguage: string;
  showCaptions: boolean;
}

const applyPlayerSettings = (player: YouTubePlayer, options: UseYouTubePlayerOptions) => {
  player.setPlaybackRate?.(options.playbackRate);

  if (options.showCaptions) {
    player.loadModule?.("captions");
    player.setOption?.("captions", "track", { languageCode: options.preferredCaptionLanguage });
    player.setOption?.("captions", "reload", true);
  } else {
    player.unloadModule?.("captions");
  }
};

export function useYouTubePlayer(videoId: string, options: UseYouTubePlayerOptions) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const intervalRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const playerStateRef = useRef<number | null>(null);
  const [ready, setReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let createdPlayer: YouTubePlayer | null = null;

    const clearTicker = () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    const startTicker = () => {
      clearTicker();
      intervalRef.current = window.setInterval(syncFromPlayer, 250);
    };

    const syncFromPlayer = () => {
      const player = playerRef.current;
      if (!isReadyPlayer(player)) {
        return;
      }

      const nextTime = player.getCurrentTime();
      const nextDuration = player.getDuration();

      if (!Number.isFinite(nextTime) || !Number.isFinite(nextDuration) || nextDuration <= 0) {
        return;
      }

      if (!mountedRef.current || cancelled) {
        return;
      }

      setCurrentTime(nextTime);
      setDuration(nextDuration);
    };

    setReady(false);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    playerRef.current = null;

    loadYouTubeApi().then(() => {
      if (cancelled || !hostRef.current || !window.YT?.Player) {
        return;
      }

      hostRef.current.replaceChildren();

      createdPlayer = new window.YT.Player(hostRef.current, {
        host: "https://www.youtube-nocookie.com",
        videoId,
        playerVars: {
          autoplay: 0,
          cc_lang_pref: "en",
          cc_load_policy: 1,
          controls: 1,
          enablejsapi: 1,
          fs: 1,
          hl: "en",
          iv_load_policy: 3,
          modestbranding: 1,
          origin: window.location.origin,
          playsinline: 1,
          rel: 0,
        },
        events: {
          onReady: (event) => {
            if (cancelled || !mountedRef.current) {
              event.target.destroy();
              return;
            }

            const nextPlayer = event.target;
            if (!isReadyPlayer(nextPlayer)) {
              return;
            }

            playerRef.current = nextPlayer;
            applyPlayerSettings(nextPlayer, options);
            setReady(true);
            syncFromPlayer();
          },
          onStateChange: (event) => {
            const state = window.YT?.PlayerState;
            if (!state || cancelled || !mountedRef.current) {
              return;
            }

            playerStateRef.current = event.data;
            setIsPlaying(event.data === state.PLAYING);

            if (event.data === state.PLAYING) {
              syncFromPlayer();
              startTicker();
              return;
            }

            clearTicker();

            if (event.data === state.PAUSED || event.data === state.ENDED) {
              syncFromPlayer();
            }
          },
        },
      });
    });

    return () => {
      cancelled = true;
      clearTicker();

      if (isReadyPlayer(playerRef.current) && typeof playerRef.current.destroy === "function") {
        playerRef.current.destroy();
      } else if (createdPlayer && typeof createdPlayer.destroy === "function") {
        createdPlayer.destroy();
      }

      playerRef.current = null;
      playerStateRef.current = null;
    };
  }, [videoId]);

  useEffect(() => {
    if (!isReadyPlayer(playerRef.current)) {
      return;
    }

    applyPlayerSettings(playerRef.current, options);
  }, [options]);

  return {
    currentTime,
    duration,
    hostRef,
    isPlaying,
    ready,
    play: () => {
      if (isReadyPlayer(playerRef.current)) {
        playerRef.current.playVideo();
      }
    },
    pause: () => {
      if (isReadyPlayer(playerRef.current)) {
        playerRef.current.pauseVideo();
      }
    },
    seekTo: (seconds: number) => {
      if (isReadyPlayer(playerRef.current)) {
        playerRef.current.seekTo(seconds, true);
        setCurrentTime(seconds);
        window.setTimeout(() => {
          if (mountedRef.current) {
            const player = playerRef.current;
            if (isReadyPlayer(player)) {
              const nextDuration = player.getDuration();
              if (Number.isFinite(nextDuration) && nextDuration > 0) {
                setDuration(nextDuration);
              }
            }
          }
        }, 150);
      }
    },
  };
}
