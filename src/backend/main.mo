import Array "mo:base/Array";
import HashMap "mo:base/HashMap";
import Int "mo:base/Int";
import Iter "mo:base/Iter";
import Nat "mo:base/Nat";
import Nat32 "mo:base/Nat32";
import Option "mo:base/Option";
import Text "mo:base/Text";
import Time "mo:base/Time";

persistent actor {

  // ── Stable types (no var fields, no HashMap) ──────────────────────────────

  type Phase = {
    #waiting;
    #toss;
    #chooseBatBowl;
    #innings1;
    #inningsBreak;
    #innings2;
    #result;
  };

  type BallResult = {
    pick1 : Nat;
    pick2 : Nat;
    runs : Nat;
    isWicket : Bool;
    batterRuns : Nat;
  };

  type RoomData = {
    code : Text;
    player1Session : Text;
    player2Session : Text;
    phase : Phase;
    player1Batting : Bool;
    player1Score : Nat;
    player2Score : Nat;
    innings1Score : Nat;
    innings2Score : Nat;
    target : Nat;
    tossWinner : Nat;
    tossResult : Text;
    ballHistory : [BallResult];
    currentPick1 : ?Nat;
    currentPick2 : ?Nat;
    winner : Text;
    lastBall : ?BallResult;
  };

  type GameStateDTO = {
    code : Text;
    phase : Text;
    playerNumber : Nat;
    player1Score : Nat;
    player2Score : Nat;
    player1Batting : Bool;
    innings1Score : Nat;
    target : Nat;
    tossWinner : Nat;
    tossResult : Text;
    myPick : ?Nat;
    opponentPicked : Bool;
    ballHistory : [BallResult];
    lastBall : ?BallResult;
    winner : Text;
    waitingForOpponent : Bool;
  };

  // ── Stable backing storage ────────────────────────────────────────────────

  var roomEntries : [(Text, RoomData)] = [];
  var counter : Nat = 0;

  // ── In-memory HashMap (rebuilt on upgrade) ────────────────────────────────

  transient var rooms : HashMap.HashMap<Text, RoomData> =
    HashMap.fromIter(roomEntries.vals(), 16, Text.equal, Text.hash);

  system func preupgrade() {
    roomEntries := Iter.toArray(rooms.entries());
  };

  system func postupgrade() {
    rooms := HashMap.fromIter(roomEntries.vals(), 16, Text.equal, Text.hash);
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  func genCode() : Text {
    counter += 1;
    let t : Int = Time.now();
    let seed : Nat = counter * 7919 + (Int.abs(t) % 10000);
    let n = Nat32.toNat(Nat32.fromNat(seed % 614656)); // 28^4
    let digits = ["A","B","C","D","E","F","G","H","J","K","M","N","P","R","S","T","W","X","Y","Z","2","3","4","5","6","7","8","9"];
    digits[n % 28] # digits[(n / 28) % 28] # digits[(n / 784) % 28] # digits[(n / 21952) % 28]
  };

  func genSession(prefix : Text) : Text {
    counter += 1;
    prefix # Nat.toText(counter) # Nat.toText((counter * 1234567) % 999999)
  };

  func phaseToText(p : Phase) : Text {
    switch p {
      case (#waiting)      "waiting";
      case (#toss)         "toss";
      case (#chooseBatBowl) "chooseBatBowl";
      case (#innings1)     "innings1";
      case (#inningsBreak) "inningsBreak";
      case (#innings2)     "innings2";
      case (#result)       "result";
    }
  };

  func emptyRoom(code : Text, session : Text) : RoomData = {
    code;
    player1Session = session;
    player2Session = "";
    phase = #waiting;
    player1Batting = true;
    player1Score = 0;
    player2Score = 0;
    innings1Score = 0;
    innings2Score = 0;
    target = 0;
    tossWinner = 0;
    tossResult = "";
    ballHistory = [];
    currentPick1 = null;
    currentPick2 = null;
    winner = "";
    lastBall = null;
  };

  // ── Public API ────────────────────────────────────────────────────────────

  public func createRoom() : async { code : Text; sessionId : Text } {
    let code = genCode();
    let session = genSession("p1");
    rooms.put(code, emptyRoom(code, session));
    { code; sessionId = session }
  };

  public func joinRoom(code : Text) : async { #ok : { sessionId : Text }; #err : Text } {
    switch (rooms.get(code)) {
      case null { #err "Room not found" };
      case (?r) {
        if (r.player2Session != "") return #err "Room is full";
        let session = genSession("p2");
        rooms.put(code, { r with player2Session = session; phase = #toss });
        #ok { sessionId = session }
      };
    }
  };

  public func getGameState(code : Text, sessionId : Text) : async { #ok : GameStateDTO; #err : Text } {
    switch (rooms.get(code)) {
      case null { #err "Room not found" };
      case (?r) {
        let playerNumber : Nat =
          if (r.player1Session == sessionId) 1
          else if (r.player2Session == sessionId) 2
          else return #err "Invalid session";
        let myPick = if (playerNumber == 1) r.currentPick1 else r.currentPick2;
        let opponentPicked = if (playerNumber == 1)
          Option.isSome(r.currentPick2)
        else
          Option.isSome(r.currentPick1);
        let waitingForOpponent = Option.isSome(myPick) and not opponentPicked;
        #ok {
          code = r.code;
          phase = phaseToText(r.phase);
          playerNumber;
          player1Score = r.player1Score;
          player2Score = r.player2Score;
          player1Batting = r.player1Batting;
          innings1Score = r.innings1Score;
          target = r.target;
          tossWinner = r.tossWinner;
          tossResult = r.tossResult;
          myPick;
          opponentPicked;
          ballHistory = r.ballHistory;
          lastBall = r.lastBall;
          winner = r.winner;
          waitingForOpponent;
        }
      };
    }
  };

  public func flipCoin(code : Text, sessionId : Text, coinChoice : Text) : async { #ok; #err : Text } {
    switch (rooms.get(code)) {
      case null { #err "Room not found" };
      case (?r) {
        if (r.player1Session != sessionId) return #err "Only player 1 can flip";
        if (phaseToText(r.phase) != "toss") return #err "Not toss phase";
        let t : Int = Time.now();
        let result = if ((Int.abs(t) % 2) == 0) "heads" else "tails";
        let w : Nat = if (result == coinChoice) 1 else 2;
        rooms.put(code, { r with tossResult = result; tossWinner = w; phase = #chooseBatBowl });
        #ok
      };
    }
  };

  public func chooseBatBowl(code : Text, sessionId : Text, choice : Text) : async { #ok; #err : Text } {
    switch (rooms.get(code)) {
      case null { #err "Room not found" };
      case (?r) {
        let playerNumber : Nat =
          if (r.player1Session == sessionId) 1
          else if (r.player2Session == sessionId) 2
          else return #err "Invalid session";
        if (r.tossWinner != playerNumber) return #err "Not your choice";
        if (phaseToText(r.phase) != "chooseBatBowl") return #err "Not choose phase";
        let p1Batting = if (playerNumber == 1) choice == "bat" else choice == "bowl";
        rooms.put(code, { r with player1Batting = p1Batting; phase = #innings1 });
        #ok
      };
    }
  };

  public func submitPick(code : Text, sessionId : Text, pick : Nat) : async { #ok; #err : Text } {
    if (pick < 1 or pick > 6) return #err "Pick must be 1-6";
    switch (rooms.get(code)) {
      case null { #err "Room not found" };
      case (?r) {
        let phase = phaseToText(r.phase);
        if (phase != "innings1" and phase != "innings2") return #err "Not in innings";
        let playerNumber : Nat =
          if (r.player1Session == sessionId) 1
          else if (r.player2Session == sessionId) 2
          else return #err "Invalid session";

        // Check already picked
        if (playerNumber == 1 and Option.isSome(r.currentPick1)) return #err "Already picked";
        if (playerNumber == 2 and Option.isSome(r.currentPick2)) return #err "Already picked";

        let updated1 = if (playerNumber == 1) ?pick else r.currentPick1;
        let updated2 = if (playerNumber == 2) ?pick else r.currentPick2;

        // Resolve if both picked
        switch (updated1, updated2) {
          case (?p1, ?p2) {
            let isWicket = p1 == p2;
            let batterRuns : Nat = if (isWicket) 0 else if (r.player1Batting) p1 else p2;
            let ball : BallResult = { pick1 = p1; pick2 = p2; runs = batterRuns; isWicket; batterRuns };
            let newHistory = Array.append(r.ballHistory, [ball]);

            var newP1Score = r.player1Score;
            var newP2Score = r.player2Score;
            var newInnings1Score = r.innings1Score;
            var newInnings2Score = r.innings2Score;

            if (phase == "innings1") {
              newInnings1Score += batterRuns;
              if (r.player1Batting) newP1Score += batterRuns else newP2Score += batterRuns;
            } else {
              newInnings2Score += batterRuns;
              if (not r.player1Batting) newP1Score += batterRuns else newP2Score += batterRuns;
            };

            let newTarget = if (phase == "innings1" and isWicket) newInnings1Score + 1 else r.target;

            let newPhase : Phase = if (isWicket) {
              if (phase == "innings1") #inningsBreak else #result
            } else if (phase == "innings2" and newInnings2Score >= r.target) {
              #result
            } else {
              r.phase
            };

            let newWinner : Text = if (newPhase == #result) {
              if (newP1Score > newP2Score) "player1"
              else if (newP2Score > newP1Score) "player2"
              else "tie"
            } else r.winner;

            rooms.put(code, {
              r with
              currentPick1 = null;
              currentPick2 = null;
              ballHistory = newHistory;
              lastBall = ?ball;
              player1Score = newP1Score;
              player2Score = newP2Score;
              innings1Score = newInnings1Score;
              innings2Score = newInnings2Score;
              target = newTarget;
              phase = newPhase;
              winner = newWinner;
            });
          };
          case _ {
            // Only one player picked so far — store partial picks
            rooms.put(code, { r with currentPick1 = updated1; currentPick2 = updated2 });
          };
        };
        #ok
      };
    }
  };

  public func startInnings2(code : Text, sessionId : Text) : async { #ok; #err : Text } {
    switch (rooms.get(code)) {
      case null { #err "Room not found" };
      case (?r) {
        if (r.player1Session != sessionId and r.player2Session != sessionId)
          return #err "Invalid session";
        if (phaseToText(r.phase) != "inningsBreak") return #err "Not innings break";
        rooms.put(code, { r with player1Batting = not r.player1Batting; phase = #innings2 });
        #ok
      };
    }
  };

};
