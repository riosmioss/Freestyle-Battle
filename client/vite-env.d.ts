/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SERVER_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Minimal typings for the YouTube IFrame Player API loaded at runtime.
interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getPlayerState(): number;
  mute(): void;
  unMute(): void;
  setVolume(v: number): void;
  loadVideoById(id: string): void;
  destroy(): void;
}

interface Window {
  YT?: {
    Player: new (el: HTMLElement | string, opts: any) => YTPlayer;
    PlayerState: { PLAYING: number; PAUSED: number; ENDED: number; BUFFERING: number; CUED: number };
  };
  onYouTubeIframeAPIReady?: () => void;
}
