import type { Principal } from "@icp-sdk/core/principal";
export interface Some<T> {
    __kind__: "Some";
    value: T;
}
export interface None {
    __kind__: "None";
}
export type Option<T> = Some<T> | None;

export interface BallResult {
    pick1: bigint;
    pick2: bigint;
    runs: bigint;
    isWicket: boolean;
    batterRuns: bigint;
}

export interface GameStateDTO {
    code: string;
    phase: string;
    playerNumber: bigint;
    player1Score: bigint;
    player2Score: bigint;
    player1Batting: boolean;
    innings1Score: bigint;
    target: bigint;
    tossWinner: bigint;
    tossResult: string;
    myPick: [] | [bigint];
    opponentPicked: boolean;
    ballHistory: BallResult[];
    lastBall: [] | [BallResult];
    winner: string;
    waitingForOpponent: boolean;
}

export interface backendInterface {
    createRoom(): Promise<{ code: string; sessionId: string }>;
    joinRoom(code: string): Promise<{ ok: { sessionId: string } } | { err: string }>;
    getGameState(code: string, sessionId: string): Promise<{ ok: GameStateDTO } | { err: string }>;
    flipCoin(code: string, sessionId: string, coinChoice: string): Promise<{ ok: null } | { err: string }>;
    chooseBatBowl(code: string, sessionId: string, choice: string): Promise<{ ok: null } | { err: string }>;
    submitPick(code: string, sessionId: string, pick: bigint): Promise<{ ok: null } | { err: string }>;
    startInnings2(code: string, sessionId: string): Promise<{ ok: null } | { err: string }>;
}
