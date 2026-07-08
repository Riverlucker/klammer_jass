import Link from 'next/link';

export default function Home() {
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
            <form>
              <div className="input-group">
                <label>Zielpunktzahl</label>
                <select defaultValue="301">
                  <option value="301">301</option>
                  <option value="401">401</option>
                  <option value="501">501</option>
                  <option value="1001">1001</option>
                </select>
              </div>
              <div className="input-group">
                <label>Schneider-Regel</label>
                <select defaultValue="yes">
                  <option value="yes">Ja</option>
                  <option value="no">Nein</option>
                  <option value="only_if_doubled">Nur wenn gedreht</option>
                </select>
              </div>
              <div className="input-group">
                <label>Würfel</label>
                <select defaultValue="enabled">
                  <option value="enabled">Mit Würfel</option>
                  <option value="disabled">Ohne Würfel</option>
                </select>
              </div>
              <button type="button" className="btn btn-accent" style={{ width: '100%', marginTop: '1rem' }}>
                Match starten
              </button>
            </form>
          </div>

          <div className="glass-panel" style={{ background: 'rgba(255,255,255,0.02)', padding: '1.5rem' }}>
             <h2 style={{ marginBottom: '1.5rem', fontSize: '1.5rem' }}>Match beitreten</h2>
             <form>
               <div className="input-group">
                 <label>Match ID</label>
                 <input type="text" placeholder="z.B. 1234-5678-9012" />
               </div>
               <button type="button" className="btn" style={{ width: '100%', marginTop: '1rem' }}>
                 Beitreten
               </button>
             </form>
          </div>

        </div>
      </div>
    </main>
  );
}
