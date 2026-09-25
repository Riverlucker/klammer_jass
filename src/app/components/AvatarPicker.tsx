'use client';

import { useId } from 'react';
import Avatar, { AVATAR_OPTIONS } from './Avatar';
import styles from './avatar.module.css';

export default function AvatarPicker({ name, value, onChange, disabled = false }: { name: string; value: number | null; onChange: (value: number | null) => void; disabled?: boolean }) {
  const group = useId();
  return <fieldset className={styles.picker} disabled={disabled}>
    <legend>Avatar <small>optional</small></legend>
    <div className={styles.grid}>
      {AVATAR_OPTIONS.map((description, index) => <label key={index} title={description}>
        <input type="radio" name={group} value={index} checked={value === index} onChange={() => onChange(index)} aria-label={`Avatar ${index + 1}: ${description}`} />
        <Avatar name={name} selection={index} />
      </label>)}
    </div>
    <button type="button" onClick={() => onChange(null)} aria-pressed={value === null}>Standardavatar {value === null ? '✓' : 'verwenden'}</button>
  </fieldset>;
}
