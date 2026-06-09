// Gemeinsame Scoring-Logik. Läuft im Browser (ES-Modul) und in Node.
// Punkte werden im Browser aus matches.json + teams.json + ownership.json berechnet,
// damit der API-Key geheim bleibt (nur die GitHub-Action holt die Spiele).

export function normalize(s) {
  return (s || "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // Akzente weg
    .replace(/[^a-z0-9]/g, "");      // Sonderzeichen/Leerzeichen weg
}

// Baut einen Index: normalisierter Name/Code/Alias -> teamKey
export function buildTeamIndex(teams) {
  const idx = new Map();
  for (const [key, t] of Object.entries(teams)) {
    if (key.startsWith("_")) continue;
    const names = new Set([key, t.code, ...(t.aliases || [])]);
    for (const n of names) {
      const k = normalize(n);
      if (k) idx.set(k, key);
    }
  }
  return idx;
}

// Findet zu einer API-Mannschaft ({name, tla}) den teamKey, sonst null
export function resolveTeam(idx, side) {
  if (!side) return null;
  return idx.get(normalize(side.tla)) || idx.get(normalize(side.name)) || null;
}

// Punkte für ein einzelnes Spiel-Ergebnis aus Sicht eines Teams
export function pointsFor(quarter, isGroup, outcome, config) {
  if (outcome === "loss") return 0;
  if (isGroup) {
    const win = config.groupPointsByQuarter[quarter] ?? config.groupPointsByQuarter[String(quarter)] ?? 0;
    return outcome === "win" ? win : win / 2;
  }
  return outcome === "win" ? config.knockoutWin : config.knockoutDraw;
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Hauptfunktion: berechnet Punkte pro Team und die Rangliste der Personen
export function computeStandings({ teams, ownership, matches, config }) {
  const idx = buildTeamIndex(teams);

  const teamPoints = {};
  const teamMatches = {};
  for (const key of Object.keys(teams)) {
    if (key.startsWith("_")) continue;
    teamPoints[key] = 0;
    teamMatches[key] = [];
  }

  let finishedCount = 0;
  const unmatched = new Set();

  for (const m of matches || []) {
    const homeKey = resolveTeam(idx, m.home);
    const awayKey = resolveTeam(idx, m.away);
    if (m.home && !homeKey && m.home.name) unmatched.add(m.home.name);
    if (m.away && !awayKey && m.away.name) unmatched.add(m.away.name);

    if (m.status !== "FINISHED") continue;
    finishedCount++;

    const isGroup = m.stage === "GROUP_STAGE";
    const sides = [
      { key: homeKey, self: "HOME_TEAM", opp: m.away?.name, gf: m.scoreHome, ga: m.scoreAway },
      { key: awayKey, self: "AWAY_TEAM", opp: m.home?.name, gf: m.scoreAway, ga: m.scoreHome },
    ];

    for (const s of sides) {
      if (!s.key) continue;
      let outcome = "loss";
      if (m.winner === "DRAW") outcome = "draw";
      else if (m.winner === s.self) outcome = "win";

      const q = teams[s.key].quarter;
      const pts = pointsFor(q, isGroup, outcome, config);
      teamPoints[s.key] += pts;
      teamMatches[s.key].push({
        matchId: m.id,
        date: m.utcDate,
        stage: m.stage,
        opponent: s.opp,
        gf: s.gf,
        ga: s.ga,
        outcome,
        points: round2(pts),
      });
    }
  }

  const standings = Object.entries(ownership)
    .filter(([name]) => !name.startsWith("_"))
    .map(([name, teamList]) => {
      const breakdown = teamList.map((tk) => ({
        team: tk,
        quarter: teams[tk]?.quarter ?? null,
        points: round2(teamPoints[tk] || 0),
        matches: teamMatches[tk] || [],
        unknown: !teams[tk],
      }));
      const total = round2(breakdown.reduce((a, b) => a + b.points, 0));
      return { name, total, teams: breakdown };
    })
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  // Ränge inkl. gleicher Plätze bei Punktgleichheit
  let rank = 0, prev = null, seen = 0;
  for (const row of standings) {
    seen++;
    if (row.total !== prev) {
      rank = seen;
      prev = row.total;
    }
    row.rank = rank;
  }

  return {
    standings,
    teamPoints,
    teamMatches,
    finishedCount,
    unmatched: [...unmatched],
  };
}
