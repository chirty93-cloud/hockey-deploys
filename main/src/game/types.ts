import type { Difficulty } from "../config/game.ts";

export type Side = "player" | "ai";
export type Phase = "ready" | "playing" | "paused" | "goal" | "gameover";
export interface Point {
  x: number;
  y: number;
}
export interface Body extends Point {
  vx: number;
  vy: number;
}
export interface SideStats {
  hits: number;
  saves: number;
  fastestShot: number;
  bankGoals: number;
}
export interface MatchStats {
  player: SideStats;
  ai: SideStats;
  longestRally: number;
  longestRallyHits: number;
  elapsed: number;
}
export interface GameState {
  phase: Phase;
  player: Body;
  ai: Body;
  puck: Body;
  target: Point;
  score: Record<Side, number>;
  difficulty: Difficulty;
  winner: Side | null;
  lastScorer: Side | null;
  goalRemaining: number;
  elapsed: number;
  endReason: "score" | "time" | null;
}
export interface Snapshot {
  stats: MatchStats | null;
  phase: Phase;
  playerScore: number;
  aiScore: number;
  difficulty: Difficulty;
  winner: Side | null;
  lastScorer: Side | null;
  remainingSeconds: number | null;
  endReason: "score" | "time" | null;
}
export type GameEvent =
  | {
      type: "hit";
      kind: "wall" | "paddle";
      side?: Side;
      x: number;
      y: number;
      speed: number;
    }
  | { type: "goal"; side: Side; won: boolean; x: number; y: number }
  | { type: "finish"; winner: Side | null }
  | { type: "configure" }
  | { type: "reset" };
