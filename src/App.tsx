import {
  Film,
  Search,
  Settings2,
  Upload,
  X,
} from "lucide-react";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import demoTranscript from "@/data/fRaUe_ZkjnA.dual.json";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useYouTubePlayer } from "@/hooks/use-youtube-player";
import {
  buildDualTranscript,
  extractYouTubeVideoId,
  getYouTubeThumbnailUrl,
  parseSubtitleText,
  validateSubtitlePair,
} from "@/lib/subtitles";
import { cn } from "@/lib/utils";
import type { TranscriptSegment } from "@/types/youtube";

const DEFAULT_VIDEO_ID = "fRaUe_ZkjnA";
const PLAYBACK_RATES = [0.5, 0.75, 1] as const;

const formatTime = (seconds: number) => {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainder = totalSeconds % 60;
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
};

const stripExtension = (fileName: string) => fileName.replace(/\.(vtt|srt)$/i, "");

const isSupportedSubtitleFile = (file: File) => /\.(vtt|srt)$/i.test(file.name);

function App() {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [viewerState, setViewerState] = useState({
    videoId: DEFAULT_VIDEO_ID,
    thumbnailUrl: getYouTubeThumbnailUrl(DEFAULT_VIDEO_ID),
    segments: demoTranscript as TranscriptSegment[],
    firstTrackLabel: "English",
    secondTrackLabel: "Irish",
  });
  const [showSetupPanel, setShowSetupPanel] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [pendingVideoInput, setPendingVideoInput] = useState(DEFAULT_VIDEO_ID);
  const [pendingFirstFile, setPendingFirstFile] = useState<File | null>(null);
  const [pendingSecondFile, setPendingSecondFile] = useState<File | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [isApplyingSetup, setIsApplyingSetup] = useState(false);
  const [showCaptions, setShowCaptions] = useState(true);
  const [playbackRate, setPlaybackRate] = useState<(typeof PLAYBACK_RATES)[number]>(1);
  const [thumbnailStatus, setThumbnailStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const transcriptScrollerRef = useRef<HTMLDivElement | null>(null);
  const lastScrollTargetRef = useRef<number | null>(null);
  const scrollAnimationFrameRef = useRef<number | null>(null);
  const settingsMenuRef = useRef<HTMLDivElement | null>(null);

  const pendingVideoId = useMemo(() => extractYouTubeVideoId(pendingVideoInput), [pendingVideoInput]);
  const playerOptions = useMemo(
    () => ({
      playbackRate,
      showCaptions,
    }),
    [playbackRate, showCaptions],
  );
  const { currentTime, hostRef, seekTo } = useYouTubePlayer(viewerState.videoId, playerOptions);

  useEffect(() => {
    if (!showSettingsMenu) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!settingsMenuRef.current?.contains(event.target as Node)) {
        setShowSettingsMenu(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [showSettingsMenu]);

  useEffect(() => {
    if (!pendingVideoId) {
      setThumbnailStatus("idle");
      return;
    }

    setThumbnailStatus("loading");
    const image = new Image();
    image.src = getYouTubeThumbnailUrl(pendingVideoId);
    image.onload = () => setThumbnailStatus("ready");
    image.onerror = () => setThumbnailStatus("error");
  }, [pendingVideoId]);

  const filteredTranscript = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return viewerState.segments;
    }

    return viewerState.segments.filter((segment) =>
      `${segment.english} ${segment.irish}`.toLowerCase().includes(normalizedQuery),
    );
  }, [deferredQuery, viewerState.segments]);

  const activeSegment = useMemo(
    () =>
      viewerState.segments.find(
        (segment) => currentTime >= segment.start && currentTime < segment.end,
      ) ?? null,
    [currentTime, viewerState.segments],
  );

  const visibleActiveSegment = useMemo(
    () => filteredTranscript.find((segment) => segment.id === activeSegment?.id) ?? null,
    [activeSegment?.id, filteredTranscript],
  );

  useEffect(() => {
    if (!visibleActiveSegment) {
      lastScrollTargetRef.current = null;
      return;
    }

    const container = transcriptScrollerRef.current;
    const activeNode = itemRefs.current[visibleActiveSegment.id];

    if (!container || !activeNode) {
      return;
    }

    const topPadding = 28;
    const currentTop = container.scrollTop;
    const containerRect = container.getBoundingClientRect();
    const activeRect = activeNode.getBoundingClientRect();
    const activeTopWithinContainer = activeRect.top - containerRect.top + currentTop;
    const targetTop = Math.max(0, activeTopWithinContainer - topPadding);

    if (
      lastScrollTargetRef.current !== null &&
      Math.abs(targetTop - lastScrollTargetRef.current) < 4
    ) {
      return;
    }

    if (Math.abs(targetTop - currentTop) < 4) {
      lastScrollTargetRef.current = targetTop;
      return;
    }

    lastScrollTargetRef.current = targetTop;
    if (scrollAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollAnimationFrameRef.current);
    }

    const startTop = container.scrollTop;
    const distance = targetTop - startTop;
    const duration = 360;
    const startTime = performance.now();
    const easeOutCubic = (value: number) => 1 - Math.pow(1 - value, 3);

    const animateScroll = (now: number) => {
      const progress = Math.min(1, (now - startTime) / duration);
      container.scrollTop = startTop + distance * easeOutCubic(progress);

      if (progress < 1) {
        scrollAnimationFrameRef.current = window.requestAnimationFrame(animateScroll);
      } else {
        scrollAnimationFrameRef.current = null;
      }
    };

    scrollAnimationFrameRef.current = window.requestAnimationFrame(animateScroll);
  }, [filteredTranscript, visibleActiveSegment]);

  useEffect(
    () => () => {
      if (scrollAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollAnimationFrameRef.current);
      }
    },
    [],
  );

  const getSeekTimestamp = (segment: TranscriptSegment) => segment.irishStart ?? segment.start;

  const resetSetupPanel = (nextVideoId?: string) => {
    setPendingVideoInput(nextVideoId ?? viewerState.videoId);
    setPendingFirstFile(null);
    setPendingSecondFile(null);
    setSetupError(null);
    setShowSetupPanel(false);
  };

  const applyNewVideo = async () => {
    if (!pendingVideoId) {
      setSetupError("Enter a valid YouTube URL or 11-character video ID.");
      return;
    }

    if (!pendingFirstFile || !pendingSecondFile) {
      setSetupError("Upload both subtitle files.");
      return;
    }

    if (!isSupportedSubtitleFile(pendingFirstFile) || !isSupportedSubtitleFile(pendingSecondFile)) {
      setSetupError("Subtitle uploads must be .vtt or .srt files.");
      return;
    }

    setIsApplyingSetup(true);
    setSetupError(null);

    try {
      const [firstText, secondText] = await Promise.all([
        pendingFirstFile.text(),
        pendingSecondFile.text(),
      ]);

      const firstParsed = parseSubtitleText(firstText, pendingFirstFile.name);
      const secondParsed = parseSubtitleText(secondText, pendingSecondFile.name);
      const validationMessage = validateSubtitlePair(firstParsed, secondParsed);

      if (validationMessage) {
        setSetupError(validationMessage);
        return;
      }

      const segments = buildDualTranscript(firstParsed.cues, secondParsed.cues);
      if (!segments.length) {
        setSetupError("The uploaded subtitle files did not produce any aligned transcript rows.");
        return;
      }

      setViewerState({
        videoId: pendingVideoId,
        thumbnailUrl: getYouTubeThumbnailUrl(pendingVideoId),
        segments,
        firstTrackLabel: stripExtension(pendingFirstFile.name),
        secondTrackLabel: stripExtension(pendingSecondFile.name),
      });
      setQuery("");
      resetSetupPanel(pendingVideoId);
    } catch {
      setSetupError("The uploaded subtitle files could not be parsed.");
    } finally {
      setIsApplyingSetup(false);
    }
  };

  return (
    <main className="h-screen w-full overflow-hidden px-3 py-3 sm:px-4 sm:py-4 lg:px-6 lg:py-6">
      <section className="relative flex h-full flex-col overflow-hidden rounded-[28px] border border-white/80 bg-white/50 p-4 shadow-[0_40px_120px_-60px_rgba(31,24,19,0.75)] backdrop-blur-2xl sm:rounded-[36px] sm:p-6">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-r from-primary/20 via-transparent to-accent/30 blur-3xl" />

        <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[1.02fr_0.98fr] xl:items-stretch xl:gap-6">
          <div className="flex min-h-0 flex-col gap-4 xl:h-full">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
                  <span className="mr-2">🦉</span>
                  DualLingo
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  English and Irish subtitles synced to YouTube playback.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setPendingVideoInput(viewerState.videoId);
                    setPendingFirstFile(null);
                    setPendingSecondFile(null);
                    setSetupError(null);
                    setShowSetupPanel(true);
                  }}
                >
                  <Film className="mr-2 h-4 w-4" />
                  New video
                </Button>

                <div ref={settingsMenuRef} className="relative">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowSettingsMenu((value) => !value)}
                    aria-expanded={showSettingsMenu}
                    aria-label="Open player settings"
                  >
                    <Settings2 className="h-4 w-4" />
                  </Button>

                  {showSettingsMenu && (
                    <div className="absolute right-0 top-12 z-20 w-64 rounded-[24px] border border-border/70 bg-white/95 p-4 shadow-[0_30px_60px_-35px_rgba(17,24,39,0.45)] backdrop-blur-xl">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold">Video subtitles</p>
                            <p className="text-xs text-muted-foreground">English captions in player</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setShowCaptions((value) => !value)}
                            className={cn(
                              "relative h-7 w-12 rounded-full transition",
                              showCaptions ? "bg-primary" : "bg-muted",
                            )}
                          >
                            <span
                              className={cn(
                                "absolute top-1 h-5 w-5 rounded-full bg-white transition",
                                showCaptions ? "left-6" : "left-1",
                              )}
                            />
                          </button>
                        </div>

                        <div>
                          <p className="text-sm font-semibold">Playback speed</p>
                          <div className="mt-2 flex gap-2">
                            {PLAYBACK_RATES.map((rate) => (
                              <button
                                key={rate}
                                type="button"
                                onClick={() => setPlaybackRate(rate)}
                                className={cn(
                                  "rounded-full border px-3 py-1 text-sm font-semibold transition",
                                  playbackRate === rate
                                    ? "border-[hsl(93_95%_34%)] bg-primary/10 text-foreground"
                                    : "border-border/70 bg-white/70 text-muted-foreground hover:bg-white",
                                )}
                              >
                                {rate}x
                              </button>
                            ))}
                          </div>
                        </div>

                        <a
                          href="https://www.buymeacoffee.com/"
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center justify-center rounded-full border border-border/70 bg-white/70 px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-white"
                        >
                          Buy me a coffee
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <Card className="flex min-h-0 flex-1 overflow-hidden border-white/90 bg-stone-950 p-2 shadow-glow">
              <div className="relative flex min-h-[240px] flex-1 items-center justify-center overflow-hidden rounded-[22px] bg-black sm:min-h-[300px]">
                <img
                  src={viewerState.thumbnailUrl}
                  alt=""
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-70 blur-3xl saturate-150"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/18 via-secondary/10 to-accent/12 mix-blend-screen" />
                <div className="pointer-events-none absolute inset-0 bg-black/28" />
                <div className="relative z-10 aspect-video w-full xl:self-center">
                  <div ref={hostRef} className="h-full w-full" />
                </div>
              </div>
            </Card>
          </div>

          <Card className="flex min-h-0 flex-col overflow-hidden xl:h-full">
            <div className="border-b border-border/60 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-2xl font-bold">Transcript</h2>
                </div>
                <div className="group relative w-full sm:w-auto">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(event) => {
                      const value = event.target.value;
                      startTransition(() => setQuery(value));
                    }}
                    placeholder="Search"
                    className="h-10 w-full pl-11 sm:w-44 sm:group-focus-within:w-72 sm:focus:w-72"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-[88px_1fr_1fr] gap-3 border-b border-border/60 bg-stone-100/60 px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              <span>Time</span>
              <span>{viewerState.firstTrackLabel}</span>
              <span>{viewerState.secondTrackLabel}</span>
            </div>

            <div
              ref={transcriptScrollerRef}
              className="transcript-scrollbar min-h-0 flex-1 overflow-y-auto p-3"
            >
              <div className="space-y-3">
                {filteredTranscript.map((segment) => {
                  const isActive = segment.id === visibleActiveSegment?.id;

                  return (
                    <button
                      key={segment.id}
                      ref={(node) => {
                        itemRefs.current[segment.id] = node;
                      }}
                      type="button"
                      onClick={() => seekTo(getSeekTimestamp(segment))}
                      className={cn(
                        "grid w-full grid-cols-[88px_1fr_1fr] gap-3 rounded-[24px] border p-4 text-left transition duration-200",
                        isActive
                          ? "border-[hsl(93_95%_34%)] bg-primary/10"
                          : "border-transparent bg-white/70 hover:border-border/80 hover:bg-white",
                      )}
                    >
                      <div className="space-y-1">
                        <span className="inline-flex rounded-full bg-stone-900 px-3 py-1 text-xs font-semibold text-stone-50">
                          {formatTime(segment.start)}
                        </span>
                        <p className="text-xs text-muted-foreground">
                          {Math.max(1, Math.round(segment.end - segment.start))} sec
                        </p>
                      </div>

                      <p className="text-sm leading-6 text-foreground">
                        {segment.english || <span className="text-muted-foreground">-</span>}
                      </p>

                      <p className="text-sm leading-6 text-foreground">
                        {segment.irish || <span className="text-muted-foreground">-</span>}
                      </p>
                    </button>
                  );
                })}

                {!filteredTranscript.length && (
                  <div className="rounded-[24px] border border-dashed border-border/70 bg-white/50 p-8 text-center">
                    <p className="text-lg font-semibold">No matches</p>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>

        {showSetupPanel && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-stone-950/30 p-4 backdrop-blur-sm">
            <div className="w-full max-w-2xl rounded-[28px] border border-white/80 bg-white/95 p-6 shadow-[0_40px_90px_-40px_rgba(15,23,42,0.6)] backdrop-blur-xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-2xl font-bold">Set up a new video</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Enter a YouTube URL or ID and upload two subtitle files.
                  </p>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => resetSetupPanel()}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="mt-6 grid gap-5">
                <div className="grid gap-2">
                  <label className="text-sm font-semibold" htmlFor="youtube-input">
                    YouTube video
                  </label>
                  <Input
                    id="youtube-input"
                    value={pendingVideoInput}
                    onChange={(event) => setPendingVideoInput(event.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                  />
                  <p className="text-xs text-muted-foreground">
                    Accepts a full YouTube URL or the 11-character video ID.
                  </p>
                </div>

                <div className="overflow-hidden rounded-[24px] border border-border/70 bg-muted/40">
                  <div className="flex aspect-video items-center justify-center bg-stone-100">
                    {pendingVideoId && thumbnailStatus !== "error" ? (
                      <img
                        src={getYouTubeThumbnailUrl(pendingVideoId)}
                        alt="YouTube thumbnail preview"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="px-6 text-center text-sm text-muted-foreground">
                        {pendingVideoId
                          ? "Thumbnail preview unavailable for this video."
                          : "Enter a valid YouTube video to preview the thumbnail."}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold">First subtitle file</span>
                    <div className="flex min-h-28 items-center justify-center rounded-[24px] border border-dashed border-border/80 bg-white/70 px-4 text-center">
                      <div>
                        <Upload className="mx-auto h-5 w-5 text-muted-foreground" />
                        <p className="mt-2 text-sm font-medium">
                          {pendingFirstFile ? pendingFirstFile.name : "Upload .vtt or .srt"}
                        </p>
                      </div>
                    </div>
                    <input
                      type="file"
                      accept=".vtt,.srt"
                      className="text-sm"
                      onChange={(event) =>
                        setPendingFirstFile(event.target.files?.[0] ?? null)
                      }
                    />
                  </label>

                  <label className="grid gap-2">
                    <span className="text-sm font-semibold">Second subtitle file</span>
                    <div className="flex min-h-28 items-center justify-center rounded-[24px] border border-dashed border-border/80 bg-white/70 px-4 text-center">
                      <div>
                        <Upload className="mx-auto h-5 w-5 text-muted-foreground" />
                        <p className="mt-2 text-sm font-medium">
                          {pendingSecondFile ? pendingSecondFile.name : "Upload .vtt or .srt"}
                        </p>
                      </div>
                    </div>
                    <input
                      type="file"
                      accept=".vtt,.srt"
                      className="text-sm"
                      onChange={(event) =>
                        setPendingSecondFile(event.target.files?.[0] ?? null)
                      }
                    />
                  </label>
                </div>

                {setupError && (
                  <div className="rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {setupError}
                  </div>
                )}

                <div className="flex flex-wrap justify-end gap-3">
                  <Button type="button" variant="outline" onClick={() => resetSetupPanel()}>
                    Cancel
                  </Button>
                  <Button type="button" onClick={applyNewVideo} disabled={isApplyingSetup}>
                    {isApplyingSetup ? "Processing..." : "Load video"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

export default App;
