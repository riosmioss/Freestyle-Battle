// Mirror of the server's broadcast types. Keep in sync with server/src/types.ts.

export type Phase = 'lobby' | 'countdown' | 'performing' | 'rating' | 'results';

export interface Player {
  id: string;
  handle: string;
  online: boolean;
}

export interface Beat {
  id: string;
  videoId: string;
  label: string;
  addedBy: string;
}

export interface PlayerRoundScore {
  playerId: string;
  handle: string;
  average: number;
  votes: number;
}

export interface RoundResults {
  roundNumber: number;
  beatLabel: string;
  scores: PlayerRoundScore[];
  winnerId: string | null;
}

export interface LeaderboardEntry {
  playerId: string;
  handle: string;
  online: boolean;
  totalPoints: number;
  roundsWon: number;
}

export interface RoomState {
  code: string;
  hostId: string;
  phase: Phase;
  players: Player[];
  beats: Beat[];
  activeBeatId: string | null;
  roundLength: number;
  roundNumber: number;

  // Simultaneous performance
  performedIds: string[];

  countdownEndsAt: number | null;
  performStartTimestamp: number | null;
  performEndsAt: number | null;

  ratingsSubmitted: string[];
  results: RoundResults | null;
  leaderboard: LeaderboardEntry[];
  isPublic: boolean;
}

// A recorded take received from the server during the rating phase.
export interface RecordingMeta {
  performerId: string;
  handle: string;
  beatOffset: number;
  mimeType: string;
  data: ArrayBuffer;
}

export interface RecordingsPayload {
  roundNumber: number;
  recordings: RecordingMeta[];
}

export interface PublicLobby {
  code: string;
  hostHandle: string;
  playerCount: number;
  phase: Phase;
  roundNumber: number;
}
