import { Toaster } from "@/components/ui/sonner";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useActor } from "./hooks/useActor";

// ─── Types ────────────────────────────────────────────────────────────────────
interface BallResult {
  pick1: bigint;
  pick2: bigint;
  runs: bigint;
  isWicket: boolean;
  batterRuns: bigint;
}

interface GameStateDTO {
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

// Cast actor to access runtime methods not reflected in generated types
type GameActor = {
  createRoom(): Promise<{ code: string; sessionId: string }>;
  joinRoom(
    code: string,
  ): Promise<{ ok: { sessionId: string } } | { err: string }>;
  getGameState(
    code: string,
    sessionId: string,
  ): Promise<{ ok: GameStateDTO } | { err: string }>;
  flipCoin(
    code: string,
    sessionId: string,
    coinChoice: string,
  ): Promise<{ ok: null } | { err: string }>;
  chooseBatBowl(
    code: string,
    sessionId: string,
    choice: string,
  ): Promise<{ ok: null } | { err: string }>;
  submitPick(
    code: string,
    sessionId: string,
    pick: bigint,
  ): Promise<{ ok: null } | { err: string }>;
  startInnings2(
    code: string,
    sessionId: string,
  ): Promise<{ ok: null } | { err: string }>;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fromOpt<T>(opt: [] | [T]): T | null {
  return opt.length > 0 ? (opt[0] as T) : null;
}

const SESSION_KEY = "hc_session";

interface SessionData {
  code: string;
  sessionId: string;
  myName: string;
}

function saveSession(data: SessionData) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(data));
}

function loadSession(): SessionData | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

const HAND_EMOJIS: Record<number, string> = {
  1: "☝️",
  2: "✌️",
  3: "🤟",
  4: "🖖",
  5: "🖐️",
  6: "👊",
};

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const { actor: _actor } = useActor();
  const actor = _actor as unknown as GameActor | null;
  const [session, setSession] = useState<SessionData | null>(loadSession);
  const [gameState, setGameState] = useState<GameStateDTO | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [myName, setMyName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [animKey, setAnimKey] = useState(0);
  const [lastBallShown, setLastBallShown] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevPhaseRef = useRef<string | null>(null);

  const fetchState = useCallback(
    async (sess: SessionData) => {
      if (!actor) return;
      try {
        const res = await actor.getGameState(sess.code, sess.sessionId);
        if ("ok" in res) {
          setGameState((prev) => {
            const next = res.ok;
            // detect new ball
            if (
              prev &&
              fromOpt(next.lastBall) &&
              JSON.stringify(fromOpt(next.lastBall)) !==
                JSON.stringify(fromOpt(prev.lastBall))
            ) {
              setAnimKey((k) => k + 1);
              setLastBallShown(true);
              setTimeout(() => setLastBallShown(false), 1500);
            }
            prevPhaseRef.current = next.phase;
            return next;
          });
        } else {
          // Session invalid or room gone
          if (res.err.includes("not found") || res.err.includes("invalid")) {
            clearSession();
            setSession(null);
            setGameState(null);
          }
        }
      } catch {
        // ignore transient errors
      }
    },
    [actor],
  );

  useEffect(() => {
    if (!session || !actor) return;
    fetchState(session);
    pollRef.current = setInterval(() => fetchState(session), 1500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [session, actor, fetchState]);

  const handleCreateRoom = useCallback(async () => {
    if (!actor) return;
    setLoading(true);
    setError("");
    try {
      const res = await actor.createRoom();
      const sess: SessionData = {
        code: res.code,
        sessionId: res.sessionId,
        myName: myName.trim() || "Player 1",
      };
      saveSession(sess);
      setSession(sess);
    } catch {
      setError("Failed to create room. Try again.");
    } finally {
      setLoading(false);
    }
  }, [actor, myName]);

  const handleJoinRoom = useCallback(async () => {
    if (!actor || !joinCode.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await actor.joinRoom(joinCode.trim().toUpperCase());
      if ("ok" in res) {
        const sess: SessionData = {
          code: joinCode.trim().toUpperCase(),
          sessionId: res.ok.sessionId,
          myName: myName.trim() || "Player 2",
        };
        saveSession(sess);
        setSession(sess);
      } else {
        setError(res.err);
      }
    } catch {
      setError("Failed to join room. Check the code and try again.");
    } finally {
      setLoading(false);
    }
  }, [actor, joinCode, myName]);

  const handleFlipCoin = useCallback(
    async (choice: string) => {
      if (!actor || !session) return;
      const res = await actor.flipCoin(session.code, session.sessionId, choice);
      if ("err" in res) toast.error(res.err);
    },
    [actor, session],
  );

  const handleChooseBatBowl = useCallback(
    async (choice: string) => {
      if (!actor || !session) return;
      const res = await actor.chooseBatBowl(
        session.code,
        session.sessionId,
        choice,
      );
      if ("err" in res) toast.error(res.err);
    },
    [actor, session],
  );

  const handleSubmitPick = useCallback(
    async (pick: number) => {
      if (!actor || !session || !gameState) return;
      if (fromOpt(gameState.myPick) !== null) return; // already picked
      const res = await actor.submitPick(
        session.code,
        session.sessionId,
        BigInt(pick),
      );
      if ("err" in res) toast.error(res.err);
    },
    [actor, session, gameState],
  );

  const handleStartInnings2 = useCallback(async () => {
    if (!actor || !session) return;
    const res = await actor.startInnings2(session.code, session.sessionId);
    if ("err" in res) toast.error(res.err);
  }, [actor, session]);

  const handleLeaveRoom = useCallback(() => {
    clearSession();
    setSession(null);
    setGameState(null);
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  const phase = gameState?.phase ?? null;
  const sessionMyName = session?.myName ?? "";

  return (
    <div className="min-h-screen pitch-bg flex flex-col">
      <Toaster />
      {/* ── Header ── */}
      <header
        className="sticky top-0 z-50 w-full"
        style={{
          background: "oklch(0.17 0.04 225 / 0.95)",
          borderBottom: "1px solid oklch(0.3 0.06 225)",
          backdropFilter: "blur(8px)",
        }}
      >
        <div className="max-w-lg mx-auto px-4 flex items-center justify-between h-14">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🏏</span>
            <span className="text-white font-bold text-xl tracking-tight">
              Hand Cricket
            </span>
            <span
              className="text-xs px-2 py-0.5 rounded-full font-bold ml-1"
              style={{
                background: "oklch(0.74 0.19 155 / 0.2)",
                color: "oklch(0.74 0.19 155)",
              }}
            >
              1v1
            </span>
          </div>
          {session && (
            <button
              type="button"
              data-ocid="nav.leave.button"
              onClick={handleLeaveRoom}
              className="text-xs px-3 py-1.5 rounded-lg text-white transition-colors hover:bg-white/10"
              style={{ border: "1px solid oklch(0.4 0.06 225)" }}
            >
              Leave Room
            </button>
          )}
        </div>
      </header>

      {/* ── Main ── */}
      <main className="flex-1 flex flex-col items-center justify-start py-6 px-4">
        <div className="w-full max-w-lg">
          <AnimatePresence mode="wait">
            {!session && (
              <LobbyScreen
                key="lobby"
                joinCode={joinCode}
                setJoinCode={setJoinCode}
                myName={myName}
                setMyName={setMyName}
                loading={loading}
                error={error}
                onCreateRoom={handleCreateRoom}
                onJoinRoom={handleJoinRoom}
              />
            )}

            {session && !gameState && (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-center py-20"
              >
                <div
                  className="w-12 h-12 rounded-full mx-auto mb-4 animate-spin"
                  style={{
                    border: "3px solid oklch(0.35 0.06 225)",
                    borderTopColor: "oklch(0.74 0.19 155)",
                  }}
                />
                <p className="text-gray-400">Connecting...</p>
              </motion.div>
            )}

            {session && gameState && phase === "waiting" && (
              <WaitingScreen
                key="waiting"
                code={session.code}
                playerNumber={Number(gameState.playerNumber)}
                myName={sessionMyName}
              />
            )}

            {session && gameState && phase === "toss" && (
              <TossScreen
                key="toss"
                gameState={gameState}
                myName={sessionMyName}
                onFlipCoin={handleFlipCoin}
              />
            )}

            {session && gameState && phase === "chooseBatBowl" && (
              <ChooseBatBowlScreen
                key="choose"
                gameState={gameState}
                myName={sessionMyName}
                onChoose={handleChooseBatBowl}
              />
            )}

            {session &&
              gameState &&
              (phase === "innings1" || phase === "innings2") && (
                <InningsScreen
                  key={phase}
                  gameState={gameState}
                  myName={sessionMyName}
                  animKey={animKey}
                  lastBallShown={lastBallShown}
                  onPick={handleSubmitPick}
                />
              )}

            {session && gameState && phase === "inningsBreak" && (
              <InningsBreakScreen
                key="break"
                gameState={gameState}
                onStartInnings2={handleStartInnings2}
              />
            )}

            {session && gameState && phase === "result" && (
              <ResultScreen
                key="result"
                gameState={gameState}
                myName={sessionMyName}
                onPlayAgain={handleLeaveRoom}
              />
            )}
          </AnimatePresence>
        </div>

        {/* ── Info sections ── */}
        {!session && (
          <div className="w-full max-w-lg mt-8 space-y-4">
            <HowToPlayCard />
            <AboutCard />
          </div>
        )}
      </main>

      {/* ── Footer ── */}
      <footer
        style={{ background: "oklch(0.17 0.04 225)" }}
        className="py-6 px-4 mt-auto"
      >
        <div className="max-w-lg mx-auto text-center text-sm text-gray-500">
          © {new Date().getFullYear()}. Built with ❤️ using{" "}
          <a
            href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(typeof window !== "undefined" ? window.location.hostname : "")}`}
            className="hover:text-white transition-colors"
            style={{ color: "oklch(0.74 0.19 155)" }}
            target="_blank"
            rel="noreferrer"
          >
            caffeine.ai
          </a>
        </div>
      </footer>
    </div>
  );
}

// ─── LobbyScreen ──────────────────────────────────────────────────────────────
function LobbyScreen({
  joinCode,
  setJoinCode,
  myName,
  setMyName,
  loading,
  error,
  onCreateRoom,
  onJoinRoom,
}: {
  joinCode: string;
  setJoinCode: (v: string) => void;
  myName: string;
  setMyName: (v: string) => void;
  loading: boolean;
  error: string;
  onCreateRoom: () => void;
  onJoinRoom: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6"
    >
      <div className="text-center pt-4">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
          className="text-7xl mb-3"
        >
          🏏
        </motion.div>
        <h1 className="text-3xl font-bold text-white mb-1">Hand Cricket</h1>
        <p className="text-sm" style={{ color: "oklch(0.74 0.19 155)" }}>
          1v1 — Challenge a friend on their phone!
        </p>
      </div>

      {error && (
        <div
          data-ocid="lobby.error_state"
          className="px-4 py-3 rounded-xl text-sm text-center"
          style={{
            background: "oklch(0.577 0.245 27.325 / 0.15)",
            color: "oklch(0.7 0.2 27)",
            border: "1px solid oklch(0.577 0.245 27.325 / 0.3)",
          }}
        >
          {error}
        </div>
      )}

      {/* Your Name */}
      <div className="card-dark rounded-2xl p-6">
        <label
          htmlFor="player-name"
          className="block text-white font-bold text-base mb-2"
        >
          Your Name
        </label>
        <input
          id="player-name"
          type="text"
          data-ocid="lobby.player_name.input"
          value={myName}
          onChange={(e) => setMyName(e.target.value.slice(0, 20))}
          placeholder="Enter your name"
          maxLength={20}
          className="w-full py-3 px-4 rounded-xl text-white text-base mb-0 outline-none"
          style={{
            background: "oklch(0.22 0.05 225)",
            border: "2px solid oklch(0.4 0.07 225)",
            caretColor: "oklch(0.74 0.19 155)",
          }}
        />
      </div>

      {/* Create Room */}
      <div className="card-dark rounded-2xl p-6">
        <h2 className="text-white font-bold text-lg mb-1">Create a Room</h2>
        <p className="text-gray-400 text-sm mb-4">
          Start a new match and share the code with your friend
        </p>
        <button
          type="button"
          data-ocid="lobby.create_room.button"
          onClick={onCreateRoom}
          disabled={loading}
          className="w-full py-4 rounded-xl text-white font-bold text-lg transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
          style={{ background: "oklch(0.74 0.19 155)" }}
        >
          {loading ? "Creating..." : "🎮 Create Room"}
        </button>
      </div>

      {/* Join Room */}
      <div className="card-dark rounded-2xl p-6">
        <h2 className="text-white font-bold text-lg mb-1">Join a Room</h2>
        <p className="text-gray-400 text-sm mb-4">
          Enter the 4-letter code from your friend
        </p>
        <input
          type="text"
          data-ocid="lobby.join_code.input"
          value={joinCode}
          onChange={(e) =>
            setJoinCode(e.target.value.toUpperCase().slice(0, 4))
          }
          onKeyDown={(e) => e.key === "Enter" && onJoinRoom()}
          placeholder="XXXX"
          maxLength={4}
          className="w-full py-4 px-4 rounded-xl text-white text-center text-3xl font-mono font-bold tracking-widest mb-4 outline-none"
          style={{
            background: "oklch(0.22 0.05 225)",
            border: "2px solid oklch(0.4 0.07 225)",
            caretColor: "oklch(0.74 0.19 155)",
          }}
        />
        <button
          type="button"
          data-ocid="lobby.join_room.button"
          onClick={onJoinRoom}
          disabled={loading || joinCode.length < 4}
          className="w-full py-4 rounded-xl text-white font-bold text-lg transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40"
          style={{
            background: "oklch(0.27 0.06 225)",
            border: "2px solid oklch(0.4 0.07 225)",
          }}
        >
          {loading ? "Joining..." : "🔗 Join Room"}
        </button>
      </div>
    </motion.div>
  );
}

// ─── WaitingScreen ────────────────────────────────────────────────────────────
function WaitingScreen({
  code,
  playerNumber,
  myName,
}: {
  code: string;
  playerNumber: number;
  myName: string;
}) {
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    toast.success("Room code copied!");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="card-dark rounded-2xl p-8 text-center"
      data-ocid="waiting.panel"
    >
      <div
        className="inline-block px-3 py-1 rounded-full text-xs font-bold mb-4"
        style={{
          background: "oklch(0.74 0.19 155 / 0.15)",
          color: "oklch(0.74 0.19 155)",
        }}
      >
        You are Player {playerNumber}
      </div>

      <h2 className="text-2xl font-bold text-white mb-1">Room Created!</h2>
      {myName && (
        <p className="text-sm mb-2" style={{ color: "oklch(0.74 0.19 155)" }}>
          Welcome, {myName}!
        </p>
      )}
      <p className="text-gray-400 text-sm mb-8">
        Share this code with your opponent
      </p>

      <div
        className="rounded-2xl p-6 mb-6"
        style={{ background: "oklch(0.22 0.05 225)" }}
      >
        <p className="text-gray-400 text-xs mb-2 uppercase tracking-widest">
          Room Code
        </p>
        <p
          className="text-6xl font-mono font-black tracking-widest mb-4"
          style={{ color: "oklch(0.74 0.19 155)" }}
          data-ocid="waiting.room_code.panel"
        >
          {code}
        </p>
        <button
          type="button"
          data-ocid="waiting.copy_code.button"
          onClick={handleCopy}
          className="px-6 py-2 rounded-lg text-sm font-bold transition-all hover:scale-105"
          style={{
            background: "oklch(0.74 0.19 155 / 0.2)",
            color: "oklch(0.74 0.19 155)",
            border: "1px solid oklch(0.74 0.19 155 / 0.4)",
          }}
        >
          📋 Copy Code
        </button>
      </div>

      <div className="flex items-center justify-center gap-3">
        <div
          className="w-3 h-3 rounded-full animate-pulse"
          style={{ background: "oklch(0.74 0.19 155)" }}
        />
        <p className="text-gray-400 text-sm">Waiting for opponent to join...</p>
      </div>
    </motion.div>
  );
}

// ─── TossScreen ───────────────────────────────────────────────────────────────
function TossScreen({
  gameState,
  myName,
  onFlipCoin,
}: {
  gameState: GameStateDTO;
  myName: string;
  onFlipCoin: (choice: string) => void;
}) {
  const isPlayer1 = Number(gameState.playerNumber) === 1;
  const tossResult = gameState.tossResult;
  const tossWinner = Number(gameState.tossWinner);
  const myNum = Number(gameState.playerNumber);
  const tossWinnerLabel =
    tossWinner === myNum ? myName || `Player ${myNum}` : "Opponent";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="card-dark rounded-2xl p-6 text-center"
      data-ocid="toss.panel"
    >
      <h2 className="text-2xl font-bold text-white mb-2">🪙 Coin Toss</h2>

      {tossResult ? (
        <>
          <div
            className="w-28 h-28 mx-auto rounded-full flex items-center justify-center text-6xl my-6"
            style={{
              background:
                "linear-gradient(135deg, oklch(0.75 0.15 85), oklch(0.6 0.12 85))",
            }}
          >
            {tossResult === "heads" ? "👑" : "🦅"}
          </div>
          <p
            className="text-xl font-bold mb-2"
            style={{ color: "oklch(0.74 0.19 155)" }}
          >
            {tossResult.toUpperCase()}!
          </p>
          {tossWinner > 0 && (
            <p className="text-gray-300 text-sm">
              {tossWinnerLabel} wins the toss!
            </p>
          )}
        </>
      ) : isPlayer1 ? (
        <>
          <p className="text-gray-400 mb-6 text-sm">
            {myName ? `${myName}, you're` : "You are"} Player 1 — pick Heads or
            Tails!
          </p>
          <div
            className="w-28 h-28 mx-auto rounded-full flex items-center justify-center text-6xl mb-8"
            style={{
              background:
                "linear-gradient(135deg, oklch(0.75 0.15 85), oklch(0.6 0.12 85))",
            }}
          >
            🪙
          </div>
          <div className="flex gap-4 justify-center">
            <button
              type="button"
              data-ocid="toss.heads.button"
              onClick={() => onFlipCoin("heads")}
              className="flex-1 py-4 rounded-xl text-white font-bold text-lg transition-all hover:scale-105"
              style={{ background: "oklch(0.74 0.19 155)" }}
            >
              👑 Heads
            </button>
            <button
              type="button"
              data-ocid="toss.tails.button"
              onClick={() => onFlipCoin("tails")}
              className="flex-1 py-4 rounded-xl font-bold text-lg transition-all hover:scale-105 text-white"
              style={{
                background: "oklch(0.27 0.06 225)",
                border: "2px solid oklch(0.4 0.06 225)",
              }}
            >
              🦅 Tails
            </button>
          </div>
        </>
      ) : (
        <>
          <div
            className="w-28 h-28 mx-auto rounded-full flex items-center justify-center text-6xl my-8 animate-pulse"
            style={{
              background:
                "linear-gradient(135deg, oklch(0.75 0.15 85), oklch(0.6 0.12 85))",
            }}
          >
            🪙
          </div>
          <p className="text-gray-400">Waiting for opponent to flip...</p>
        </>
      )}
    </motion.div>
  );
}

// ─── ChooseBatBowlScreen ──────────────────────────────────────────────────────
function ChooseBatBowlScreen({
  gameState,
  myName,
  onChoose,
}: {
  gameState: GameStateDTO;
  myName: string;
  onChoose: (choice: string) => void;
}) {
  const myNum = Number(gameState.playerNumber);
  const tossWinner = Number(gameState.tossWinner);
  const isTossWinner = myNum === tossWinner;
  const tossWinnerLabel = isTossWinner
    ? myName || `Player ${tossWinner}`
    : "Opponent";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      className="card-dark rounded-2xl p-6 text-center"
      data-ocid="batbowl.panel"
    >
      <div
        className="inline-block px-3 py-1 rounded-full text-xs font-bold mb-4"
        style={{
          background: "oklch(0.74 0.19 155 / 0.2)",
          color: "oklch(0.74 0.19 155)",
        }}
      >
        {tossWinnerLabel} won the toss!
      </div>

      {isTossWinner ? (
        <>
          <h2 className="text-2xl font-bold text-white mb-2">Your Choice</h2>
          <p className="text-gray-400 mb-8 text-sm">
            Would you like to bat or bowl first?
          </p>
          <div className="flex gap-4 justify-center">
            <button
              type="button"
              data-ocid="batbowl.bat.button"
              onClick={() => onChoose("bat")}
              className="flex-1 py-6 rounded-2xl text-white font-bold text-xl transition-all hover:scale-105 flex flex-col items-center gap-2"
              style={{ background: "oklch(0.74 0.19 155)" }}
            >
              <span className="text-4xl">🏏</span>
              Bat
            </button>
            <button
              type="button"
              data-ocid="batbowl.bowl.button"
              onClick={() => onChoose("bowl")}
              className="flex-1 py-6 rounded-2xl font-bold text-xl transition-all hover:scale-105 flex flex-col items-center gap-2 text-white"
              style={{
                background: "oklch(0.27 0.06 225)",
                border: "2px solid oklch(0.4 0.06 225)",
              }}
            >
              <span className="text-4xl">⚾</span>
              Bowl
            </button>
          </div>
        </>
      ) : (
        <>
          <h2 className="text-2xl font-bold text-white mb-4">
            Waiting for {tossWinnerLabel}...
          </h2>
          <div className="flex items-center justify-center gap-3 mt-6">
            <div
              className="w-3 h-3 rounded-full animate-pulse"
              style={{ background: "oklch(0.74 0.19 155)" }}
            />
            <p className="text-gray-400 text-sm">
              {tossWinnerLabel} is choosing to bat or bowl
            </p>
          </div>
        </>
      )}
    </motion.div>
  );
}

// ─── BallChip ─────────────────────────────────────────────────────────────────
function BallChipView({ ball }: { ball: { runs: bigint; isWicket: boolean } }) {
  if (ball.isWicket) return <span className="ball-chip wicket">W</span>;
  const r = Number(ball.runs);
  if (r === 0) return <span className="ball-chip dot">0</span>;
  return <span className="ball-chip run">{r}</span>;
}

// ─── InningsScreen ────────────────────────────────────────────────────────────
function InningsScreen({
  gameState,
  myName,
  animKey,
  lastBallShown,
  onPick,
}: {
  gameState: GameStateDTO;
  myName: string;
  animKey: number;
  lastBallShown: boolean;
  onPick: (n: number) => void;
}) {
  const myNum = Number(gameState.playerNumber);
  const isBatting =
    (myNum === 1 && gameState.player1Batting) ||
    (myNum === 2 && !gameState.player1Batting);
  const isInnings2 = gameState.phase === "innings2";
  const myPick = fromOpt(gameState.myPick);
  const lastBall = fromOpt(gameState.lastBall);
  const target = Number(gameState.target);
  const p1Score = Number(gameState.player1Score);
  const p2Score = Number(gameState.player2Score);
  const innings1Score = Number(gameState.innings1Score);

  const hasPicked = myPick !== null;
  const waiting = gameState.waitingForOpponent || hasPicked;

  // Labels: use myName for own number, "Opponent" for the other
  const p1Label = myNum === 1 ? myName || "Player 1" : "Opponent";
  const p2Label = myNum === 2 ? myName || "Player 2" : "Opponent";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-4"
      data-ocid="innings.panel"
    >
      {/* Header */}
      <div className="card-dark rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-white font-bold">🏏 Live Match</span>
          <span
            className="text-xs px-3 py-1 rounded-full font-bold"
            style={{
              background: "oklch(0.74 0.19 155 / 0.15)",
              color: "oklch(0.74 0.19 155)",
            }}
          >
            {isInnings2 ? "2nd Innings" : "1st Innings"}
          </span>
        </div>

        {/* Scores */}
        <div className="grid grid-cols-3 items-center gap-2">
          <div className="text-center">
            <p className="text-gray-400 text-xs mb-1 truncate">{p1Label}</p>
            <p
              className="text-2xl font-black"
              style={{
                color: myNum === 1 ? "oklch(0.74 0.19 155)" : "white",
              }}
            >
              {p1Score}
            </p>
            {gameState.player1Batting ? (
              <span
                className="text-xs"
                style={{ color: "oklch(0.74 0.19 155)" }}
              >
                🏏 BAT
              </span>
            ) : (
              <span className="text-xs text-gray-500">⚾ BOWL</span>
            )}
          </div>
          <div className="text-center">
            <p
              className="text-lg font-bold"
              style={{ color: "oklch(0.5 0.06 225)" }}
            >
              VS
            </p>
          </div>
          <div className="text-center">
            <p className="text-gray-400 text-xs mb-1 truncate">{p2Label}</p>
            <p
              className="text-2xl font-black"
              style={{
                color: myNum === 2 ? "oklch(0.74 0.19 155)" : "white",
              }}
            >
              {p2Score}
            </p>
            {!gameState.player1Batting ? (
              <span
                className="text-xs"
                style={{ color: "oklch(0.74 0.19 155)" }}
              >
                🏏 BAT
              </span>
            ) : (
              <span className="text-xs text-gray-500">⚾ BOWL</span>
            )}
          </div>
        </div>

        {isInnings2 && target > 0 && (
          <div
            className="mt-3 px-3 py-2 rounded-lg text-sm text-center font-bold"
            style={{
              background: "oklch(0.74 0.19 155 / 0.1)",
              color: "oklch(0.74 0.19 155)",
            }}
          >
            🎯 Target: {target} &nbsp;·&nbsp; 1st Innings Score: {innings1Score}
          </div>
        )}
      </div>

      {/* Role badge */}
      <div
        className="rounded-xl px-4 py-3 text-center text-sm font-bold"
        style={{
          background: isBatting
            ? "oklch(0.74 0.19 155 / 0.15)"
            : "oklch(0.27 0.06 225 / 0.6)",
          color: isBatting ? "oklch(0.74 0.19 155)" : "oklch(0.6 0.01 250)",
          border: `1px solid ${
            isBatting ? "oklch(0.74 0.19 155 / 0.3)" : "oklch(0.4 0.06 225)"
          }`,
        }}
      >
        {isBatting ? "🏏 You are Batting" : "⚾ You are Bowling"}
      </div>

      {/* Last ball result */}
      <AnimatePresence>
        {lastBall && lastBallShown && (
          <motion.div
            key={animKey}
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            className="rounded-xl py-4 text-center font-bold text-2xl"
            style={{
              background: lastBall.isWicket
                ? "oklch(0.577 0.245 27.325 / 0.2)"
                : "oklch(0.74 0.19 155 / 0.15)",
              color: lastBall.isWicket
                ? "oklch(0.7 0.2 27)"
                : "oklch(0.74 0.19 155)",
            }}
          >
            {lastBall.isWicket ? (
              <span>💥 WICKET! Both picked {Number(lastBall.pick1)}</span>
            ) : (
              <span>
                +{Number(lastBall.runs)} run
                {Number(lastBall.runs) !== 1 ? "s" : ""}
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ball history */}
      {gameState.ballHistory.length > 0 && (
        <div className="card-dark rounded-xl p-3">
          <p className="text-xs text-gray-500 mb-2">Ball History</p>
          <div className="flex flex-wrap gap-1">
            {gameState.ballHistory.slice(-12).map((b, i) => (
              <BallChipView
                key={`ball-${Number(b.pick1)}-${Number(b.pick2)}-${Number(b.runs)}-${i}`}
                ball={b}
              />
            ))}
          </div>
        </div>
      )}

      {/* Pick tiles */}
      <div className="card-dark rounded-2xl p-5">
        {hasPicked || waiting ? (
          <div className="text-center py-4">
            {hasPicked && (
              <div className="mb-4">
                <p className="text-gray-400 text-sm mb-2">Your pick:</p>
                <div className="w-16 h-16 rounded-2xl mx-auto flex flex-col items-center justify-center gap-1 number-tile selected">
                  <span className="text-3xl">
                    {HAND_EMOJIS[Number(myPick)]}
                  </span>
                  <span className="text-white font-bold text-lg">
                    {Number(myPick)}
                  </span>
                </div>
              </div>
            )}
            <div className="flex items-center justify-center gap-3">
              <div
                className="w-3 h-3 rounded-full animate-pulse"
                style={{ background: "oklch(0.74 0.19 155)" }}
              />
              <p className="text-gray-400 text-sm">Waiting for opponent...</p>
            </div>
          </div>
        ) : (
          <>
            <p className="text-xs text-gray-400 mb-3 text-center">
              {isBatting ? "Pick your shot" : "Pick to bowl"}
            </p>
            <div className="grid grid-cols-6 gap-2">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <button
                  key={n}
                  type="button"
                  data-ocid={`innings.number_${n}.button`}
                  onClick={() => onPick(n)}
                  className="number-tile rounded-xl p-3 flex flex-col items-center gap-1 cursor-pointer select-none"
                >
                  <span className="text-3xl leading-none">
                    {HAND_EMOJIS[n]}
                  </span>
                  <span className="text-white font-bold text-lg leading-none">
                    {n}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}

// ─── InningsBreakScreen ───────────────────────────────────────────────────────
function InningsBreakScreen({
  gameState,
  onStartInnings2,
}: {
  gameState: GameStateDTO;
  onStartInnings2: () => void;
}) {
  const innings1Score = Number(gameState.innings1Score);
  const target = Number(gameState.target);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      className="card-dark rounded-2xl p-8 text-center"
      data-ocid="innings_break.panel"
    >
      <div
        className="inline-block px-3 py-1 rounded-full text-xs font-bold mb-4"
        style={{
          background: "oklch(0.74 0.19 155 / 0.2)",
          color: "oklch(0.74 0.19 155)",
        }}
      >
        INNINGS BREAK
      </div>

      <h2 className="text-2xl font-bold text-white mb-6">1st Innings Over!</h2>

      <div
        className="rounded-2xl p-6 mb-6"
        style={{ background: "oklch(0.22 0.05 225)" }}
      >
        <p className="text-gray-400 text-sm mb-2">1st Innings Score</p>
        <p className="text-6xl font-black text-white mb-4">{innings1Score}</p>
        {target > 0 && (
          <div
            className="px-4 py-2 rounded-xl text-lg font-bold"
            style={{
              background: "oklch(0.74 0.19 155 / 0.2)",
              color: "oklch(0.74 0.19 155)",
            }}
          >
            🎯 Target: {target}
          </div>
        )}
      </div>

      <button
        type="button"
        data-ocid="innings_break.start_innings2.button"
        onClick={onStartInnings2}
        className="w-full py-4 rounded-xl text-white font-bold text-lg transition-all hover:scale-[1.02]"
        style={{ background: "oklch(0.74 0.19 155)" }}
      >
        Start 2nd Innings →
      </button>
    </motion.div>
  );
}

// ─── ResultScreen ─────────────────────────────────────────────────────────────
function ResultScreen({
  gameState,
  myName,
  onPlayAgain,
}: {
  gameState: GameStateDTO;
  myName: string;
  onPlayAgain: () => void;
}) {
  const winner = gameState.winner;
  const p1Score = Number(gameState.player1Score);
  const p2Score = Number(gameState.player2Score);
  const myNum = Number(gameState.playerNumber);
  const iWon =
    (winner === "player1" && myNum === 1) ||
    (winner === "player2" && myNum === 2);
  const isTie = winner === "tie";

  const p1Label = myNum === 1 ? myName || "Player 1" : "Opponent";
  const p2Label = myNum === 2 ? myName || "Player 2" : "Opponent";
  const winnerLabel =
    winner === "player1" ? p1Label : winner === "player2" ? p2Label : "";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      className="card-dark rounded-2xl p-8 text-center"
      data-ocid="result.panel"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
        className="text-7xl mb-4"
      >
        {isTie ? "🤝" : iWon ? "🏆" : "😔"}
      </motion.div>

      <h2
        className="text-3xl font-bold mb-6"
        style={{
          color: isTie
            ? "oklch(0.75 0.15 85)"
            : iWon
              ? "oklch(0.74 0.19 155)"
              : "oklch(0.7 0.2 27)",
        }}
      >
        {isTie ? "It's a Tie!" : iWon ? "You Win! 🎉" : "Opponent Wins!"}
      </h2>

      <div
        className="rounded-2xl p-6 mb-6"
        style={{ background: "oklch(0.22 0.05 225)" }}
      >
        <div className="grid grid-cols-3 gap-4 items-center">
          <div>
            <p className="text-gray-400 text-xs mb-1 truncate">{p1Label}</p>
            <p className="text-white text-3xl font-black">{p1Score}</p>
          </div>
          <div>
            <p
              className="text-2xl font-bold"
              style={{ color: "oklch(0.74 0.19 155)" }}
            >
              VS
            </p>
          </div>
          <div>
            <p className="text-gray-400 text-xs mb-1 truncate">{p2Label}</p>
            <p className="text-white text-3xl font-black">{p2Score}</p>
          </div>
        </div>
        {!isTie && (
          <p className="text-sm mt-3" style={{ color: "oklch(0.74 0.19 155)" }}>
            {winnerLabel} wins!
          </p>
        )}
      </div>

      <button
        type="button"
        data-ocid="result.play_again.button"
        onClick={onPlayAgain}
        className="w-full py-4 rounded-xl text-white font-bold text-lg transition-all hover:scale-[1.02]"
        style={{ background: "oklch(0.74 0.19 155)" }}
      >
        Play Again 🏏
      </button>
    </motion.div>
  );
}

// ─── HowToPlayCard ────────────────────────────────────────────────────────────
function HowToPlayCard() {
  const steps = [
    {
      icon: "📱",
      text: "One player creates a room and shares the 4-letter code",
    },
    { icon: "🔗", text: "Friend joins on their phone using the code" },
    {
      icon: "🪙",
      text: "Player 1 flips the coin — winner chooses to bat or bowl",
    },
    {
      icon: "✋",
      text: "Both players secretly pick a number 1–6 simultaneously",
    },
    { icon: "💥", text: "Same number = WICKET! (1 wicket ends the innings)" },
    { icon: "🎯", text: "Different numbers = runs scored (batter's number)" },
    { icon: "🏆", text: "Highest score after 2 innings wins the match!" },
  ];

  return (
    <div className="card-dark rounded-2xl p-6" data-ocid="how_to_play.panel">
      <h3 className="text-lg font-bold text-white mb-4">
        🏏 How To Play (1v1)
      </h3>
      <ul className="space-y-3">
        {steps.map((s) => (
          <li key={s.icon} className="flex items-start gap-3">
            <span className="text-xl flex-shrink-0">{s.icon}</span>
            <p className="text-sm" style={{ color: "oklch(0.7 0.01 250)" }}>
              {s.text}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── AboutCard ────────────────────────────────────────────────────────────────
function AboutCard() {
  return (
    <div className="card-dark rounded-2xl p-6" data-ocid="about.panel">
      <h3 className="text-lg font-bold text-white mb-4">
        🌏 About Hand Cricket
      </h3>
      <div
        className="space-y-3 text-sm"
        style={{ color: "oklch(0.6 0.01 250)" }}
      >
        <p>
          Hand Cricket is a beloved childhood game popular across South Asia.
          Two players simultaneously show fingers, simulating a bat vs ball
          contest — no equipment needed, just your hands and a friend!
        </p>
        <p>
          This 1v1 version lets you play against a real person on a different
          phone via a shared room code. Pure, real-time competition — just like
          the playground.
        </p>
        <div
          className="mt-4 px-4 py-3 rounded-xl text-xs"
          style={{
            background: "oklch(0.22 0.05 225)",
            color: "oklch(0.5 0.01 260)",
          }}
        >
          💡 <strong className="text-gray-300">Pro Tip:</strong> Mix up your
          picks unpredictably — your opponent will try to guess your number to
          get you out. Stay random!
        </div>
      </div>
    </div>
  );
}
