export interface TranscriptSegment {
  id: string;
  start: number;
  end: number;
  englishStart: number | null;
  englishEnd: number | null;
  irishStart: number | null;
  irishEnd: number | null;
  english: string;
  irish: string;
}

declare global {
  interface Window {
    YT?: {
      Player: new (
        element: HTMLElement,
        options: {
          host?: string;
          videoId: string;
          playerVars?: Record<string, string | number>;
          events?: {
            onReady?: (event: { target: YouTubePlayer }) => void;
            onStateChange?: (event: { data: number }) => void;
          };
        },
      ) => YouTubePlayer;
      PlayerState?: {
        PLAYING: number;
        PAUSED: number;
        ENDED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

export interface YouTubePlayer {
  destroy: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState?: () => number;
  loadModule?: (module: string) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  setOption?: (module: string, option: string, value: unknown) => void;
  setPlaybackRate?: (rate: number) => void;
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  unloadModule?: (module: string) => void;
}
