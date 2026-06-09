# ⚽ WM 2026 Tippspiel – Live-Auswertung

Eine kleine Web-App, die automatisch die WM-Resultate holt und für 16 Mitspieler:innen
live ausrechnet, wer wie viele Punkte hat. Gratis gehostet auf **GitHub Pages**,
automatisch aktualisiert per **GitHub Actions**, installierbar als **App (PWA)**.

---

## So funktioniert die Wertung

| Phase | Topf 1 (grün) | Topf 2 (blau) | Topf 3 (orange) | Topf 4 (violett) |
|-------|:---:|:---:|:---:|:---:|
| **Gruppenphase · Sieg** | 1 | 2 | 3 | 4 |
| **Gruppenphase · Unentschieden** | 0.5 | 1 | 1.5 | 2 |
| **K.o.-Phase · Sieg** | 2 | 2 | 2 | 2 |
| **K.o.-Phase · Unentschieden** | 1 | 1 | 1 | 1 |

- **Topf 1** = stark (Frankreich … Kolumbien), **Topf 4** = schwach (Usbekistan … Neuseeland).
- Punkte werden **pro Spiel** des eigenen Teams vergeben und über das ganze Turnier summiert.
- Alle Werte stehen in [`data/config.json`](data/config.json) und sind jederzeit anpassbar.

---

## ⚠️ Zuerst: Zuordnung prüfen

Die Datei [`data/ownership.json`](data/ownership.json) (wer welche Teams gezogen hat)
wurde aus dem PDF **rekonstruiert**. Die Gesamtzahlen stimmen exakt, aber einzelne
Zellen sind eine Best-Effort-Lesung. **Bitte einmal gegen die Original-Excel prüfen.**

Zwei Möglichkeiten:

**A) Automatisch aus der Excel (empfohlen):**
1. Excel öffnen → *Speichern unter* → **CSV** → z. B. `tabelle.csv`
2. `node scripts/csv-to-ownership.mjs tabelle.csv`
   → erzeugt `data/ownership.json` exakt aus deiner Tabelle.

**B) Von Hand:** [`data/ownership.json`](data/ownership.json) im Editor anpassen.

> Der Reiter **„Info & Check"** in der App zeigt live, ob die Zuordnung sauber ist
> (Team-Anzahl = PDF, jede Person genau 2 Teams pro Topf).

---

## Einrichtung in 6 Schritten

### 1. GitHub-Konto + Repository
- Auf <https://github.com> kostenloses Konto erstellen.
- Oben rechts **„+" → New repository**, Name z. B. `wm-tippspiel`, **Public**, *Create*.

### 2. Diese Dateien hochladen
Am einfachsten per Drag & Drop: im neuen Repo auf **„uploading an existing file"**
klicken und den **gesamten Inhalt dieses Ordners** (`wm-tippspiel/`) hineinziehen, dann
*Commit changes*.

Oder per Git (PowerShell, in diesem Ordner):
```powershell
git init
git add .
git commit -m "WM Tippspiel"
git branch -M main
git remote add origin https://github.com/DEIN-NAME/wm-tippspiel.git
git push -u origin main
```

### 3. Gratis-API-Key holen (football-data.org)
- <https://www.football-data.org/client/register> → mit E-Mail registrieren.
- Du bekommst per Mail einen **API-Token** (eine lange Zeichenfolge).

### 4. Token als Secret hinterlegen (bleibt geheim!)
Im Repo: **Settings → Secrets and variables → Actions → New repository secret**
- **Name:** `FOOTBALL_DATA_TOKEN`
- **Secret:** dein Token
- *Add secret*

> Der Token wird **nur** in der GitHub-Action verwendet, niemals im ausgelieferten
> Frontend. Die Action holt die Spiele und legt sie als `data/matches.json` ab – die
> Website liest nur diese fertige Datei. Darum ist nichts öffentlich einsehbar.

### 5. GitHub Pages aktivieren
**Settings → Pages**
- *Source:* **Deploy from a branch**
- *Branch:* **main** / **/ (root)** → *Save*
- Nach ~1 Minute erscheint die URL: `https://DEIN-NAME.github.io/wm-tippspiel/`

### 6. Resultate zum ersten Mal holen
**Actions →** Workflow **„Update results"** → **Run workflow**.
Danach läuft er automatisch alle 30 Minuten und aktualisiert die Seite.

✅ **Fertig.** Die Seite zeigt nun die Live-Rangliste der 16 Personen.

---

## Als App aufs Handy (PWA)

Die Seite ist eine **Progressive Web App** – sie lässt sich installieren:

- **iPhone (Safari):** Teilen-Symbol → *Zum Home-Bildschirm*.
- **Android (Chrome):** Menü ⋮ → *App installieren* (oder Banner in der App).
- **Desktop (Chrome/Edge):** Installations-Symbol in der Adressleiste.

Danach hast du ein App-Icon und Vollbild – inkl. Offline-Anzeige des letzten Standes.

---

## Häufige Anpassungen

| Was | Wo |
|-----|----|
| Punkte / Töpfe ändern | [`data/config.json`](data/config.json) |
| Wer hat welches Team | [`data/ownership.json`](data/ownership.json) |
| Team-Schreibweisen / Kürzel | [`data/teams.json`](data/teams.json) → `aliases` |
| Update-Intervall | [`.github/workflows/update.yml`](.github/workflows/update.yml) → `cron` |
| Aussehen | [`styles.css`](styles.css) |

### Wenn ein Team in der App nicht erkannt wird
Im Reiter **„Info & Check"** erscheinen unbekannte API-Teamnamen. Diesen Namen in
[`data/teams.json`](data/teams.json) beim passenden Land unter `aliases` ergänzen,
committen – fertig.

---

## Technik (kurz)

```
GitHub Action (alle 30 Min)
   └─ scripts/fetch-matches.mjs  ──(API-Key als Secret)──>  football-data.org
        └─ schreibt data/matches.json  ──(git push)──>  GitHub Pages
                                                          └─ index.html + app.js
                                                                └─ scoring.js rechnet
                                                                   die Punkte im Browser
```

Die Punkteberechnung passiert **im Browser** ([`scoring.js`](scoring.js)) aus
`matches.json` + `teams.json` + `ownership.json`. Vorteil: Zuordnung ändern wirkt sofort,
ohne dass die Action neu laufen muss – und der API-Key bleibt geheim.

> **Hinweis Datenquelle:** Der Gratis-Plan von football-data.org deckt die WM ab,
> erlaubt aber begrenzte Anfragen. Falls die WM-Saison unter einem anderen Code/Jahr
> läuft, in [`data/config.json`](data/config.json) `competition`/`season` anpassen.
