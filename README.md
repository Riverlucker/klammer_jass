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

Oben rechts zeigt jede Seite den beim Build festgeschriebenen Zeitstempel in Wiener Ortszeit (inklusive Sekunden und Zeitzone). Neuladen oder ein Serverneustart ändern ihn nicht. Im Entwicklungsserver steht stattdessen „Lokale Entwicklung“.

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
- „Drehen“ ist nur während des eigenen Zuges möglich, auch während der Trumpfwahl, vor dem Bedienen und nach einer Meldungsantwort. Nach der Annahme setzt der Anbieter seinen Zug fort. Die bisherige Sonderberechtigung nach einer Zugübergabe entfällt; die Würfelbesitz-Regel gilt weiterhin.
- Nach einer Spielpause startet „Match fortsetzen“ direkt das nächste Spiel, sobald beide Spieler bestätigt haben. Eine zweite Bestätigung über die alte Abrechnung ist nicht nötig.
- Schneider liegt vor, wenn der Verlierer weniger als die aufgerundete Hälfte der Zielpunktzahl hat. „Ja“ verdoppelt die gewonnenen Matchpunkte immer, „Nur wenn gedreht“ nur bei einem Würfelwert größer als eins, „Nein“ nie.
- Ein positiver Vorsprung wird dem Gast, ein negativer dem Host zu Beginn jedes Spiels gutgeschrieben.
- Bella wird beim Ausspielen der ersten passenden Trumpf-König-/Dame-Karte standardmäßig ausgewählt, kann aber bewusst abgewählt werden.
- Nach vier abgelehnten Trumpfentscheidungen wechselt der Dealer. Nach einer gespielten Hand erhält der Spieler mit den höheren Rohaugen den Button; bei Gleichstand bleibt er liegen.
- Zug- und Würfelfristen werden auf dem Server geprüft. Trumpf-Timeouts wählen „Nein“ beziehungsweise „OK“, Karten-Timeouts eine zufällige gültige Karte und Würfel-Timeouts „Ablehnen“.
- Online beginnt die volle Entscheidungsfrist nach der Anzeigebestätigung des zuständigen Browsers (nach Karten-/Stichanimationen). Bestätigungen sind pro Entscheidung einmalig. Ohne Bestätigung greift nach 15 Sekunden zusätzlicher Wartezeit die ursprüngliche Frist. Beide geöffneten Spielseiten prüfen abgelaufene Fristen erneut und können den Standardzug auslösen; ohne geöffneten Client erfolgt die Prüfung beim nächsten Zugriff über `tick` oder `move`. Die Anzeige verwendet die Serverzeit unabhängig von der Geräteuhr.
- Wenn beide Spieler durchpassen, zeigt jeder Browser 3,5 Sekunden lang das Neugeben: Die sechs Karten werden verdeckt ausgeteilt und die neue offene Karte anschließend aufgedeckt. Die Trumpfwahl und ihre volle Zugfrist beginnen erst danach.

## Datenfluss und Sicherheit

1. `POST /api/matches` erstellt Match, Spielzustand und den ersten Sitz.
2. Spielername und optionales Passwort werden dabei angelegt oder geprüft; ein bestehender Gastname kann durch Setzen eines Passworts geschützt werden.
3. `POST /api/matches/:id/join` vergibt den zweiten Sitz genau einmal oder öffnet nach erfolgreicher Anmeldung den eigenen vorhandenen Sitz erneut.
4. `GET /api/matches/:id` liefert nur die für den angemeldeten Spieler bestimmte Sicht.
5. `POST /api/move` akzeptiert ausschließlich bekannte Moves mit validierten Argumenten und der erwarteten State-ID.
6. `POST /api/matches/:id/tick` bestätigt mit optionaler `decisionID` sichtbare Optionen, führt abgelaufene serverseitige Defaultzüge aus und pausiert unbeantwortete Spielenden.
7. Die Datenbankaktualisierung vergleicht zusätzlich `updatedAt`, sodass parallele Züge nicht unbemerkt überschrieben werden.

Interne Reducer-Logs, Undo-Zustände, Talon und gegnerische Handkarten werden niemals an den Browser übertragen.

## Online-Latenz

- `vercel.json` legt Frankfurt (`fra1`) als Funktionsregion fest, passend zur konfigurierten Neon-Datenbank in `eu-central-1`. Bei einem Datenbankumzug muss die Region angepasst werden.
- Pusher-Benachrichtigungen starten direkt nach dem Speichern. Next.js `after()` hält sie nach der HTTP-Antwort am Leben, ohne die Zugantwort zu blockieren. Auf dem öffentlichen Kanal werden weiterhin ausschließlich Versionsnummern übertragen.
- Ohne bestätigte Echtzeit-Verbindung oder ohne serverseitige Pusher-Konfiguration wird jede Sekunde nachgefragt, sonst alle fünf Sekunden zur Absicherung. Erfolgreiches Wiederverbinden lädt sofort den aktuellen Spielstand. Unveränderte Zeitprüfungen öffnen keine Datenbanktransaktion.
- Klicks warten nicht auf laufende Hintergrundabfragen. Ein Versionskonflikt durch die gleichzeitige Timer-Bestätigung darf genau einmal erneut versucht werden; nach einem tatsächlichen Zug wird die Aktion nicht wiederholt.
- `Server-Timing` zeigt bei erfolgreichen Spielstands-, Zug- und Tick-Antworten die Bearbeitungsdauer; `X-Jass-Region` zeigt die tatsächliche Serverregion. Im Browser-Netzwerkpanel lassen sich damit Serverzeit und Netzwerkwartezeit unterscheiden.
- Jeder Browser zeigt einen abgeschlossenen Stich vier Sekunden ab Empfang an; verspätete Updates verkürzen diese Anzeige nicht. Beim Gewinner erhalten beide Karten nach einer Sekunde eine farbige animierte Umrandung. Diese endet eine Sekunde vor dem Einsammeln. Die nächste Entscheidungsfrist wird erst nach dieser lokalen Anzeige bestätigt. Der letzte Stich kann von beiden Spielern auf dem Stapel seines Gewinners erneut aufgedeckt werden, beim eigenen Stapel nach oben.
- Haben beide Spieler jeweils drei eigene Entscheidungen in Folge auslaufen lassen, wird vor dem nächsten automatischen Zug unterbrochen. Ein manueller Spielzug setzt den eigenen Zähler zurück. Beide Spieler müssen zum Fortsetzen zustimmen; jeder kann das Match stattdessen beenden.
- Nach jeder Hand kann auch ein einzelner Spieler „Unterbrechung beantragen“. Die Uhr stoppt sofort, bisherige Bereitschaft wird zurückgesetzt. Nach der Bestätigung beider Spieler beginnt die nächste Hand (nach Spielende das nächste Spiel); alternativ kann jeder das Match beenden.
- Ein beendetes Match zeigt beiden Spielern dauerhaft die Abschlussseite mit Punkten, Spielern, abgeschlossenen Händen und Start-/Endzeit. Erst „Zurück zur Lobby“ verlässt diese Seite. Bei älteren Matches ohne erfasste Handanzahl wird „Nicht erfasst“ angezeigt.
- Beim Erstellen und Beitreten (auch per Einladung) stehen 16 optionale Avatare zur Wahl. Der Reiter „Regeln“ zeigt die gewählten Match-Einstellungen; ohne Würfel ist auch kein Würfelsymbol am Tisch sichtbar.
- Beim ersten Öffnen der Meldungsauswahl erhält der Spieler einmal pro Zug mindestens die volle eingestellte Zugzeit ab serverseitiger Annahme der Kartenauswahl. Das Fenster zeigt die Restzeit und die automatische Aktion. Abwählen, Abbrechen und erneutes Öffnen verlängern diese Frist nicht; bei Ablauf wird die zuletzt gespeicherte Auswahl verwendet.
- Eine ungenutzte Räuber-Option wird dem Gegner weder in der Statusanzeige noch über automatische Chatmeldungen oder Sprechblasen verraten. Erst ein tatsächlich ausgeführter Tausch wird öffentlich kommentiert.
- Wer vor seiner ersten Karte räubern darf, erhält nach dem Nachgeben beim eigenen Zug einen ausdrücklichen Dialog. Erst nach „Räubern“ oder „Nicht räubern“ sind die übrigen Karten- und Meldungsaktionen bedienbar. Die normale Zugfrist läuft weiter; beim Timeout wird ohne Räubern die Standardaktion ausgeführt. Die passende 7 richtet sich auch beim Kleinen nach der offenen Karte, nicht nach der gewählten Trumpffarbe.
- Räubern ist eine optionale Aktion beim eigenen ersten Zug, keine gemeinsame Wartephase vor dem Ausspiel. Der zweite Spieler darf nach der ersten gegnerischen Karte räubern. Ein Kartenzug oder eine verbindliche Meldungsantwort beendet die eigene Tauschmöglichkeit; beim Timeout läuft die normale Standardaktion. Explizites Liegenlassen startet keinen neuen Timer. Bereits gespeicherte Matches in der alten Räuber-Phase werden beim nächsten authentifizierten Zugriff einmalig ins reguläre Spiel überführt.
