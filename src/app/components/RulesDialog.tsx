'use client';

import { useLayoutEffect, useRef } from 'react';
import type { MatchSettings } from '@/game/types';
import styles from './rules.module.css';

export default function RulesDialog({ settings, onClose }: { settings: MatchSettings; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  const rows = [
    ['Zielpunktzahl', `${settings.targetScore} Augen`],
    ['Einsatz pro Spiel', settings.stake],
    ['Vorsprung', settings.handicap === 0 ? 'Keiner' : `${Math.abs(settings.handicap)} Augen für ${settings.handicap > 0 ? 'Spieler 2 (Gast)' : 'Spieler 1 (Gastgeber)'}`],
    ['Schneider', settings.schneiderRule === 'yes' ? 'Immer aktiv' : settings.schneiderRule === 'no' ? 'Deaktiviert' : 'Nur nach Drehen'],
    ['Würfel', settings.cubeEnabled ? 'Aktiv' : 'Deaktiviert'],
    ['Zeit pro Zug', `${settings.moveTimeSeconds} Sekunden`],
    ['Zeit pro Dreher', `${settings.cubeTimeSeconds} Sekunden${settings.cubeEnabled ? '' : ' (Würfel deaktiviert)'}`],
  ];
  return <dialog id="table-rules" ref={ref} className={styles.dialog} onCancel={(event) => { event.preventDefault(); onClose(); }} aria-labelledby="rules-title">
    <h2 id="rules-title">Regeln dieses Matches</h2>
    <p>Die bei der Erstellung gewählten Einstellungen.</p>
    <dl>{rows.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl>
    <button className="button button-primary" type="button" onClick={onClose}>Schließen</button>
  </dialog>;
}
