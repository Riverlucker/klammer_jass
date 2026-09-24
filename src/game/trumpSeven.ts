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
  | 'cubeOffer'
  | 'matchPaused'
>;

export function canExchangeTrumpSeven(G: TrumpSevenState, playerID: PlayerID): boolean {
  return Boolean(
    G.contract &&
      G.trump &&
      G.revealedCard &&
      G.revealedCard.rank !== '7' &&
      !(G.trumpSevenDecisions ?? []).includes(playerID) &&
      !G.cubeOffer && !G.matchPaused &&
      G.pastTricks.length === 0 &&
      !G.currentTrick.cards[playerID] &&
      G.hands[playerID].some((card) => card.suit === G.revealedCard?.suit && card.rank === '7'),
  );
}
