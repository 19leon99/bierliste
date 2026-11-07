# Bierliste

Eine kleine Web-App für die Handballmannschaft zur Verwaltung von Kastendienst (Bierlog), Diensten und dem Strafenlog – inklusive einer Übersicht mit offenen Summen pro Spieler.

Dies ist die eigenständige Version der App als statische Webseite. Sie basiert auf dem Cowork-Artefakt der Mannschaft, läuft aber ohne Cowork als ganz normale Datei-Sammlung, z. B. gehostet über GitHub Pages.

## Wichtig: Datenspeicherung ist jetzt pro Browser/Gerät

**Das ist der wichtigste Unterschied zur Cowork-Version:** Die ursprüngliche Cowork-Artefakt-Version hat alle Daten (Spieler, Termine, Strafen, Zahlungen) in einer gemeinsamen, geteilten Datenbank gespeichert – jede:r aus dem Team, der die Seite öffnet, hat denselben Stand gesehen und Änderungen waren für alle sofort sichtbar.

**Diese Version speichert stattdessen im `localStorage` des jeweiligen Browsers.** Das bedeutet:

- Jede Person, die die Seite auf ihrem Handy oder Computer öffnet, bekommt ihren **eigenen, unabhängigen Datenstand**.
- Es gibt **keine automatische Synchronisierung** zwischen mehreren Geräten oder Personen mehr.
- Löscht jemand den Browser-Cache/die Website-Daten, sind die Einträge auf diesem Gerät weg.
- Wenn das Team weiterhin einen gemeinsamen, für alle sichtbaren Stand braucht, ist diese Variante dafür **nicht ohne Weiteres geeignet** – dafür eignet sich die ursprüngliche Cowork-Version besser, oder man müsste ein echtes Backend ergänzen (siehe unten).

Für einen einzelnen "Verwalter" (z. B. eine Person, die den Kastendienst pflegt und gelegentlich Zahlen exportiert/teilt), oder zum Ausprobieren/Weiterbasteln am Code, funktioniert diese lokale Variante gut.

### Mögliche Erweiterungen für geteilte Daten

Falls später doch wieder ein gemeinsamer Stand gewünscht ist, gibt es grob zwei Wege, ohne die Oberfläche (`js/app.js`) anfassen zu müssen:

1. **Export/Import von Hand:** Die Datei `js/db-local.js` speichert den kompletten Datenbestand als ein einziges JSON-Objekt im `localStorage` unter dem Schlüssel `bierliste_db_v1`. Dieses JSON lässt sich z. B. über die Browser-Konsole exportieren und auf einem anderen Gerät wieder einspielen.
2. **Echtes Backend:** `js/db-local.js` bildet exakt dieselbe kleine API nach, die `js/app.js` über `window.claude.use("db")` erwartet (`doc`/`collection`, `get`/`set`/`update`/`delete`/`add`, `onSnapshot`, `orderBy`/`limit`, `acquire`). Wer eine geteilte Lösung bauen möchte, kann `db-local.js` durch eine eigene Implementierung derselben Schnittstelle ersetzen, die z. B. gegen Firebase/Supabase/eine eigene API spricht – `app.js` selbst muss dafür nicht geändert werden.

## Struktur

```
index.html              Grundgerüst der Seite (Header, Tabs, die vier Bereiche)
css/style.css            Gesamtes Styling (Farben, Layout, Komponenten)
js/app.js                 Die eigentliche App-Logik (unverändert aus dem Artefakt übernommen)
js/db-local.js            Ersetzt die Cowork-"db"-Fähigkeit durch localStorage
js/downloads-local.js     Ersetzt die Cowork-"downloads"-Fähigkeit durch einen Browser-Download
```

`js/app.js` enthält die komplette fachliche Logik (Rotation, Strafenberechnung, Übersicht, PNG-Export etc.) unverändert so, wie sie im Cowork-Artefakt läuft. Die beiden `*-local.js`-Dateien sind reine Kompatibilitätsschichten, die dieselben Funktionen bereitstellen, die `app.js` sonst von der Cowork-Umgebung bekommt (`window.claude.use(...)`), nur eben lokal im Browser statt über Cowork.

## Lokal ausführen

Da die Seite mit relativen Pfaden auf `css/style.css` und die `js/*.js`-Dateien verweist, reicht es nicht, `index.html` direkt per Doppelklick zu öffnen (manche Browser blockieren dann einzelne Requests). Stattdessen die Seite über einen einfachen lokalen Webserver öffnen, zum Beispiel:

```bash
cd bierliste
python3 -m http.server 8000
# dann im Browser: http://localhost:8000/
```

oder mit Node (`npx serve .`), oder jedem anderen statischen Webserver.

## Mit GitHub Pages veröffentlichen

1. Repo auf GitHub pushen (liegt bereits vor, falls dieses README aus dem gepushten Repo gelesen wird).
2. Im Repo unter **Settings → Pages** als Quelle den `main`-Branch (Root-Verzeichnis) auswählen.
3. Nach kurzer Zeit ist die Seite unter `https://<benutzername>.github.io/<repo-name>/` erreichbar.

Da alles rein clientseitig läuft (kein Server, keine Datenbank, keine Build-Schritte), funktioniert GitHub Pages ohne weitere Konfiguration.

## Browser-Kompatibilität

- Der PNG-Export der Übersicht versucht zuerst das native Teilen-Menü des Geräts (`navigator.share`, v. a. auf dem Handy praktisch). Ist das nicht verfügbar (meist am Desktop), lädt die Datei stattdessen ganz normal über einen Browser-Download herunter (`js/downloads-local.js`).
- Die App nutzt Standard-Web-APIs (`localStorage`, `canvas`, `fetch`-freie Logik) und läuft in allen aktuellen Browsern.
