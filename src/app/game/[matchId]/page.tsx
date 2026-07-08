'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useJassGame } from '../useJassGame';
import { Card, Suit } from '@/game/constants';
import { MeldType } from '@/game/types';

function createMoveAction(moveName: string, args: any[], playerId: string) {
  return {
    type: 'MAKE_MOVE',
    payload: {
      type: moveName,
      args,
      playerID: playerId,
    }
  };
}

const suitSymbols = { 'Spades': '♠', 'Hearts': '♥', 'Diamonds': '♦', 'Clubs': '♣' };
const suitColors = { 'Spades': 'black', 'Hearts': 'red', 'Diamonds': 'red', 'Clubs': 'black' };

function CardView({ card, onClick, style }: { card: Card, onClick?: () => void, style?: React.CSSProperties }) {
  const color = suitColors[card.suit];
  const symbol = suitSymbols[card.suit];
  
  return (
    <div 
      onClick={onClick}
      style={{ 
        width: '80px', height: '120px', background: 'white', borderRadius: '8px', 
        color, display: 'flex', flexDirection: 'column', padding: '0.5rem',
        cursor: onClick ? 'pointer' : 'default', transition: 'transform 0.2s',
        boxShadow: '-2px 0 5px rgba(0,0,0,0.2)', userSelect: 'none',
        ...style
      }}
    >
      <div style={{ fontWeight: 'bold', fontSize: '1.25rem' }}>{card.rank}{symbol}</div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem' }}>
        {symbol}
      </div>
    </div>
  );
}

export default function GamePage() {
  const params = useParams();
  const matchId = params.matchId as string;
  const [playerId, setPlayerId] = useState<string | null>(null);

  // Local UI State
  const [pendingCardToPlay, setPendingCardToPlay] = useState<Card | null>(null);
  const [selectedMeldType, setSelectedMeldType] = useState<MeldType | 'None'>('None');

  useEffect(() => {
    setPlayerId(localStorage.getItem(`jass_player_${matchId}`) || '0');
  }, [matchId]);

  const { state, loading, dispatchMove } = useJassGame(matchId, playerId);

  if (loading || !state) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: 'white' }}>Lade Spiel...</div>;
  }

  const { G, ctx } = state;
  const opponentId = playerId === '0' ? '1' : '0';
  const myHand: Card[] = G.hands[playerId || '0'];
  const opponentHandCount = G.hands[opponentId].length;
  const isMyTurn = ctx.currentPlayer === playerId;

  const handlePlayCard = (card: Card) => {
    if (!isMyTurn) return;

    if (ctx.phase === 'melding') {
      // In melding phase, open a mini dialog to ask for melds
      setPendingCardToPlay(card);
    } else if (ctx.phase === 'playing') {
      dispatchMove(createMoveAction('playCard', [card], playerId!));
    }
  };

  const confirmPlayAndMeld = () => {
    if (pendingCardToPlay) {
      const meldArg = selectedMeldType === 'None' ? undefined : selectedMeldType;
      dispatchMove(createMoveAction('playCardAndMeld', [pendingCardToPlay, meldArg], playerId!));
      setPendingCardToPlay(null);
      setSelectedMeldType('None');
    }
  };

  return (
    <main style={{ padding: '2rem', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem 2rem', marginBottom: '1rem' }}>
        <div>
           <div style={{ fontSize: '0.875rem', color: '#cbd5e1' }}>Match ID: {matchId} | Spieler: {playerId}</div>
           <div style={{ fontWeight: 'bold' }}>
             Phase: {ctx.phase} {isMyTurn && <span style={{ color: 'var(--accent)' }}>(Du bist am Zug!)</span>}
           </div>
           {G.trump && <div style={{ marginTop: '0.5rem', color: suitColors[G.trump] }}>Trumpf: {G.trump} {suitSymbols[G.trump]}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
           <div style={{ fontSize: '0.875rem', color: '#cbd5e1' }}>Score</div>
           <div style={{ fontWeight: 'bold', fontSize: '1.25rem', color: '#10b981' }}>P0: {G.scores['0']} - P1: {G.scores['1']}</div>
           
           <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '1rem' }}>
             <div style={{ padding: '0.25rem 0.5rem', border: '1px solid white', borderRadius: '4px' }}>
                Würfel: {G.cube.value} {G.cube.holder && `(Gehört: P${G.cube.holder})`}
             </div>
             {(!G.cubeOffer && (G.cube.holder === null || G.cube.holder === playerId)) && (
               <button className="btn" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                       onClick={() => dispatchMove(createMoveAction('doubleCube', [], playerId!))}>
                 Drehen
               </button>
             )}
             {G.cubeOffer && G.cubeOffer.from !== playerId && (
               <div style={{ display: 'flex', gap: '0.5rem' }}>
                 <button className="btn btn-accent" onClick={() => dispatchMove(createMoveAction('acceptCube', [], playerId!))}>Annehmen</button>
                 <button className="btn" style={{ background: 'red' }} onClick={() => dispatchMove(createMoveAction('declineCube', [], playerId!))}>Ablehnen</button>
               </div>
             )}
           </div>
        </div>
      </header>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        
        {/* Opponent Area */}
        <div style={{ height: '120px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}>
          {Array.from({ length: opponentHandCount }).map((_, i) => (
             <div key={i} style={{ width: '60px', height: '90px', background: 'url(/card-back.png) center/cover, var(--primary)', borderRadius: '8px', border: '2px solid white' }} />
          ))}
        </div>

        {/* Play Area */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '2rem' }}>
           
           {/* TRUMP SELECTION PHASE UI */}
           {ctx.phase === 'trumpSelection' && (
             <div style={{ textAlign: 'center' }}>
                <h3 style={{ marginBottom: '1rem' }}>Trumpf-Verhandlung</h3>
                {G.revealedCard && <CardView card={G.revealedCard} style={{ margin: '0 auto 1rem auto' }} />}
                
                {isMyTurn && G.trumpSelectionPassedCount < 2 && (
                  <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                    <button className="btn btn-accent" onClick={() => dispatchMove(createMoveAction('acceptOriginal', [], playerId!))}>Annehmen</button>
                    <button className="btn" style={{ background: '#ef4444' }} onClick={() => dispatchMove(createMoveAction('decline', [], playerId!))}>Ablehnen</button>
                  </div>
                )}

                {isMyTurn && G.trumpSelectionPassedCount === 2 && G.vorne === playerId && !G.smallGameAnnounced && (
                  <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap', maxWidth: '300px' }}>
                    <button className="btn btn-accent" onClick={() => dispatchMove(createMoveAction('announceSmallGame', [], playerId!))}>Kleines Spiel ansagen</button>
                    {['Spades', 'Hearts', 'Diamonds', 'Clubs'].filter(s => s !== G.revealedCard?.suit).map(suit => (
                       <button key={suit} className="btn" onClick={() => dispatchMove(createMoveAction('chooseTrump', [suit], playerId!))}>
                         {suitSymbols[suit as Suit]} wählen
                       </button>
                    ))}
                    <button className="btn" style={{ background: '#ef4444' }} onClick={() => dispatchMove(createMoveAction('decline', [], playerId!))}>Schieben</button>
                  </div>
                )}

                {isMyTurn && G.smallGameAnnounced && G.dealer === playerId && (
                  <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                    <button className="btn btn-accent" onClick={() => dispatchMove(createMoveAction('acceptSmallGame', [], playerId!))}>Zulassen</button>
                    <button className="btn" style={{ background: '#ef4444' }} onClick={() => dispatchMove(createMoveAction('overruleSmallGame', [], playerId!))}>Besser schlagen (Kreuz erzwingen)</button>
                  </div>
                )}

                {isMyTurn && G.trumpSelectionPassedCount === 3 && G.dealer === playerId && (
                  <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                    {['Spades', 'Hearts', 'Diamonds', 'Clubs'].filter(s => s !== G.revealedCard?.suit).map(suit => (
                       <button key={suit} className="btn" onClick={() => dispatchMove(createMoveAction('chooseTrump', [suit], playerId!))}>
                         {suitSymbols[suit as Suit]} wählen
                       </button>
                    ))}
                    <button className="btn" style={{ background: '#ef4444' }} onClick={() => dispatchMove(createMoveAction('decline', [], playerId!))}>Abbrechen (Neu geben)</button>
                  </div>
                )}

                {isMyTurn && G.smallGameAnnounced && G.vorne === playerId && G.trumpSelectionPassedCount === 2 /* after acceptSmallGame */ && (
                  <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                     {/* The dealer accepted, now vorne must choose */}
                     {['Spades', 'Hearts', 'Diamonds', 'Clubs'].filter(s => s !== G.revealedCard?.suit).map(suit => (
                       <button key={suit} className="btn" onClick={() => dispatchMove(createMoveAction('chooseTrump', [suit], playerId!))}>
                         {suitSymbols[suit as Suit]} wählen
                       </button>
                    ))}
                  </div>
                )}
             </div>
           )}

           {/* MELDING AND PLAYING PHASE UI */}
           {(ctx.phase === 'melding' || ctx.phase === 'playing') && (
             <div style={{ display: 'flex', gap: '1rem', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  {Object.entries(G.currentTrick.cards).map(([pId, card]: [string, any]) => (
                     <CardView key={pId} card={card} style={{ transform: pId === playerId ? 'translateY(20px)' : 'translateY(-20px)' }} />
                  ))}
                </div>

                {/* Opponent's pending meld reply */}
                {ctx.phase === 'melding' && G.pendingMeld && G.pendingMeld.player !== playerId && isMyTurn && (
                   <div className="glass-panel" style={{ marginTop: '2rem' }}>
                      <p style={{ marginBottom: '1rem' }}>Gegner meldet: <strong>{G.pendingMeld.type}</strong></p>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="btn btn-accent" onClick={() => dispatchMove(createMoveAction('replyToMeld', ['Ist gut'], playerId!))}>Ist gut</button>
                        <button className="btn" onClick={() => dispatchMove(createMoveAction('replyToMeld', ['Ich auch'], playerId!))}>Ich auch</button>
                        <button className="btn" style={{ background: '#ef4444' }} onClick={() => dispatchMove(createMoveAction('replyToMeld', ['Ist nicht gut'], playerId!))}>Ist nicht gut (Besser)</button>
                      </div>
                   </div>
                )}
             </div>
           )}

        </div>

        {/* Player Area */}
        <div style={{ height: '150px', display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: '0.5rem', paddingBottom: '1rem', position: 'relative' }}>
           
           {/* Melding Dialog */}
           {pendingCardToPlay && (
             <div className="glass-panel" style={{ position: 'absolute', bottom: '160px', left: '50%', transform: 'translateX(-50%)', zIndex: 10, display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <span>Meldung?</span>
                <select value={selectedMeldType} onChange={e => setSelectedMeldType(e.target.value as any)} style={{ padding: '0.5rem', borderRadius: '4px', background: 'rgba(0,0,0,0.5)', color: 'white' }}>
                  <option value="None">Keine</option>
                  <option value="Terz">Terz</option>
                  <option value="Fünfzig">Fünfzig</option>
                  <option value="Bella">Bella</option>
                </select>
                <button className="btn btn-accent" onClick={confirmPlayAndMeld}>Karte legen</button>
                <button className="btn" onClick={() => setPendingCardToPlay(null)}>Abbrechen</button>
             </div>
           )}

           {myHand.map((card, i) => {
              const offset = Math.abs((myHand.length / 2) - 0.5 - i) * 5;
              const rotation = (i - (myHand.length / 2) + 0.5) * 5;
              return (
                 <div key={`${card.suit}-${card.rank}`} style={{ transform: `translateY(${offset}px) rotate(${rotation}deg)` }}>
                   <CardView 
                      card={card} 
                      onClick={() => handlePlayCard(card)}
                   />
                 </div>
              );
           })}
        </div>
      </div>
    </main>
  );
}
