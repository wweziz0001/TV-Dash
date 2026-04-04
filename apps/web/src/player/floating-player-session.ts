import type { PlayerStatus } from "./playback-recovery";
import type { PlayerPictureInPictureMode } from "./playback-diagnostics";

export interface FloatingPlayerSessionRuntimeState {
  status: PlayerStatus;
  isMuted: boolean;
  isPaused: boolean;
  volume: number;
  canSeek: boolean;
  isAtLiveEdge: boolean;
  liveLatencySeconds: number | null;
  pictureInPictureMode: PlayerPictureInPictureMode;
  isFullscreenActive: boolean;
}

export interface FloatingPlayerSessionWindowState {
  width: number;
  height: number;
  left: number;
  top: number;
}

export interface FloatingPlayerSession {
  id: string;
  title: string;
  src: string;
  returnPath: string;
  preferredQuality: string | null;
  muted: boolean;
  createdAt: string;
  updatedAt: string;
  window: FloatingPlayerSessionWindowState;
  runtimeState: FloatingPlayerSessionRuntimeState | null;
}

export interface CreateFloatingPlayerSessionInput {
  title: string;
  src: string;
  returnPath: string;
  preferredQuality?: string | null;
  muted?: boolean;
  window: FloatingPlayerSessionWindowState;
}

interface JsonStorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem?: (key: string) => void;
}

const FLOATING_PLAYER_SESSIONS_STORAGE_KEY = "tv-dash:floating-player-sessions";

function createFloatingPlayerSessionId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `floating-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function readFloatingPlayerSessionMap(storage: JsonStorageLike | null | undefined) {
  if (!storage) {
    return {};
  }

  const rawValue = storage.getItem(FLOATING_PLAYER_SESSIONS_STORAGE_KEY);

  if (!rawValue) {
    return {};
  }

  try {
    const parsedValue = JSON.parse(rawValue) as Record<string, FloatingPlayerSession>;
    return parsedValue && typeof parsedValue === "object" ? parsedValue : {};
  } catch {
    return {};
  }
}

function writeFloatingPlayerSessionMap(
  storage: JsonStorageLike | null | undefined,
  sessions: Record<string, FloatingPlayerSession>,
) {
  if (!storage) {
    return;
  }

  if (Object.keys(sessions).length === 0 && typeof storage.removeItem === "function") {
    storage.removeItem(FLOATING_PLAYER_SESSIONS_STORAGE_KEY);
    return;
  }

  storage.setItem(FLOATING_PLAYER_SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
}

export function buildFloatingPlayerRoute(sessionId: string) {
  return `/floating-player/${encodeURIComponent(sessionId)}`;
}

export function listFloatingPlayerSessions(storage: JsonStorageLike | null | undefined = localStorage) {
  return Object.values(readFloatingPlayerSessionMap(storage)).sort((left, right) => {
    return left.createdAt.localeCompare(right.createdAt);
  });
}

export function getFloatingPlayerSession(
  sessionId: string,
  storage: JsonStorageLike | null | undefined = localStorage,
) {
  const sessions = readFloatingPlayerSessionMap(storage);
  return sessions[sessionId] ?? null;
}

export function createFloatingPlayerSession(
  input: CreateFloatingPlayerSessionInput,
  now = new Date(),
) {
  return {
    id: createFloatingPlayerSessionId(),
    title: input.title,
    src: input.src,
    returnPath: input.returnPath,
    preferredQuality: input.preferredQuality ?? "AUTO",
    muted: input.muted ?? true,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    window: input.window,
    runtimeState: null,
  } satisfies FloatingPlayerSession;
}

export function saveFloatingPlayerSession(
  session: FloatingPlayerSession,
  storage: JsonStorageLike | null | undefined = localStorage,
) {
  const sessions = readFloatingPlayerSessionMap(storage);
  sessions[session.id] = session;
  writeFloatingPlayerSessionMap(storage, sessions);
  return session;
}

export function updateFloatingPlayerSession(
  sessionId: string,
  patch: Partial<Omit<FloatingPlayerSession, "id" | "createdAt">>,
  storage: JsonStorageLike | null | undefined = localStorage,
  now = new Date(),
) {
  const sessions = readFloatingPlayerSessionMap(storage);
  const existingSession = sessions[sessionId];

  if (!existingSession) {
    return null;
  }

  const nextSession: FloatingPlayerSession = {
    ...existingSession,
    ...patch,
    window: patch.window ? { ...existingSession.window, ...patch.window } : existingSession.window,
    runtimeState:
      patch.runtimeState === undefined
        ? existingSession.runtimeState
        : patch.runtimeState
          ? { ...patch.runtimeState }
          : null,
    updatedAt: now.toISOString(),
  };

  sessions[sessionId] = nextSession;
  writeFloatingPlayerSessionMap(storage, sessions);
  return nextSession;
}

export function removeFloatingPlayerSession(
  sessionId: string,
  storage: JsonStorageLike | null | undefined = localStorage,
) {
  const sessions = readFloatingPlayerSessionMap(storage);

  if (!sessions[sessionId]) {
    return;
  }

  delete sessions[sessionId];
  writeFloatingPlayerSessionMap(storage, sessions);
}
