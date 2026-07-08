'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import { useJassGame } from '../useJassGame';
import { Card, Suit, TRUMP_ORDER, NON_TRUMP_ORDER } from '@/game/constants';
import { MeldType } from '@/game/types';
import { isMoveLegal } from '@/game/validation';

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

function sortHand(hand: Card[], trumpSuit: Suit | null): Card[] {
  const suitOrder: Suit[] = ['Spades', 'Hearts', 'Clubs', 'Diamonds'];
  return [...hand].sort((a, b) => {
    if (a.suit !== b.suit) return suitOrder.indexOf(a.suit) - suitOrder.indexOf(b.suit);
    const order = (a.suit === trumpSuit) ? TRUMP_ORDER : NON_TRUMP_ORDER;
    return order.indexOf(b.rank) - order.indexOf(a.rank);
  });
}

function CardView({ card, onClick, style, disabled }: { card: Card, onClick?: () => void, style?: React.CSSProperties, disabled?: boolean }) {
  const color = suitColors[card.suit];
  const symbol = suitSymbols[card.suit];
  
  return (
    <div 
      onClick={disabled ? undefined : onClick}
      className={disabled ? "" : "card-hover"}
      style={{ 
        width: '80px', height: '120px', background: 'white', borderRadius: '8px', 
        color, display: 'flex', flexDirection: 'column', padding: '0.5rem',
        cursor: disabled ? 'not-allowed' : (onClick ? 'pointer' : 'default'), 
        transition: 'transform 0.2s',
        boxShadow: '-2px 0 5px rgba(0,0,0,0.2)', userSelect: 'none',
        opacity: disabled ? 0.5 : 1,
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

  const [showLastTrick, setShowLastTrick] = useState(false);
  const previousTrickCount = useRef(0);

  useEffect(() => {
    setPlayerId(localStorage.getItem(`jass_player_${matchId}`) || '0');
  }, [matchId]);

  const { state, loading, dispatchMove } = useJassGame(matchId, playerId);

  useEffect(() => {
    if (state?.G.pastTricks && state.G.pastTricks.length > previousTrickCount.current) {
      setShowLastTrick(true);
      const timer = setTimeout(() => setShowLastTrick(false), 1500);
      previousTrickCount.current = state.G.pastTricks.length;
      return () => clearTimeout(timer);
    }
  }, [state?.G.pastTricks]);

  if (loading || !state) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: 'white' }}>Lade Spiel...</div>;
  }

  const { G, ctx } = state;
  const opponentId = playerId === '0' ? '1' : '0';
  const myHand: Card[] = G.hands ? G.hands[playerId || '0'] || [] : [];
  const opponentHandCount = G.hands ? G.hands[opponentId]?.length || 0 : 0;
  const isMyTurn = ctx.currentPlayer === playerId;

  // Sorting
  const sortedHand = sortHand(myHand, G.trump);

  // Waiting Room Phase
  if (ctx.phase === 'waitingRoom') {
    const isReady = G.readyPlayers.includes(playerId || '0');
    return (
      <div style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center', flexDirection: 'column', gap: '1rem' }}>
        <h2>Warten auf Spieler...</h2>
        <p>{G.readyPlayers.length} / 2 Spieler bereit</p>
        {!isReady && (
          <button className="btn btn-accent" onClick={() => dispatchMove(createMoveAction('setReady', [playerId!], playerId!))}>
            Los gehts!
          </button>
        )}
        {isReady && <p style={{ color: '#10b981' }}>Warten auf Gegner...</p>}
      </div>
    );
  }

  const handlePlayCard = (card: Card, isLegal: boolean) => {
    if (!isMyTurn || !isLegal || showLastTrick) return; // Prevent play while trick is showing

    const isFirstTrick = G.pastTricks.length === 0;
    
    if (ctx.phase === 'playing' && isFirstTrick) {
      setPendingCardToPlay(card);
    } else if (ctx.phase === 'playing') {
      dispatchMove(createMoveAction('playCard', [card], playerId!));
    }
  };

  const confirmPlayAndMeld = () => {
    if (pendingCardToPlay) {
      const meldArg = selectedMeldType === 'None' ? undefined : selectedMeldType;
      dispatchMove(createMoveAction('playCard', [pendingCardToPlay, meldArg], playerId!));
      setPendingCardToPlay(null);
      setSelectedMeldType('None');
    }
  };

  const currentTrickToDisplay = showLastTrick 
    ? G.pastTricks[G.pastTricks.length - 1].cards 
    : G.currentTrick.cards;

  const getTrickCount = (pId: string) => G.pastTricks.filter((t: any) => t.winner === pId).length;

  return (
    <main style={{ padding: '1rem', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <header className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem 2rem', marginBottom: '1rem' }}>
        <div>
           <div style={{ fontSize: '0.875rem', color: '#cbd5e1' }}>Match ID: {matchId} | Du bist Spieler: {playerId}</div>
           <div style={{ fontWeight: 'bold' }}>
             Phase: {ctx.phase} {isMyTurn && <span style={{ color: 'var(--accent)' }}>(Du bist am Zug!)</span>}
           </div>
           <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
             {G.trump && <div style={{ color: suitColors[G.trump], fontWeight: 'bold' }}>Trumpf: {G.trump} {suitSymbols[G.trump]}</div>}
             {G.revealedCard && (
               <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: 0.7, fontSize: '0.8rem' }}>
                 Ursprung: <CardView card={G.revealedCard} style={{ width: '30px', height: '45px', padding: '0.2rem', fontSize: '0.6rem' }} />
               </div>
             )}
           </div>
           
           {/* Show Melds */}
           {G.shownMelds.length > 0 && (
             <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#fbbf24' }}>
               Meldungen: {G.shownMelds.map((m: any, i: number) => <span key={i}>P{m.player}: {m.type} </span>)}
             </div>
           )}
        </div>
        <div style={{ textAlign: 'right' }}>
           <div style={{ fontSize: '0.875rem', color: '#cbd5e1' }}>Score (Match: {G.scores['0']}-{G.scores['1']})</div>
           <div style={{ fontWeight: 'bold', fontSize: '1.25rem', color: '#10b981' }}>Hand: P0: {G.handScores['0']} - P1: {G.handScores['1']}</div>
           
           <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '1rem' }}>
             <div style={{ padding: '0.25rem 0.5rem', border: '1px solid white', borderRadius: '4px' }}>
                Würfel: {G.cube.value} {G.cube.holder && `(P${G.cube.holder})`}
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

      <style dangerouslySetInnerHTML={{__html: `
        .card-hover:hover { transform: translateY(-10px) !important; z-index: 20 !important; }
      `}} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        
        {/* Opponent Area */}
        <div style={{ height: '120px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', position: 'relative' }}>
          {getTrickCount(opponentId) > 0 && (
             <div style={{ position: 'absolute', left: '20px', width: '60px', height: '90px', background: 'url(/card-back.png) center/cover, #222', borderRadius: '8px', border: '2px solid #555', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', flexDirection: 'column' }}>
               <span style={{ fontSize: '0.7rem' }}>Stiche</span>
               <span>{getTrickCount(opponentId)}</span>
             </div>
          )}
          {Array.from({ length: opponentHandCount }).map((_, i) => (
             <div key={i} style={{ width: '60px', height: '90px', background: 'url(/card-back.png) center/cover, var(--primary)', borderRadius: '8px', border: '2px solid white' }} />
          ))}
        </div>

        {/* Play Area */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '2rem' }}>
           
           {/* END OF HAND PHASE UI */}
           {ctx.phase === 'endOfHand' && (
             <div className="glass-panel" style={{ textAlign: 'center', minWidth: '300px' }}>
                <h2 style={{ marginBottom: '1rem', color: '#fbbf24' }}>Hand Auswertung</h2>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', fontSize: '1.2rem' }}>
                  <div>Spieler 0<br/><strong>{G.handScores['0']}</strong></div>
                  <div>Spieler 1<br/><strong>{G.handScores['1']}</strong></div>
                </div>
                
                <p style={{ marginBottom: '1rem' }}>{G.readyPlayers.length} / 2 bereit für nächste Hand</p>
                
                {!G.readyPlayers.includes(playerId || '0') ? (
                  <button className="btn btn-accent" onClick={() => dispatchMove(createMoveAction('nextHand', [playerId!], playerId!))}>
                    Nächste Hand starten
                  </button>
                ) : (
                  <p style={{ color: '#10b981' }}>Warten auf Gegner...</p>
                )}
             </div>
           )}

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
                     {['Spades', 'Hearts', 'Diamonds', 'Clubs'].filter(s => s !== G.revealedCard?.suit).map(suit => (
                       <button key={suit} className="btn" onClick={() => dispatchMove(createMoveAction('chooseTrump', [suit], playerId!))}>
                         {suitSymbols[suit as Suit]} wählen
                       </button>
                    ))}
                  </div>
                )}
             </div>
           )}

           {/* PLAYING PHASE UI */}
           {ctx.phase === 'playing' && (
             <div style={{ display: 'flex', gap: '1rem', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  {Object.entries(currentTrickToDisplay).map(([pId, card]: [string, any]) => (
                     <CardView key={pId} card={card} style={{ transform: pId === playerId ? 'translateY(20px)' : 'translateY(-20px)' }} />
                  ))}
                </div>
             </div>
           )}
        </div>

        {/* Player Area */}
        <div style={{ height: '160px', display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: '0.5rem', paddingBottom: '1rem', position: 'relative' }}>
           
           {getTrickCount(playerId || '0') > 0 && (
             <div style={{ position: 'absolute', right: '20px', bottom: '20px', width: '60px', height: '90px', background: 'url(/card-back.png) center/cover, #222', borderRadius: '8px', border: '2px solid #555', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', flexDirection: 'column' }}>
               <span style={{ fontSize: '0.7rem' }}>Stiche</span>
               <span>{getTrickCount(playerId || '0')}</span>
             </div>
           )}

           {/* Melding Dialog */}
           {pendingCardToPlay && (
             <div className="glass-panel" style={{ position: 'absolute', bottom: '160px', left: '50%', transform: 'translateX(-50%)', zIndex: 10, display: 'flex', gap: '1rem', alignItems: 'center' }}>
                {G.pendingMeld && G.pendingMeld.player !== playerId && (
                   <span style={{ color: '#fbbf24', marginRight: '1rem' }}>Gegner hat {G.pendingMeld.type} gemeldet. Hast du auch was?</span>
                )}
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

           {sortedHand.map((card, i) => {
              const offset = Math.abs((sortedHand.length / 2) - 0.5 - i) * 5;
              const rotation = (i - (sortedHand.length / 2) + 0.5) * 5;
              
              const leadPlayer = G.currentTrick?.leadPlayer;
              const leadCard = leadPlayer ? G.currentTrick?.cards[leadPlayer] : null;
              const leadSuit = leadCard ? leadCard.suit : null;
              const trickCards = Object.values(G.currentTrick?.cards || {});

              const isLegal = ctx.phase === 'playing' ? isMoveLegal(card, sortedHand, trickCards, leadSuit, G.trump!) : true;

              return (
                 <div key={`${card.suit}-${card.rank}`} style={{ transform: `translateY(${offset}px) rotate(${rotation}deg)`, zIndex: i }}>
                   <CardView 
                      card={card} 
                      disabled={!isLegal || (ctx.phase === 'playing' && !isMyTurn)}
                      onClick={() => handlePlayCard(card, isLegal)}
                   />
                 </div>
              );
           })}
        </div>
      </div>
    </main>
  );
}
