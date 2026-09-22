'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { MatchSettings } from '@/game/types';

export default function InviteForm({ matchId, host, settings, full }: {
  matchId: string; host: string; settings: MatchSettings; full: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function join(event: FormEvent) {
    event.preventDefault();
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      const response = await fetch(`/api/matches/${encodeURIComponent(matchId)}/join`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerName: name, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Beitritt fehlgeschlagen.');
      router.replace(`/game/${matchId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Beitritt fehlgeschlagen.');
      setSending(false);
    }
  }
  return <section className="panel">
    <p className="eyebrow">Einladung · Klammer Jass</p>
    <h1>Dem Spiel von {host} beitreten</h1>
    <p>Bis {settings.targetScore} Punkte · Einsatz {settings.stake}</p>
    <p>Schneider: {settings.schneiderRule === 'yes' ? 'Immer aktiv' : settings.schneiderRule === 'no' ? 'Deaktiviert' : 'Nur nach Drehen'} · Würfel: {settings.cubeEnabled ? 'Aktiv' : 'Deaktiviert'}</p>
    <p>Zugzeit: {settings.moveTimeSeconds} Sekunden{settings.cubeEnabled ? ` · Dreher: ${settings.cubeTimeSeconds} Sekunden` : ''}</p>
    <p>Vorsprung: {settings.handicap === 0 ? 'Keiner' : `${Math.abs(settings.handicap)} Punkte für ${settings.handicap > 0 ? 'den Gast' : 'den Gastgeber'}`}</p>
    {full && <p>Beide Plätze sind besetzt. Bereits beteiligte Spieler können sich erneut anmelden.</p>}
    {error && <p className="notice notice-error" role="alert">{error}</p>}
    <form onSubmit={join}>
      <label className="field"><span>Name</span><input required maxLength={32} autoComplete="username" value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label className="field"><span>Passwort (optional)</span><input type="password" maxLength={128} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
        <small>Bei geschützten Namen das bestehende Passwort verwenden. Ohne Passwort spielst du als Gast.</small>
      </label>
      <button className="button button-primary" type="submit" disabled={sending || !name.trim()}>{sending ? 'Beitritt läuft …' : `Dem Spiel von ${host} beitreten`}</button>
    </form>
  </section>;
}
