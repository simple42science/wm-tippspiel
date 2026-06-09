// Wird von der GitHub Action ausgeführt (Node 20+).
// Holt die WM-Spiele von football-data.org und schreibt sie normalisiert nach data/matches.json.
// Der API-Key steht NUR hier (als GitHub-Secret) – er landet nie im ausgelieferten Frontend.

import { writeFileSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(__dirname, "..", "data");

const cfg = JSON.parse(readFileSync(resolve(dataDir, "config.json"), "utf8"));

const TOKEN = process.env.FOOTBALL_DATA_TOKEN;
const COMPETITION = process.env.COMPETITION || cfg.competition || "WC";
const SEASON = process.env.SEASON || cfg.season || "";

if (!TOKEN) {
  console.error("❌ Umgebungsvariable FOOTBALL_DATA_TOKEN fehlt (GitHub-Secret setzen).");
  process.exit(1);
}

const url = new URL(`https://api.football-data.org/v4/competitions/${COMPETITION}/matches`);
if (SEASON) url.searchParams.set("season", SEASON);

console.log(`→ Hole Spiele: ${url.toString()}`);

const res = await fetch(url, { headers: { "X-Auth-Token": TOKEN } });

// Throttling beobachten (Empfehlung football-data.org): Restkontingent pro Minute loggen.
const remaining = res.headers.get("X-Requests-Available-Minute");
const reset = res.headers.get("X-RequestCounter-Reset");
if (remaining !== null) console.log(`ℹ️ API-Restanfragen diese Minute: ${remaining} (Reset in ${reset}s)`);

if (res.status === 429) {
  console.error(`❌ Rate-Limit erreicht (429). Reset in ${reset || "?"}s. Action später erneut laufen lassen.`);
  process.exit(1);
}

if (!res.ok) {
  const body = await res.text();
  console.error(`❌ API-Fehler ${res.status}: ${body}`);
  // 403/404 = Wettbewerb evtl. nicht im Gratis-Plan oder Saison noch nicht verfügbar.
  process.exit(1);
}

const data = await res.json();

const matches = (data.matches || []).map((m) => ({
  id: m.id,
  utcDate: m.utcDate,
  status: m.status, // SCHEDULED | TIMED | IN_PLAY | PAUSED | FINISHED | POSTPONED | ...
  stage: m.stage, // GROUP_STAGE | LAST_16 | QUARTER_FINALS | SEMI_FINALS | THIRD_PLACE | FINAL
  group: m.group || null,
  matchday: m.matchday ?? null,
  home: { name: m.homeTeam?.name ?? null, tla: m.homeTeam?.tla ?? null },
  away: { name: m.awayTeam?.name ?? null, tla: m.awayTeam?.tla ?? null },
  winner: m.score?.winner ?? null, // HOME_TEAM | AWAY_TEAM | DRAW | null
  scoreHome: m.score?.fullTime?.home ?? null,
  scoreAway: m.score?.fullTime?.away ?? null,
}));

const out = {
  updatedAt: new Date().toISOString(),
  competition: COMPETITION,
  season: SEASON || data.filters?.season || null,
  count: matches.length,
  finished: matches.filter((m) => m.status === "FINISHED").length,
  matches,
};

const outPath = resolve(dataDir, "matches.json");
writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
console.log(`✅ ${matches.length} Spiele gespeichert (${out.finished} beendet) → ${outPath}`);
