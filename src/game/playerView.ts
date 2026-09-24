import type {
  GameClientState,
  JassState,
  PlayerID,
  PlayerJassState,
  ServerGameState,
} from './types';
import { RULES_VERSION } from './types';

export function createClientState(state: ServerGameState, playerID: PlayerID): GameClientState {
  const { hands } = state.G;
  const playerHands = {
    '0': playerID === '0' ? hands['0'] : [],
    '1': playerID === '1' ? hands['1'] : [],
  };
  const G: PlayerJassState = {
    ...state.G,
    deck: [],
    hands: playerHands,
    handCounts: { '0': hands['0'].length, '1': hands['1'].length },
    talonCount: state.G.deck.length,
    timeoutCard: state.ctx.currentPlayer === playerID ? state.G.timeoutCard ?? null : null,
    timeoutSelection: state.ctx.currentPlayer === playerID ? state.G.timeoutSelection ?? null : null,
    // Older saved matches may still contain this automatic disclosure of an unplayed seven.
    chatMessages: (state.G.chatMessages ?? []).filter((message) => !(message.kind === 'dealer'
      && (message.speechText === 'Ich behalte die passende 7!'
        || message.text.endsWith(' behält die passende 7 auf der Hand.')))),
  };

  // Keep this assignment explicit: no reducer logs, undo snapshots or plugin data
  // cross the API boundary because they can contain both players' private hands.
  return { G, ctx: state.ctx, _stateID: state._stateID };
}

export function isServerGameState(value: unknown): value is ServerGameState {
  if (!value || typeof value !== 'object') return false;
  const state = value as { G?: unknown; ctx?: unknown; _stateID?: unknown };
  if (!state.G || typeof state.G !== 'object' || !state.ctx || typeof state.ctx !== 'object') {
    return false;
  }

  const game = state.G as Partial<JassState>;
  return Boolean(
    typeof state._stateID === 'number' &&
      game.rulesVersion === RULES_VERSION &&
      game.playerNames &&
      game.settings &&
      game.hands &&
      Array.isArray(game.deck) &&
      typeof game.handNumber === 'number' &&
      typeof game.gameNumber === 'number' &&
      game.matchPoints &&
      Array.isArray(game.announcedBella) &&
      Array.isArray(game.nextGamePlayers),
  );
}
