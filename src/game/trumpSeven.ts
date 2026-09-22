import type { JassState, PlayerID } from './types';

type TrumpSevenState = Pick<
  JassState,
  | 'contract'
  | 'currentTrick'
  | 'hands'
  | 'pastTricks'
  | 'revealedCard'
  | 'trump'
  | 'trumpSevenDecisions'
>;

export function canExchangeTrumpSeven(G: TrumpSevenState, playerID: PlayerID): boolean {
  return Boolean(
    G.contract &&
      G.trump &&
      G.revealedCard &&
      G.revealedCard.rank !== '7' &&
      !(G.trumpSevenDecisions ?? []).includes(playerID) &&
      G.pastTricks.length === 0 &&
      Object.keys(G.currentTrick.cards).length === 0 &&
      G.hands[playerID].some((card) => card.suit === G.revealedCard?.suit && card.rank === '7'),
  );
}
