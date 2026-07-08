import { Move } from 'boardgame.io';
import { INVALID_MOVE } from 'boardgame.io/core';
import { JassState, MeldType } from './types';
import { Card, Suit } from './constants';
import { isMoveLegal, isMeldBetter, isCardHigherInTrick } from './validation';
import { NON_TRUMP_VALUES, TRUMP_VALUES } from './constants';

function calculateCardPoints(card: Card, trumpSuit: Suit): number {
  if (card.suit === trumpSuit) {
     return TRUMP_VALUES[card.rank];
  }
  return NON_TRUMP_VALUES[card.rank];
}

// --- MELDING PHASE MOVES ---

export const playCardAndMeld: Move<JassState> = ({ G, ctx, events }, card: Card, meldType?: MeldType) => {
  if (ctx.currentPlayer !== G.vorne) return INVALID_MOVE;
  
  // Actually, the player just plays a card and optionally announces.
  // We need to keep this card pending or start the trick.
  G.currentTrick.leadPlayer = ctx.currentPlayer;
  G.currentTrick.cards[ctx.currentPlayer] = card;
  
  // Remove card from hand
  G.hands[ctx.currentPlayer] = G.hands[ctx.currentPlayer].filter(c => c.suit !== card.suit || c.rank !== card.rank);

  if (meldType) {
    G.pendingMeld = { player: ctx.currentPlayer, type: meldType, heightDeclared: false };
    events.endTurn(); // Opponent must reply to meld before playing their card
  } else {
    events.endPhase(); // No meld, jump straight to playing phase
  }
};

export const replyToMeld: Move<JassState> = ({ G, ctx, events }, reply: 'Ist gut' | 'Ist nicht gut' | 'Ich auch') => {
  if (!G.pendingMeld || ctx.currentPlayer === G.pendingMeld.player) return INVALID_MOVE;

  if (reply === 'Ist gut') {
    // Opponent accepts meld. 
    // In a real implementation, the player would show their melds here.
    G.pendingMeld = null;
    events.endPhase();
  } else if (reply === 'Ist nicht gut') {
    // Opponent claims a better meld (e.g. Fünfzig vs Terz).
    // Opponent must show it now. We skip this for brevity and just accept they won the meld negotiation.
    G.pendingMeld = null;
    events.endPhase();
  } else if (reply === 'Ich auch') {
    // Both have the same meld type. The first player must now declare height.
    events.endTurn(); 
  }
};

export const declareMeldHeight: Move<JassState> = ({ G, ctx, events }, height: Card) => {
   if (!G.pendingMeld || ctx.currentPlayer !== G.pendingMeld.player) return INVALID_MOVE;
   // The other player now checks if they have a higher one, etc.
   // We simplify this logic for now.
   G.pendingMeld = null;
   events.endPhase();
};

// --- PLAYING PHASE MOVES ---

export const playCard: Move<JassState> = ({ G, ctx, events }, card: Card) => {
  const hand = G.hands[ctx.currentPlayer];
  const hasCard = hand.some(c => c.suit === card.suit && c.rank === card.rank);
  if (!hasCard) return INVALID_MOVE;

  const leadPlayer = G.currentTrick.leadPlayer;
  const leadCard = G.currentTrick.cards[leadPlayer];
  const leadSuit = leadCard ? leadCard.suit : null;
  const trickCards = Object.values(G.currentTrick.cards);

  // Validate legality (Farbzwang, Stech-Pflicht)
  if (!isMoveLegal(card, hand, trickCards, leadSuit, G.trump!)) {
    return INVALID_MOVE;
  }

  // Play the card
  G.currentTrick.cards[ctx.currentPlayer] = card;
  G.hands[ctx.currentPlayer] = hand.filter(c => c.suit !== card.suit || c.rank !== card.rank);

  // If trick is full (both played)
  if (Object.keys(G.currentTrick.cards).length === 2) {
     const opponent = ctx.currentPlayer === '0' ? '1' : '0';
     const trickCards = [G.currentTrick.cards[leadPlayer], G.currentTrick.cards[opponent]];
     
     const winnerCard = isCardHigherInTrick(trickCards[1], trickCards[0], leadSuit!, G.trump!) 
        ? trickCards[1] : trickCards[0];
     
     const winnerPlayer = G.currentTrick.cards['0'] === winnerCard ? '0' : '1';
     
     G.trickWinner = winnerPlayer;
     G.currentTrick.winner = winnerPlayer;
     
     // Calculate points
     const points = calculateCardPoints(trickCards[0], G.trump!) + calculateCardPoints(trickCards[1], G.trump!);
     G.handScores[winnerPlayer] += points;

     G.pastTricks.push({ ...G.currentTrick });
     G.currentTrick = { leadPlayer: winnerPlayer, cards: {}, winner: null };
     
     // Check if hand is over
     if (G.hands['0'].length === 0 && G.hands['1'].length === 0) {
        // Last trick gets 10 points
        G.handScores[winnerPlayer] += 10;
        
        // Add to total scores
        G.scores['0'] += G.handScores['0'];
        G.scores['1'] += G.handScores['1'];
        
        // Check win condition (>= 301)
        // Re-deal if nobody reached target score
        events.setPhase('deal');
     } else {
        events.endTurn({ next: winnerPlayer });
     }
  } else {
     // Trick not full, next player
     events.endTurn();
  }
};
