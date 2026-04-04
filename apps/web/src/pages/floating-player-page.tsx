import { useEffect, useState } from "react";
import { ExternalLink, MonitorUp, X } from "lucide-react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { HlsPlayer, type PlayerDiagnostics } from "@/player/hls-player";
import { buildPlayerDiagnostics } from "@/player/playback-diagnostics";
import {
  getFloatingPlayerSession,
  removeFloatingPlayerSession,
  updateFloatingPlayerSession,
  type FloatingPlayerSession,
  type FloatingPlayerSessionRuntimeState,
} from "@/player/floating-player-session";

function toRuntimeState(diagnostics: PlayerDiagnostics): FloatingPlayerSessionRuntimeState {
  return {
    status: diagnostics.status,
    isMuted: diagnostics.isMuted,
    isPaused: diagnostics.isPaused,
    volume: diagnostics.volume,
    canSeek: diagnostics.canSeek,
    isAtLiveEdge: diagnostics.isAtLiveEdge,
    liveLatencySeconds: diagnostics.liveLatencySeconds,
    pictureInPictureMode: diagnostics.pictureInPictureMode,
    isFullscreenActive: diagnostics.isFullscreenActive,
  };
}

function focusMainApp(returnPath: string) {
  const nextUrl = new URL(returnPath, window.location.origin).toString();

  try {
    if (window.opener && !window.opener.closed) {
      window.opener.focus();
      return;
    }
  } catch {
    // Accessing opener can fail when the browser changes opener policy.
  }

  window.open(nextUrl, "tv-dash-main");
}

function closeDetachedWindow(returnPath: string) {
  window.close();

  if (!window.closed) {
    window.location.replace(returnPath);
  }
}

export function FloatingPlayerPage() {
  const { sessionId = "" } = useParams();
  const [session, setSession] = useState<FloatingPlayerSession | null>(() => getFloatingPlayerSession(sessionId));
  const [playerDiagnostics, setPlayerDiagnostics] = useState<PlayerDiagnostics>(() =>
    buildPlayerDiagnostics({
      status: "loading",
      muted: session?.muted ?? true,
    }),
  );

  useEffect(() => {
    if (!session) {
      return;
    }

    document.title = `${session.title} · Floating Player · TV-Dash`;
  }, [session]);

  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key && event.key !== "tv-dash:floating-player-sessions") {
        return;
      }

      const nextSession = getFloatingPlayerSession(sessionId);

      if (!nextSession) {
        closeDetachedWindow(session?.returnPath ?? "/");
        return;
      }

      setSession(nextSession);
    }

    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, [session?.returnPath, sessionId]);

  useEffect(() => {
    if (!session) {
      return;
    }

    const activeSessionId = session.id;

    function persistWindowBounds() {
      updateFloatingPlayerSession(activeSessionId, {
        window: {
          left: window.screenX,
          top: window.screenY,
          width: window.outerWidth,
          height: window.outerHeight,
        },
      });
    }

    function handleBeforeUnload() {
      removeFloatingPlayerSession(activeSessionId);
    }

    persistWindowBounds();
    window.addEventListener("resize", persistWindowBounds);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("resize", persistWindowBounds);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [session]);

  useEffect(() => {
    if (!session) {
      return;
    }

    updateFloatingPlayerSession(session.id, {
      muted: playerDiagnostics.isMuted,
      runtimeState: toRuntimeState(playerDiagnostics),
    });
  }, [playerDiagnostics, session]);

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
        <div className="max-w-sm rounded-[1.5rem] border border-slate-800/80 bg-slate-950/90 p-5 text-center shadow-glow">
          <p className="text-sm font-semibold text-white">Floating player unavailable</p>
          <p className="mt-2 text-[13px] leading-5 text-slate-400">
            This floating-player session is no longer active. Open a new floating player from TV-Dash to continue.
          </p>
          <Button className="mt-4" onClick={() => window.location.replace("/")} size="sm" type="button" variant="secondary">
            Open TV-Dash
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.12),transparent_36%),linear-gradient(180deg,#020617_0%,#020617_38%,#08111f_100%)] p-3 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-1.5rem)] max-w-[1280px] flex-col gap-3">
        <div className="rounded-[1.2rem] border border-slate-800/80 bg-slate-950/82 px-4 py-3 shadow-glow">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.22em] text-cyan-200/80">Floating Player</p>
              <h1 className="truncate text-base font-semibold text-white">{session.title}</h1>
              <p className="mt-1 text-[12px] text-slate-400">
                TV-Dash-managed detached playback window. Browser-native PiP remains optional from the in-player controls.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => focusMainApp(session.returnPath)} size="sm" type="button" variant="secondary">
                <MonitorUp className="h-4 w-4" />
                Return to app
              </Button>
              <Button onClick={() => window.open(session.returnPath, "tv-dash-main")} size="sm" type="button" variant="secondary">
                <ExternalLink className="h-4 w-4" />
                Open app
              </Button>
              <Button
                onClick={() => {
                  removeFloatingPlayerSession(session.id);
                  closeDetachedWindow(session.returnPath);
                }}
                size="sm"
                type="button"
                variant="ghost"
              >
                <X className="h-4 w-4" />
                Close
              </Button>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 rounded-[1.35rem] border border-slate-800/80 bg-black/70 p-2 shadow-glow">
          <div className="h-[calc(100vh-8.5rem)] min-h-[240px]">
            <HlsPlayer
              autoPlay
              floatingEnvironment="detached-window"
              muted={session.muted}
              onDiagnosticsChange={setPlayerDiagnostics}
              preferredQuality={session.preferredQuality}
              src={session.src}
              title={session.title}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
