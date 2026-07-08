import { Move } from 'boardgame.io';
import { INVALID_MOVE } from 'boardgame.io/core';
import { JassState, MeldType } from './types';
import { Card, Suit } from './constants';
import { isMoveLegal, isMeldBetter, isCardHigherInTrick, getBestMeldHighestCard } from './validation';
import { NON_TRUMP_VALUES, TRUMP_VALUES } from './constants';

function calculateCardPoints(card: Card, trumpSuit: Suit): number {
  if (card.suit === trumpSuit) {
     return TRUMP_VALUES[card.rank];
  }
  return NON_TRUMP_VALUES[card.rank];
}

// --- PLAYING PHASE MOVES ---

export const playCard: Move<JassState> = ({ G, ctx, events }, card: Card, meldDeclaration?: MeldType) => {
  const hand = G.hands[ctx.currentPlayer];
  const hasCard = hand.some(c => c.suit === card.suit && c.rank === card.rank);
  if (!hasCard) return INVALID_MOVE;

  const leadPlayer = G.currentTrick.leadPlayer;
  const isFirstCardOfHand = G.pastTricks.length === 0;
  const isFirstPlayerOfTrick = Object.keys(G.currentTrick.cards).length === 0;
  
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

  // Handle Melds on the very first trick of the hand
  if (isFirstCardOfHand) {
     if (isFirstPlayerOfTrick) {
        // Player 1 (vorne) plays first card
        if (meldDeclaration) {
           G.pendingMeld = { player: ctx.currentPlayer, type: meldDeclaration, heightDeclared: false };
        }
     } else {
        // Player 2 plays second card of first trick
        // Resolve Melds automatically!
        const player1 = G.vorne;
        const player2 = ctx.currentPlayer;
        
        let p1MeldType = G.pendingMeld?.type;
        let p2MeldType = meldDeclaration;

        if (p1MeldType || p2MeldType) {
           // We need getBestMeldHighestCard from validation.ts
           // We will calculate it below. For now, we store the result.
           let p1Best = p1MeldType ? getBestMeldHighestCard(G.hands[player1].concat([G.currentTrick.cards[player1]]), p1MeldType, G.trump!) : null;
           let p2Best = p2MeldType ? getBestMeldHighestCard(G.hands[player2].concat([G.currentTrick.cards[player2]]), p2MeldType, G.trump!) : null;

           let winner = null;
           let winningMeldType = null;
           let winningCards: Card[] = [];

           if (p1MeldType && !p2MeldType) {
              winner = player1; winningMeldType = p1MeldType;
           } else if (!p1MeldType && p2MeldType) {
              winner = player2; winningMeldType = p2MeldType;
           } else if (p1MeldType && p2MeldType && p1Best && p2Best) {
              const meldA = { type: p1MeldType, highestCard: p1Best, cards: [] };
              const meldB = { type: p2MeldType, highestCard: p2Best, cards: [] };
              if (isMeldBetter(meldA, meldB, G.trump!)) {
                 winner = player1; winningMeldType = p1MeldType;
              } else {
                 winner = player2; winningMeldType = p2MeldType;
              }
           }

           if (winner && winningMeldType) {
              const points = winningMeldType === 'Fünfzig' ? 50 : 20;
              G.handScores[winner] += points;
              G.handScoreDetails[winner].melds += points;
              G.shownMelds.push({ player: winner, type: winningMeldType, cards: [] });
           }
        }
        G.pendingMeld = null; // Clear it, it's resolved!
     }
  }

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
     G.handScoreDetails[winnerPlayer].tricks += points;

     G.pastTricks.push({ ...G.currentTrick });
     G.currentTrick = { leadPlayer: winnerPlayer, cards: {}, winner: null };
     
     // Check if hand is over
     if (G.hands['0'].length === 0 && G.hands['1'].length === 0) {
        // Last trick gets 10 points
        G.handScores[winnerPlayer] += 10;
        G.handScoreDetails[winnerPlayer].lastTrick += 10;
        
        // Add to total scores
        G.scores['0'] += G.handScores['0'];
        G.scores['1'] += G.handScores['1'];
        
        // Check win condition (>= 301)
        // If somebody reached target score, we could end the game. For now we just go to endOfHand.
        events.endPhase();
     } else {
        events.endTurn({ next: winnerPlayer });
     }
  } else {
     // Trick not full, next player
     events.endTurn();
  }
};
