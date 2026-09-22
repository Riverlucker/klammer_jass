import type { Card } from './constants';
import type { PlayerID, PlayerJassState } from './types';

export const MELD_REVEAL_MILLISECONDS = 3000;

export function revealedMeldCards(G: PlayerJassState, player: PlayerID, now: number): Card[] {
  const played = [...G.pastTricks, G.currentTrick].flatMap((trick) => {
    const card = trick.cards[player];
    return card ? [card] : [];
  });
  const cards: Card[] = [];
  for (const message of G.chatMessages ?? []) {
    if (message.playerId !== player || message.gameNumber !== G.gameNumber || message.handNumber !== G.handNumber
      || now < message.createdAt || now >= message.createdAt + MELD_REVEAL_MILLISECONDS) continue;
    for (const card of message.meldCards ?? []) {
      if (![...played, ...cards].some((other) => other.suit === card.suit && other.rank === card.rank)) cards.push(card);
    }
  }
  return cards;
}
