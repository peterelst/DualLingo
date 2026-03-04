import {
  Check,
  FolderOpen,
  Pencil,
  Plus,
  Search,
  Settings2,
  Trash2,
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
import currentDemoTranscript from "@/data/fRaUe_ZkjnA.dual.json";
import alternateDemoTranscript from "@/data/CT1DO_KyOek.dual.json";
import thirdDemoTranscript from "@/data/5xPYXF3W7jA.dual.json";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useYouTubePlayer } from "@/hooks/use-youtube-player";
import {
  buildDualTranscript,
  extractYouTubeVideoId,
  fetchYouTubeVideoTitle,
  getYouTubeThumbnailUrl,
  parseSubtitleText,
  validateSubtitlePair,
} from "@/lib/subtitles";
import {
  deleteVideo,
  listSavedVideos,
  saveVideo,
  type SavedVideoLibraryEntry,
} from "@/lib/video-library";
import { cn } from "@/lib/utils";
import type { TranscriptSegment } from "@/types/youtube";

const DEFAULT_VIDEO_ID = "fRaUe_ZkjnA";
const PLAYBACK_RATES = [0.5, 0.75, 1] as const;
const DEMO_VIDEOS = [
  {
    id: "fRaUe_ZkjnA",
    title: "Ros na Rún",
    subtitle: "Season 8, episode 5",
    segments: currentDemoTranscript as TranscriptSegment[],
  },
  {
    id: "CT1DO_KyOek",
    title: "Ros na Rún",
    subtitle: "Season 8, episode 70",
    segments: alternateDemoTranscript as TranscriptSegment[],
  },
  {
    id: "5xPYXF3W7jA",
    title: "Ros na Rún",
    subtitle: "Season 8, episode 61",
    segments: thirdDemoTranscript as TranscriptSegment[],
  },
] as const;

const formatTime = (seconds: number) => {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainder = totalSeconds % 60;
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
};

const isSupportedSubtitleFile = (file: File) => /\.(vtt|srt)$/i.test(file.name);

const loadViewerState = (
  videoId: string,
  segments: TranscriptSegment[],
  firstTrackLabel: string,
  secondTrackLabel: string,
  firstTrackCode: string,
  secondTrackCode: string,
) => ({
  videoId,
  thumbnailUrl: getYouTubeThumbnailUrl(videoId),
  segments,
  firstTrackLabel,
  secondTrackLabel,
  firstTrackCode,
  secondTrackCode,
});

function App() {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [viewerState, setViewerState] = useState(
    loadViewerState(DEFAULT_VIDEO_ID, currentDemoTranscript as TranscriptSegment[], "English", "Irish", "en", "ga"),
  );
  const [showSetupPanel, setShowSetupPanel] = useState(false);
  const [showDemoMenu, setShowDemoMenu] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showNoticeBanner, setShowNoticeBanner] = useState(true);
  const [pendingVideoInput, setPendingVideoInput] = useState(DEFAULT_VIDEO_ID);
  const [pendingFirstFile, setPendingFirstFile] = useState<File | null>(null);
  const [pendingSecondFile, setPendingSecondFile] = useState<File | null>(null);
  const [pendingVideoTitle, setPendingVideoTitle] = useState("");
  const [setupError, setSetupError] = useState<string | null>(null);
  const [isApplyingSetup, setIsApplyingSetup] = useState(false);
  const [editingSavedVideoId, setEditingSavedVideoId] = useState<string | null>(null);
  const [editingSavedVideoTitle, setEditingSavedVideoTitle] = useState("");
  const [showCaptions, setShowCaptions] = useState(true);
  const [captionTrackTarget, setCaptionTrackTarget] = useState<"primary" | "secondary">("primary");
  const [playbackRate, setPlaybackRate] = useState<(typeof PLAYBACK_RATES)[number]>(1);
  const [savedVideos, setSavedVideos] = useState<SavedVideoLibraryEntry[]>([]);
  const [thumbnailStatus, setThumbnailStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const transcriptScrollerRef = useRef<HTMLDivElement | null>(null);
  const lastScrollTargetRef = useRef<number | null>(null);
  const scrollAnimationFrameRef = useRef<number | null>(null);
  const settingsMenuRef = useRef<HTMLDivElement | null>(null);
  const demoMenuRef = useRef<HTMLDivElement | null>(null);
  const isPendingTitleDirtyRef = useRef(false);

  const pendingVideoId = useMemo(() => extractYouTubeVideoId(pendingVideoInput), [pendingVideoInput]);
  const playerOptions = useMemo(
    () => ({
      playbackRate,
      preferredCaptionLanguage:
        captionTrackTarget === "primary"
          ? viewerState.firstTrackCode
          : viewerState.secondTrackCode,
      showCaptions,
    }),
    [
      captionTrackTarget,
      playbackRate,
      showCaptions,
      viewerState.firstTrackCode,
      viewerState.secondTrackCode,
    ],
  );
  const { currentTime, hostRef, seekTo } = useYouTubePlayer(viewerState.videoId, playerOptions);

  useEffect(() => {
    let cancelled = false;

    listSavedVideos()
      .then((entries) => {
        if (!cancelled) {
          setSavedVideos(entries);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSavedVideos([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

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
    if (!showDemoMenu) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!demoMenuRef.current?.contains(event.target as Node)) {
        setShowDemoMenu(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [showDemoMenu]);

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

  useEffect(() => {
    if (!pendingVideoId) {
      setPendingVideoTitle("");
      isPendingTitleDirtyRef.current = false;
      return;
    }

    let cancelled = false;
    const requestedVideoId = pendingVideoId;

    fetchYouTubeVideoTitle(requestedVideoId)
      .then((title) => {
        if (cancelled || !title || isPendingTitleDirtyRef.current || pendingVideoId !== requestedVideoId) {
          return;
        }

        setPendingVideoTitle(title);
      })
      .catch(() => {
        if (!cancelled && !isPendingTitleDirtyRef.current && pendingVideoId === requestedVideoId) {
          setPendingVideoTitle("");
        }
      });

    return () => {
      cancelled = true;
    };
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

  useEffect(() => {
    const container = transcriptScrollerRef.current;
    if (!container) {
      return;
    }

    if (scrollAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollAnimationFrameRef.current);
      scrollAnimationFrameRef.current = null;
    }

    container.scrollTop = 0;
    lastScrollTargetRef.current = 0;
  }, [viewerState.videoId]);

  const getSeekTimestamp = (segment: TranscriptSegment) => segment.irishStart ?? segment.start;
  const isSetupReady =
    Boolean(pendingVideoId) &&
    Boolean(pendingFirstFile) &&
    Boolean(pendingSecondFile) &&
    !isApplyingSetup;

  const resetSetupPanel = (nextVideoId?: string) => {
    setPendingVideoInput(nextVideoId ?? viewerState.videoId);
    setPendingFirstFile(null);
    setPendingSecondFile(null);
    setPendingVideoTitle("");
    isPendingTitleDirtyRef.current = false;
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

      const firstTrackLabel = firstParsed.languageLabel ?? "Primary";
      const secondTrackLabel = secondParsed.languageLabel ?? "Secondary";
      const firstTrackCode = firstParsed.languageCode ?? "en";
      const secondTrackCode = secondParsed.languageCode ?? "ga";
      const nextViewerState = loadViewerState(
        pendingVideoId,
        segments,
        firstTrackLabel,
        secondTrackLabel,
        firstTrackCode,
        secondTrackCode,
      );
      const nextSavedVideo: SavedVideoLibraryEntry = {
        id: `${pendingVideoId}:${firstTrackLabel}:${secondTrackLabel}`,
        videoId: pendingVideoId,
        thumbnailUrl: getYouTubeThumbnailUrl(pendingVideoId),
        segments,
        firstTrackLabel,
        secondTrackLabel,
        firstTrackCode,
        secondTrackCode,
        title: pendingVideoTitle.trim() || pendingVideoId,
        subtitle: `${firstTrackLabel} / ${secondTrackLabel}`,
        createdAt: new Date().toISOString(),
      };

      setViewerState(nextViewerState);
      setSavedVideos((current) => {
        const remaining = current.filter((entry) => entry.id !== nextSavedVideo.id);
        return [nextSavedVideo, ...remaining];
      });
      void saveVideo(nextSavedVideo);
      setQuery("");
      resetSetupPanel(pendingVideoId);
    } catch {
      setSetupError("The uploaded subtitle files could not be parsed.");
    } finally {
      setIsApplyingSetup(false);
    }
  };

  const removeSavedVideo = (id: string) => {
    setSavedVideos((current) => current.filter((entry) => entry.id !== id));
    void deleteVideo(id);
  };

  const saveEditedVideoTitle = (id: string) => {
    const nextTitle = editingSavedVideoTitle.trim();
    if (!nextTitle) {
      return;
    }

    setSavedVideos((current) =>
      current.map((entry) => {
        if (entry.id !== id) {
          return entry;
        }

        const nextEntry = { ...entry, title: nextTitle };
        void saveVideo(nextEntry);
        return nextEntry;
      }),
    );
    setEditingSavedVideoId(null);
    setEditingSavedVideoTitle("");
  };

  return (
    <main className="flex h-screen w-full flex-col overflow-hidden">
      {showNoticeBanner && (
        <div className="fixed inset-x-0 top-0 z-40 flex items-center justify-between gap-4 bg-indigo-800 px-4 py-3 text-sm text-white sm:static sm:px-6">
          <p className="text-white">
            This is a prototype tool strictly for educational purposes. Rights for the video and
            subtitles remain with the original rights holders. 🙏🏻
          </p>
          <button
            type="button"
            onClick={() => setShowNoticeBanner(false)}
            className="rounded-full p-1 text-white/90 transition hover:bg-white/10 hover:text-white"
            aria-label="Dismiss notice"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex-1 overflow-hidden px-3 py-3 sm:px-4 sm:py-4 lg:px-6 lg:py-6">
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
              </div>

              <div className="flex items-center gap-2">
                <div ref={demoMenuRef} className="relative">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowDemoMenu((value) => !value)}
                    aria-expanded={showDemoMenu}
                    aria-label="Open demo videos"
                    className="px-3 sm:px-4"
                  >
                    <FolderOpen className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">Load video</span>
                  </Button>

                  {showDemoMenu && (
                    <>
                      <div
                        className="fixed inset-0 z-20 bg-stone-950/25 sm:hidden"
                        onClick={() => setShowDemoMenu(false)}
                      />
                      <div className="fixed inset-x-3 bottom-3 z-30 rounded-[24px] border border-border/70 bg-white/95 p-4 shadow-[0_30px_60px_-35px_rgba(17,24,39,0.45)] backdrop-blur-xl sm:absolute sm:left-0 sm:top-12 sm:bottom-auto sm:right-auto sm:w-72">
                        <div className="space-y-3">
                          <div>
                            <p className="text-sm font-semibold">Video library</p>
                          </div>

                          {DEMO_VIDEOS.map((demo) => (
                            <button
                              key={demo.id}
                              type="button"
                              onClick={() => {
                                setViewerState(
                                  loadViewerState(
                                    demo.id,
                                    demo.segments,
                                    "English",
                                    "Irish",
                                    "en",
                                    "ga",
                                  ),
                                );
                                setQuery("");
                                setPendingVideoInput(demo.id);
                                setShowDemoMenu(false);
                              }}
                              className={cn(
                                "w-full rounded-[20px] border px-4 py-3 text-left transition",
                                viewerState.videoId === demo.id
                                  ? "border-[hsl(93_95%_34%)] bg-primary/10 hover:bg-primary/15"
                                  : "border-border/70 bg-white/80 hover:bg-white",
                              )}
                            >
                              <p className="text-sm font-semibold">{demo.title}</p>
                              <p className="mt-1 text-xs text-muted-foreground">{demo.subtitle}</p>
                            </button>
                          ))}

                          {savedVideos.length > 0 ? (
                            <>
                              {savedVideos.map((video) => (
                                <div
                                  key={video.id}
                                  className={cn(
                                    "flex items-start gap-2 rounded-[20px] border px-3 py-3 transition",
                                    viewerState.videoId === video.videoId &&
                                      viewerState.firstTrackLabel === video.firstTrackLabel &&
                                      viewerState.secondTrackLabel === video.secondTrackLabel
                                      ? "border-amber-300 bg-amber-100/90"
                                      : "border-amber-200/80 bg-amber-50/80",
                                  )}
                                >
                                  <div className="min-w-0 flex-1 px-1 text-left">
                                    {editingSavedVideoId === video.id ? (
                                      <Input
                                        value={editingSavedVideoTitle}
                                        onChange={(event) => setEditingSavedVideoTitle(event.target.value)}
                                        onClick={(event) => event.stopPropagation()}
                                        onKeyDown={(event) => {
                                          if (event.key === "Enter") {
                                            event.preventDefault();
                                            saveEditedVideoTitle(video.id);
                                          }
                                        }}
                                        className="h-9"
                                        autoFocus
                                      />
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setViewerState(
                                            loadViewerState(
                                              video.videoId,
                                              video.segments,
                                              video.firstTrackLabel,
                                              video.secondTrackLabel,
                                              video.firstTrackCode,
                                              video.secondTrackCode,
                                            ),
                                          );
                                          setQuery("");
                                          setPendingVideoInput(video.videoId);
                                          setShowDemoMenu(false);
                                        }}
                                        className="block w-full text-left"
                                      >
                                        <p className="text-sm font-semibold">{video.title}</p>
                                      </button>
                                    )}
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      {video.subtitle}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      if (editingSavedVideoId === video.id) {
                                        saveEditedVideoTitle(video.id);
                                        return;
                                      }

                                      setEditingSavedVideoId(video.id);
                                      setEditingSavedVideoTitle(video.title);
                                    }}
                                    className="rounded-full p-2 text-muted-foreground transition hover:bg-white/70 hover:text-foreground"
                                    aria-label={
                                      editingSavedVideoId === video.id
                                        ? `Save title for ${video.title}`
                                        : `Edit title for ${video.title}`
                                    }
                                  >
                                    {editingSavedVideoId === video.id ? (
                                      <Check className="h-4 w-4" />
                                    ) : (
                                      <Pencil className="h-4 w-4" />
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      removeSavedVideo(video.id);
                                    }}
                                    className="rounded-full p-2 text-muted-foreground transition hover:bg-stone-100 hover:text-foreground"
                                    aria-label={`Delete saved video ${video.title}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              ))}
                            </>
                          ) : (
                            <div className="rounded-[20px] border border-dashed border-border/70 bg-white/70 px-4 py-3 text-xs text-muted-foreground">
                              Your added videos will show up here
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>

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
                  aria-label="Set up a new video"
                  className="px-3 sm:px-4"
                >
                  <Plus className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Add video</span>
                </Button>

                <div ref={settingsMenuRef} className="relative">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowSettingsMenu((value) => !value)}
                    aria-expanded={showSettingsMenu}
                    aria-label="Open player settings"
                    className="px-3 sm:px-4"
                  >
                    <Settings2 className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">Settings</span>
                  </Button>

                  {showSettingsMenu && (
                    <>
                      <div
                        className="fixed inset-0 z-20 bg-stone-950/25 sm:hidden"
                        onClick={() => setShowSettingsMenu(false)}
                      />
                      <div className="fixed inset-x-3 bottom-3 z-30 rounded-[24px] border border-border/70 bg-white/95 p-4 shadow-[0_30px_60px_-35px_rgba(17,24,39,0.45)] backdrop-blur-xl sm:absolute sm:right-0 sm:top-12 sm:bottom-auto sm:left-auto sm:w-64">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold">Video subtitles</p>
                          <button
                            type="button"
                            onClick={() => setShowCaptions((value) => !value)}
                            className={cn(
                              "relative h-7 w-12 rounded-full transition",
                              showCaptions ? "bg-emerald-700" : "bg-muted",
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
                          <p className="text-sm font-semibold">Subtitle language</p>
                          <div className="mt-2 flex gap-2">
                            <button
                              type="button"
                              disabled={!showCaptions}
                              onClick={() => setCaptionTrackTarget("primary")}
                              className={cn(
                                "rounded-full border px-3 py-1 text-sm font-semibold transition",
                                showCaptions
                                  ? captionTrackTarget === "primary"
                                    ? "border-[hsl(93_95%_34%)] bg-primary/10 text-foreground"
                                    : "border-border/70 bg-white/70 text-muted-foreground hover:bg-white"
                                  : "cursor-not-allowed border-border/60 bg-muted/50 text-muted-foreground/70",
                              )}
                            >
                              {viewerState.firstTrackLabel}
                            </button>
                            <button
                              type="button"
                              disabled={!showCaptions}
                              onClick={() => setCaptionTrackTarget("secondary")}
                              className={cn(
                                "rounded-full border px-3 py-1 text-sm font-semibold transition",
                                showCaptions
                                  ? captionTrackTarget === "secondary"
                                    ? "border-[hsl(93_95%_34%)] bg-primary/10 text-foreground"
                                    : "border-border/70 bg-white/70 text-muted-foreground hover:bg-white"
                                  : "cursor-not-allowed border-border/60 bg-muted/50 text-muted-foreground/70",
                              )}
                            >
                              {viewerState.secondTrackLabel}
                            </button>
                          </div>
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

                        <div className="pt-3">
                          <a
                            href="https://www.buymeacoffee.com/peterelst"
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center justify-center rounded-full border border-emerald-700/80 bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800"
                          >
                            <span className="mr-2 text-[1.35rem] leading-none">☕</span>
                            Buy me a coffee
                          </a>
                        </div>

                      </div>
                      </div>
                    </>
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
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-2xl font-bold">Transcript</h2>
                </div>
                <div className="group relative ml-auto w-40 shrink-0 sm:w-auto">
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
                        <span className="inline-flex rounded-full bg-emerald-800 px-3 py-1 text-xs font-semibold text-white">
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
          <div className="absolute inset-0 z-30 flex items-center justify-center overflow-y-auto bg-stone-950/30 p-4 backdrop-blur-sm">
            <div className="my-auto w-full max-w-xl rounded-[28px] border border-white/80 bg-white/95 p-5 shadow-[0_40px_90px_-40px_rgba(15,23,42,0.6)] backdrop-blur-xl sm:p-6">
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
                    onChange={(event) => {
                      isPendingTitleDirtyRef.current = false;
                      setPendingVideoInput(event.target.value);
                    }}
                    placeholder="https://www.youtube.com/watch?v=..."
                  />
                  <p className="text-xs text-muted-foreground">
                    Accepts a full YouTube URL or the 11-character video ID.
                  </p>
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-semibold" htmlFor="video-title-input">
                    Video title
                  </label>
                  <Input
                    id="video-title-input"
                    value={pendingVideoTitle}
                    onChange={(event) => {
                      isPendingTitleDirtyRef.current = true;
                      setPendingVideoTitle(event.target.value);
                    }}
                    placeholder="Video title"
                  />
                </div>

                <div className="mx-auto w-full max-w-sm overflow-hidden rounded-[20px] border border-border/70 bg-muted/40">
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
                    <span className="text-sm font-semibold">Primary subtitle (.vtt or .srt)</span>
                    <input
                      type="file"
                      accept=".vtt,.srt"
                      className="w-full rounded-[16px] border border-border/70 bg-white/70 px-3 py-2 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-primary/10 file:px-3 file:py-2 file:font-semibold file:text-foreground"
                      onChange={(event) =>
                        setPendingFirstFile(event.target.files?.[0] ?? null)
                      }
                    />
                    <p className="min-h-4 text-xs text-muted-foreground">
                      {pendingFirstFile?.name ?? ""}
                    </p>
                  </label>

                  <label className="grid gap-2">
                    <span className="text-sm font-semibold">Secondary subtitle (.vtt or .srt)</span>
                    <input
                      type="file"
                      accept=".vtt,.srt"
                      className="w-full rounded-[16px] border border-border/70 bg-white/70 px-3 py-2 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-secondary/15 file:px-3 file:py-2 file:font-semibold file:text-foreground"
                      onChange={(event) =>
                        setPendingSecondFile(event.target.files?.[0] ?? null)
                      }
                    />
                    <p className="min-h-4 text-xs text-muted-foreground">
                      {pendingSecondFile?.name ?? ""}
                    </p>
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
                  <Button
                    type="button"
                    onClick={applyNewVideo}
                    disabled={!isSetupReady}
                    className="bg-emerald-700 text-white hover:bg-emerald-800"
                  >
                    {isApplyingSetup ? "Preparing..." : "Prepare video"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
        </section>
      </div>
    </main>
  );
}

export default App;
