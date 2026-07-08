'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useJassGame } from '../useJassGame';
import { Card } from '@/game/constants';

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

  useEffect(() => {
    // Determine which player we are based on localStorage
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

  const handlePlayCard = (card: Card) => {
    if (ctx.phase === 'playing' && ctx.currentPlayer === playerId) {
      dispatchMove(createMoveAction('playCard', [card], playerId));
    }
  };

  const handleAcceptOriginal = () => dispatchMove(createMoveAction('acceptOriginal', [], playerId!));
  const handleDecline = () => dispatchMove(createMoveAction('decline', [], playerId!));

  const isMyTurn = ctx.currentPlayer === playerId;

  return (
    <main style={{ padding: '2rem', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem 2rem', marginBottom: '1rem' }}>
        <div>
           <div style={{ fontSize: '0.875rem', color: '#cbd5e1' }}>Match ID: {matchId} | Spieler: {playerId}</div>
           <div style={{ fontWeight: 'bold' }}>Phase: {ctx.phase} {isMyTurn && <span style={{ color: 'var(--accent)' }}>(Du bist am Zug!)</span>}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
           <div style={{ fontSize: '0.875rem', color: '#cbd5e1' }}>Score</div>
           <div style={{ fontWeight: 'bold', fontSize: '1.25rem', color: '#10b981' }}>P0: {G.scores['0']} - P1: {G.scores['1']}</div>
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
           
           {ctx.phase === 'trumpSelection' && G.revealedCard && (
             <div style={{ textAlign: 'center' }}>
                <h3 style={{ marginBottom: '1rem' }}>Trumpf?</h3>
                <CardView card={G.revealedCard} style={{ margin: '0 auto 1rem auto' }} />
                
                {isMyTurn && (
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <button className="btn btn-accent" onClick={handleAcceptOriginal}>Annehmen</button>
                    <button className="btn" style={{ background: '#ef4444' }} onClick={handleDecline}>Ablehnen</button>
                  </div>
                )}
             </div>
           )}

           {ctx.phase === 'playing' && (
             <div style={{ display: 'flex', gap: '1rem' }}>
                {Object.entries(G.currentTrick.cards).map(([pId, card]: [string, any]) => (
                   <CardView key={pId} card={card} style={{ transform: pId === playerId ? 'translateY(20px)' : 'translateY(-20px)' }} />
                ))}
             </div>
           )}

        </div>

        {/* Player Area */}
        <div style={{ height: '150px', display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: '0.5rem', paddingBottom: '1rem' }}>
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
