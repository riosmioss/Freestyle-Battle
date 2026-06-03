// Shared game types. The server is the single source of truth for all of this.

// Turn-based recorded battle:
//   lobby -> countdown -> performing (one MC records) -> ...repeat per MC...
//   -> rating (play back each take + score) -> results -> (loop)
export type Phase = 'lobby' | 'countdown' | 'performing' | 'rating' | 'results';

export interface Player {
  id: string; // socket id
  handle: string;
  online: boolean;
}

export interface Beat {
  id: string;
  videoId: string;
  label: string;
  addedBy: string; // player id
}

// One player's averaged score for a single round.
export interface PlayerRoundScore {
  playerId: string;
  handle: string;
  average: number; // 0 if no ratings received
  votes: number; // how many people rated them
}

export interface RoundResults {
  roundNumber: number;
  beatLabel: string;
  scores: PlayerRoundScore[]; // sorted high -> low
  winnerId: string | null;
}

export interface LeaderboardEntry {
  playerId: string;
  handle: string;
  online: boolean;
  totalPoints: number; // cumulative sum of round averages
  roundsWon: number;
}

// The full snapshot the server broadcasts. Clients render this; they never
// drive phase transitions themselves.
export interface RoomState {
  code: string;
  hostId: string;
  phase: Phase;
  players: Player[];
  beats: Beat[];
  activeBeatId: string | null;
  roundLength: number; // seconds everyone records for
  roundNumber: number;

  // ---- Simultaneous performance state ----
  performedIds: string[]; // who has uploaded their take this round

  // Timing (server epoch milliseconds). Clients convert to their own clock
  // using a measured offset.
  countdownEndsAt: number | null; // when the beat drops for everyone
  performStartTimestamp: number | null; // record start (t=0)
  performEndsAt: number | null; // when the recording window ends

  // Rating phase: ids of players who have already submitted their ratings.
  ratingsSubmitted: string[];

  results: RoundResults | null;
  leaderboard: LeaderboardEntry[];
  isPublic: boolean;
}

// A row in the public lobby browser shown on the home screen.
export interface PublicLobby {
  code: string;
  hostHandle: string;
  playerCount: number;
  phase: Phase;
  roundNumber: number;
}

// A recorded take, distributed to all clients when rating starts.
export interface RecordingMeta {
  performerId: string;
  handle: string;
  beatOffset: number; // seconds into the beat where the vocal begins
  mimeType: string; // e.g. audio/webm;codecs=opus
  data: ArrayBuffer | Buffer; // the audio blob bytes
}

// ---- Client -> Server payloads ----
export interface CreateLobbyPayload {
  handle: string;
  isPublic?: boolean;
}
export interface SetPublicPayload {
  isPublic: boolean;
}
export interface JoinLobbyPayload {
  code: string;
  handle: string;
}
export interface AddBeatPayload {
  url: string;
  label?: string;
}
export interface SelectBeatPayload {
  beatId: string;
}
export interface RemoveBeatPayload {
  beatId: string;
}
export interface SetRoundLengthPayload {
  seconds: number;
}
export interface SubmitRecordingPayload {
  beatOffset: number;
  mimeType: string;
  data: ArrayBuffer; // binary audio (Socket.IO handles binary natively)
}
export interface SubmitRatingPayload {
  // map of targetPlayerId -> score (1..10)
  ratings: Record<string, number>;
}

export type Ack<T = unknown> = (response: { ok: boolean; error?: string } & Partial<T>) => void;
