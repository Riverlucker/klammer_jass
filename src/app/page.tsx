'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';

export default function Home() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createPlayerName, setCreatePlayerName] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [targetScore, setTargetScore] = useState('301');
  const [stake, setStake] = useState('1');
  const [handicap, setHandicap] = useState('0');
  const [schneiderRule, setSchneiderRule] = useState('yes');
  const [cubeEnabled, setCubeEnabled] = useState('enabled');
  const [moveTimeSeconds, setMoveTimeSeconds] = useState('10');
  const [cubeTimeSeconds, setCubeTimeSeconds] = useState('30');
  const [joinMatchId, setJoinMatchId] = useState('');
  const [joinPlayerName, setJoinPlayerName] = useState('');
  const [joinPassword, setJoinPassword] = useState('');

  async function handleCreateMatch(event: FormEvent) {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerName: createPlayerName,
          password: createPassword,
          targetScore,
          stake,
          handicap,
          schneiderRule,
          cubeEnabled,
          moveTimeSeconds,
          cubeTimeSeconds,
        }),
      });
      const data = await readResponse(response);
      if (!response.ok || typeof data.matchId !== 'string') {
        throw new Error(data.error ?? 'Match konnte nicht erstellt werden.');
      }
      router.push(`/game/${data.matchId}`);
    } catch (cause: unknown) {
      setError(messageFrom(cause));
      setIsLoading(false);
    }
  }

  async function handleJoinMatch(event: FormEvent) {
    event.preventDefault();
    const matchId = joinMatchId.trim();
    if (!matchId) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/matches/${encodeURIComponent(matchId)}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerName: joinPlayerName, password: joinPassword }),
      });
      const data = await readResponse(response);
      if (!response.ok) throw new Error(data.error ?? 'Beitritt fehlgeschlagen.');
      router.push(`/game/${matchId}`);
    } catch (cause: unknown) {
      setError(messageFrom(cause));
      setIsLoading(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.intro}>
        <p className="eyebrow">Klammer Jass · Zwei Spieler</p>
        <h1>Ein Tisch. Zwei Hände. Kein Blick in die Karten.</h1>
        <p className={styles.lead}>
          Erstelle ein privates Match oder nimm mit einer Match-ID am Tisch Platz.
          Spielstände werden live und serverseitig geprüft.
        </p>
        <div className={styles.ruleStrip} aria-label="Spielmerkmale">
          <span>32 Karten</span><span>9 Karten je Hand</span><span>Live synchronisiert</span>
        </div>
      </section>

      {error && <div className="notice notice-error" role="alert">{error}</div>}

      <section className={styles.actions} aria-label="Match starten oder beitreten">
        <form className="panel" onSubmit={handleCreateMatch}>
          <div className="panel-heading">
            <span className="step">01</span>
            <div><h2>Neues Match</h2><p>Lege die Hausregeln für diesen Tisch fest.</p></div>
          </div>
          <PlayerFields
            name={createPlayerName}
            password={createPassword}
            onNameChange={setCreatePlayerName}
            onPasswordChange={setCreatePassword}
          />
          <label className="field">
            <span>Zielpunktzahl</span>
            <select value={targetScore} onChange={(event) => setTargetScore(event.target.value)}>
              <option value="301">301 Punkte</option>
              <option value="401">401 Punkte</option>
              <option value="501">501 Punkte</option>
              <option value="601">601 Punkte</option>
              <option value="701">701 Punkte</option>
              <option value="801">801 Punkte</option>
              <option value="901">901 Punkte</option>
              <option value="1001">1001 Punkte</option>
            </select>
          </label>
          <label className="field">
            <span>Einsatz pro Spiel</span>
            <input type="number" min="1" max="1000" step="1" value={stake} onChange={(event) => setStake(event.target.value)} />
          </label>
          <label className="field">
            <span>Vorsprung pro Spiel</span>
            <input type="number" min="-1000" max="1000" step="1" value={handicap} onChange={(event) => setHandicap(event.target.value)} />
            <small>Positiv für den Gast, negativ für den Host.</small>
          </label>
          <label className="field">
            <span>Schneider</span>
            <select value={schneiderRule} onChange={(event) => setSchneiderRule(event.target.value)}>
              <option value="yes">Immer aktiv</option>
              <option value="no">Deaktiviert</option>
              <option value="only_if_doubled">Nur nach Drehen</option>
            </select>
          </label>
          <label className="field">
            <span>Würfel</span>
            <select value={cubeEnabled} onChange={(event) => setCubeEnabled(event.target.value)}>
              <option value="enabled">Aktiv</option>
              <option value="disabled">Deaktiviert</option>
            </select>
          </label>
          <label className="field">
            <span>Zeit pro Zug</span>
            <select value={moveTimeSeconds} onChange={(event) => setMoveTimeSeconds(event.target.value)}>
              {Array.from({ length: 11 }, (_, index) => 10 + index * 5).map((seconds) => (
                <option key={seconds} value={seconds}>{seconds} Sekunden</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Zeit pro Dreher</span>
            <select value={cubeTimeSeconds} onChange={(event) => setCubeTimeSeconds(event.target.value)}>
              {Array.from({ length: 7 }, (_, index) => 30 + index * 15).map((seconds) => (
                <option key={seconds} value={seconds}>{seconds} Sekunden</option>
              ))}
            </select>
          </label>
          <button className="button button-primary" type="submit" disabled={isLoading || !createPlayerName.trim()}>
            {isLoading ? 'Tisch wird vorbereitet …' : 'Match erstellen'}
          </button>
        </form>

        <form className="panel" onSubmit={handleJoinMatch}>
          <div className="panel-heading">
            <span className="step">02</span>
            <div><h2>Match beitreten</h2><p>Die Match-ID erhältst du von der Person, die den Tisch erstellt hat.</p></div>
          </div>
          <PlayerFields
            name={joinPlayerName}
            password={joinPassword}
            onNameChange={setJoinPlayerName}
            onPasswordChange={setJoinPassword}
          />
          <label className="field">
            <span>Match-ID</span>
            <input
              value={joinMatchId}
              onChange={(event) => setJoinMatchId(event.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <p className={styles.joinHint}>
            Ein Match hat genau zwei geschützte Plätze. Mit deinen Zugangsdaten kannst du deinen bestehenden Platz wieder öffnen.
          </p>
          <button className="button" type="submit" disabled={isLoading || !joinMatchId.trim() || !joinPlayerName.trim()}>
            Platz einnehmen
          </button>
        </form>
      </section>
    </main>
  );
}

function PlayerFields({ name, password, onNameChange, onPasswordChange }: {
  name: string;
  password: string;
  onNameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
}) {
  return (
    <div className={styles.playerFields}>
      <label className="field">
        <span>Spielername</span>
        <input
          type="text"
          required
          minLength={1}
          maxLength={32}
          value={name}
          autoComplete="username"
          placeholder="Dein Name am Tisch"
          onChange={(event) => onNameChange(event.target.value)}
        />
      </label>
      <label className="field">
        <span>Passwort <small>optional</small></span>
        <input
          type="password"
          minLength={password ? 4 : undefined}
          maxLength={128}
          value={password}
          autoComplete="current-password"
          placeholder="Leer lassen für Gastzugang"
          onChange={(event) => onPasswordChange(event.target.value)}
        />
        <small>Mit Passwort wird der Name geschützt; ohne Passwort spielst du als Gast.</small>
      </label>
    </div>
  );
}

async function readResponse(response: Response): Promise<{ error?: string; matchId?: string }> {
  try {
    return await response.json() as { error?: string; matchId?: string };
  } catch {
    return {};
  }
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'Ein unbekannter Fehler ist aufgetreten.';
}
