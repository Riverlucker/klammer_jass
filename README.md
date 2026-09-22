# Klammer Jass

Eine live synchronisierte Klammer-Jass-Variante für zwei Spieler. Die App basiert auf Next.js 16, React 19, Prisma/PostgreSQL, `boardgame.io` und Pusher.

## Funktionen

- wiederkehrende Spielernamen mit optionalem, gesalzen gehashtem Passwort
- Gastzugänge ohne Passwort, die keine registrierten Namen übernehmen können
- geschützte Plätze über zufällige, nur gehasht gespeicherte Sitzungstokens
- serverseitig geprüfte Züge ohne frei ausführbare Reducer-Actions
- private Spielersicht: Handkarten und Talon des Gegners verlassen den Server nicht
- optimistisches Locking gegen gleichzeitig eintreffende Züge
- Original- und Kleines-Trumpfwahl einschließlich „Besser“ mit Kreuz
- Farb-, Stich- und Überstichpflicht
- vollständige Meldungsverhandlung für Terz und Fünfzig sowie optionale Bella
- getrennte Hand-, Spiel- und Matchwertung mit Falte, Einsatz, Würfel und Schneider
- Vorsprung sowie serverseitige Zeitlimits und automatische Defaultzüge
- Spielende mit Weiterspielen, Matchende und beidseitig auflösbarer Pause
- Pusher-Synchronisierung mit regelmäßigem Abruf als Ausfallsicherung

## Lokale Einrichtung

1. Abhängigkeiten installieren:

   ```bash
   npm install
   ```

2. `.env.example` nach `.env` kopieren und PostgreSQL-/Pusher-Zugangsdaten eintragen.

3. Datenbankschema abgleichen und den Prisma-Client erzeugen:

   ```bash
   npx prisma db push
   npx prisma generate
   ```

4. Entwicklungsserver starten:

   ```bash
   npm run dev
   ```

Danach ist die App unter `http://localhost:3000` erreichbar. Zum Testen beider Plätze sind zwei Browserprofile oder Geräte nötig, weil die Sitzungen in sicheren HTTP-only-Cookies liegen.

Bereits vor Regelversion 2 erstellte Matches werden bewusst nicht übernommen. Erstelle nach dem Update ein neues Match.

## Qualitätsprüfungen

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

Die Tests decken Stichzwang, Trumpfreihenfolge, Meldungsverhandlung, Falte, Spiel-/Matchwertung, Würfel, Schneider, Zeitabläufe, Neugeben, Sitz-Tokens und die private Spielersicht ab.

`npm audit --omit=dev` meldet derzeit noch bekannte transitive Schwachstellen in optionalen Server-/UI-Abhängigkeiten von `boardgame.io`. Die betroffenen Pakete werden von dieser App nicht importiert; der von npm angebotene automatische Fix würde `boardgame.io` auf eine inkompatible ältere Version zurücksetzen. Ein Austausch oder Update dieser Laufzeitabhängigkeit bleibt deshalb als gezielte Wartungsaufgabe offen.

## Projektregeln

Verbindliche Projektreferenz ist `Klammer Jass.pdf` im Projektverzeichnis. Die App unterscheidet drei Ebenen: Eine Hand liefert Augen für ein Spiel, ein Spiel läuft bis zur Zielpunktzahl, und ein Match sammelt die mit Einsatz und Würfel bewerteten gewonnenen Spiele.

- Der Trumpf-Bube zählt 20 Jass-Punkte plus 2 normale Bubenpunkte, insgesamt 22 Augen.
- Bei Falte erhält der Trumpfmacher bei weniger oder gleich vielen Handaugen keine Augen; der Gegner erhält die gesamten Handaugen.
- Erreichen beide Spieler gleichzeitig das Ziel, gewinnt der höhere Spielstand. Ein identischer Spielstand ist ein Unentschieden ohne Matchpunkte.
- Der Würfel bewertet ausschließlich das abgeschlossene Spiel. Ein abgelehnter Dreher gibt dem anbietenden Spieler den bisherigen Würfelwert, anschließend kann das Match mit einem neuen Spiel fortgesetzt werden.
- Schneider liegt vor, wenn der Verlierer weniger als die aufgerundete Hälfte der Zielpunktzahl hat. „Ja“ verdoppelt die gewonnenen Matchpunkte immer, „Nur wenn gedreht“ nur bei einem Würfelwert größer als eins, „Nein“ nie.
- Ein positiver Vorsprung wird dem Gast, ein negativer dem Host zu Beginn jedes Spiels gutgeschrieben.
- Bella wird beim Ausspielen der ersten passenden Trumpf-König-/Dame-Karte standardmäßig ausgewählt, kann aber bewusst abgewählt werden.
- Nach vier abgelehnten Trumpfentscheidungen wechselt der Dealer. Nach einer gespielten Hand erhält der Spieler mit den höheren Rohaugen den Button; bei Gleichstand bleibt er liegen.
- Zug- und Würfelfristen werden auf dem Server geprüft. Trumpf-Timeouts wählen „Nein“ beziehungsweise „OK“, Karten-Timeouts eine zufällige gültige Karte und Würfel-Timeouts „Ablehnen“.

## Datenfluss und Sicherheit

1. `POST /api/matches` erstellt Match, Spielzustand und den ersten Sitz.
2. Spielername und optionales Passwort werden dabei angelegt oder geprüft; ein bestehender Gastname kann durch Setzen eines Passworts geschützt werden.
3. `POST /api/matches/:id/join` vergibt den zweiten Sitz genau einmal oder öffnet nach erfolgreicher Anmeldung den eigenen vorhandenen Sitz erneut.
4. `GET /api/matches/:id` liefert nur die für den angemeldeten Spieler bestimmte Sicht.
5. `POST /api/move` akzeptiert ausschließlich bekannte Moves mit validierten Argumenten und der erwarteten State-ID.
6. `POST /api/matches/:id/tick` führt abgelaufene serverseitige Defaultzüge aus und pausiert unbeantwortete Spielenden.
7. Die Datenbankaktualisierung vergleicht zusätzlich `updatedAt`, sodass parallele Züge nicht unbemerkt überschrieben werden.

Interne Reducer-Logs, Undo-Zustände, Talon und gegnerische Handkarten werden niemals an den Browser übertragen.
