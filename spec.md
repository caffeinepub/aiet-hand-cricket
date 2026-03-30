# AIET HAND CRICKET

## Current State
Fully functional 1v1 hand cricket game with room-based matchmaking. All screens use "Player 1" / "Player 2" as identifiers. No name entry exists.

## Requested Changes (Diff)

### Add
- Player name input field in LobbyScreen ("Your name" input, shown before Create/Join buttons)
- Store player name in localStorage alongside session data
- Pass player name through SessionData type

### Modify
- SessionData interface: add `myName: string` field
- LobbyScreen: add name input above both Create and Join sections
- WaitingScreen: show player's own name
- TossScreen: replace "Player 1" / "Player 2" with actual names where known (own name always known; opponent name not available without backend changes, so keep "Opponent" for the other side)
- ChooseBatBowlScreen: same substitution
- InningsScreen: replace "Player 1" / "Player 2" score labels with names where own player number is known
- ResultScreen: replace "Player 1" / "Player 2" with names, and show "You (Name)" for self

### Remove
- Nothing removed

## Implementation Plan
1. Add `myName` to SessionData, saveSession, loadSession (frontend only)
2. Add name input state to App, pass `myName` to handleCreateRoom/handleJoinRoom
3. Update LobbyScreen to show name input field
4. Pass `myName` as prop to all game screens
5. Update each screen to use name instead of generic "Player N" labels
   - Own player: use myName
   - Opponent: use "Opponent"
