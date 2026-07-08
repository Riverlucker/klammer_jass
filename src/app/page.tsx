'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [targetScore, setTargetScore] = useState('301');
  const [schneiderRule, setSchneiderRule] = useState('yes');
  const [cubeEnabled, setCubeEnabled] = useState('enabled');
  
  const [joinMatchId, setJoinMatchId] = useState('');

  const handleCreateMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const res = await fetch('/api/matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetScore, schneiderRule, cubeEnabled })
      });
      const data = await res.json();
      
      if (data.success && data.matchId) {
         // Create local player mapping in localStorage for simple auth (Player 0)
         localStorage.setItem(`jass_player_${data.matchId}`, '0');
         router.push(`/game/${data.matchId}`);
      }
    } catch (err) {
      console.error(err);
      setIsLoading(false);
    }
  };

  const handleJoinMatch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinMatchId) return;
    
    // Simple auth (Player 1)
    localStorage.setItem(`jass_player_${joinMatchId}`, '1');
    router.push(`/game/${joinMatchId}`);
  };

  return (
    <main style={{ padding: '4rem 2rem', maxWidth: '800px', margin: '0 auto' }}>
      <div className="glass-panel" style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: '3rem', marginBottom: '1rem', background: 'linear-gradient(to right, #3b82f6, #10b981)', WebkitBackgroundClip: 'text', color: 'transparent' }}>
          Klammer Jass
        </h1>
        <p style={{ color: '#cbd5e1', marginBottom: '2rem', fontSize: '1.1rem' }}>
          Das traditionelle 32-Blatt Kartenspiel, digitalisiert für 2 Spieler.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', textAlign: 'left' }}>
          
          <div className="glass-panel" style={{ background: 'rgba(255,255,255,0.02)', padding: '1.5rem' }}>
            <h2 style={{ marginBottom: '1.5rem', fontSize: '1.5rem' }}>Neues Match erstellen</h2>
            <form onSubmit={handleCreateMatch}>
              <div className="input-group">
                <label>Zielpunktzahl</label>
                <select value={targetScore} onChange={e => setTargetScore(e.target.value)}>
                  <option value="301">301</option>
                  <option value="401">401</option>
                  <option value="501">501</option>
                  <option value="1001">1001</option>
                </select>
              </div>
              <div className="input-group">
                <label>Schneider-Regel</label>
                <select value={schneiderRule} onChange={e => setSchneiderRule(e.target.value)}>
                  <option value="yes">Ja</option>
                  <option value="no">Nein</option>
                  <option value="only_if_doubled">Nur wenn gedreht</option>
                </select>
              </div>
              <div className="input-group">
                <label>Würfel</label>
                <select value={cubeEnabled} onChange={e => setCubeEnabled(e.target.value)}>
                  <option value="enabled">Mit Würfel</option>
                  <option value="disabled">Ohne Würfel</option>
                </select>
              </div>
              <button type="submit" disabled={isLoading} className="btn btn-accent" style={{ width: '100%', marginTop: '1rem', opacity: isLoading ? 0.5 : 1 }}>
                {isLoading ? 'Lädt...' : 'Match starten'}
              </button>
            </form>
          </div>

          <div className="glass-panel" style={{ background: 'rgba(255,255,255,0.02)', padding: '1.5rem' }}>
             <h2 style={{ marginBottom: '1.5rem', fontSize: '1.5rem' }}>Match beitreten</h2>
             <form onSubmit={handleJoinMatch}>
               <div className="input-group">
                 <label>Match ID</label>
                 <input 
                   type="text" 
                   placeholder="z.B. 1234-5678" 
                   value={joinMatchId} 
                   onChange={e => setJoinMatchId(e.target.value)} 
                 />
               </div>
               <button type="submit" className="btn" style={{ width: '100%', marginTop: '1rem' }}>
                 Beitreten
               </button>
             </form>
          </div>

        </div>
      </div>
    </main>
  );
}
