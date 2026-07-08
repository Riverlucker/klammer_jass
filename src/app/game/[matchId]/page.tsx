'use client';

import { useParams } from 'next/navigation';

export default function GamePage() {
  const params = useParams();
  const matchId = params.matchId as string;

  return (
    <main style={{ padding: '2rem', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem 2rem', marginBottom: '2rem' }}>
        <div>
           <div style={{ fontSize: '0.875rem', color: '#cbd5e1' }}>Match ID</div>
           <div style={{ fontWeight: 'bold' }}>{matchId}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
           <div style={{ fontSize: '0.875rem', color: '#cbd5e1' }}>Spielstand</div>
           <div style={{ fontWeight: 'bold', fontSize: '1.25rem', color: '#10b981' }}>Gast 0 - 0 Heim</div>
        </div>
      </header>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {/* Opponent Area */}
        <div style={{ height: '120px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
             <div key={i} style={{ width: '80px', height: '120px', background: 'url(/card-back.png) center/cover, var(--primary)', borderRadius: '8px', border: '2px solid white' }} />
          ))}
        </div>

        {/* Play Area */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '2rem' }}>
           <div className="glass-panel" style={{ width: '120px', height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', cursor: 'pointer' }}>
              <div style={{ fontSize: '2rem' }}>🎲</div>
              <div style={{ fontWeight: 'bold' }}>1</div>
           </div>
           <div style={{ width: '100px', height: '150px', background: 'white', borderRadius: '8px', color: 'black', display: 'flex', flexDirection: 'column', padding: '0.5rem', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}>
             <div style={{ fontWeight: 'bold', fontSize: '1.5rem', color: 'red' }}>A♥</div>
             <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem', color: 'red' }}>♥</div>
           </div>
        </div>

        {/* Player Area */}
        <div style={{ height: '150px', display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: '0.5rem', paddingBottom: '1rem' }}>
           {['7♠', '10♦', 'K♣', 'A♠', 'J♥', '9♥'].map((card, i) => (
              <div key={i} style={{ 
                width: '100px', height: '150px', background: 'white', borderRadius: '8px', 
                color: 'black', display: 'flex', flexDirection: 'column', padding: '0.5rem',
                transform: `translateY(${Math.abs(2.5 - i) * 5}px) rotate(${(i - 2.5) * 5}deg)`,
                cursor: 'pointer', transition: 'transform 0.2s',
                boxShadow: '-5px 0 10px rgba(0,0,0,0.2)'
              }}
              onMouseOver={(e) => e.currentTarget.style.transform = `translateY(-20px) rotate(${(i - 2.5) * 5}deg)`}
              onMouseOut={(e) => e.currentTarget.style.transform = `translateY(${Math.abs(2.5 - i) * 5}px) rotate(${(i - 2.5) * 5}deg)`}
              >
                <div style={{ fontWeight: 'bold', fontSize: '1.25rem', color: card.includes('♥') || card.includes('♦') ? 'red' : 'black' }}>{card}</div>
              </div>
           ))}
        </div>
      </div>
    </main>
  );
}
