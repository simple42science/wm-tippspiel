import { computeStandings, buildTeamIndex, resolveTeam } from "./scoring.js";

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

const state = { config: null, teams: null, ownership: null, matchData: null, result: null };

async function loadJSON(path) {
  const res = await fetch(`${path}?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

async function loadAll() {
  const [config, teams, ownership, matchData] = await Promise.all([
    loadJSON("data/config.json"),
    loadJSON("data/teams.json"),
    loadJSON("data/ownership.json"),
    loadJSON("data/matches.json"),
  ]);
  state.config = config;
  state.teams = teams;
  state.ownership = ownership;
  state.matchData = matchData;
  state.result = computeStandings({ teams, ownership, matches: matchData.matches, config });

  // Reverse-Map: welches Team gehört welchen Personen?
  state.teamIndex = buildTeamIndex(teams);
  state.ownersByTeam = {};
  for (const [person, list] of Object.entries(ownership)) {
    if (person.startsWith("_")) continue;
    for (const t of list) (state.ownersByTeam[t] ||= []).push(person);
  }
}

// Liefert die Besitzer-Namen zu einer API-Mannschaft ({name, tla})
function ownersOf(side) {
  const key = resolveTeam(state.teamIndex, side);
  return key ? state.ownersByTeam[key] || [] : [];
}

/* ---------- Rendering ---------- */

function teamsMini(teamList) {
  return teamList
    .map((t) => `<span class="qdot q${t.quarter}"></span>${t.team}`)
    .join(" · ");
}

function renderRanking() {
  const wrap = $("#ranking");
  const rows = state.result.standings;
  const max = Math.max(1, ...rows.map((r) => r.total));
  wrap.innerHTML = rows
    .map((r, i) => {
      const medal = r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : r.rank;
      const topClass = r.rank <= 3 ? `top${r.rank}` : "";
      const pct = Math.round((r.total / max) * 100);
      return `
        <div class="rank-row ${topClass}" data-person="${encodeURIComponent(r.name)}">
          <div class="pos">${medal}</div>
          <div class="who">
            <div class="name">${r.name}</div>
            <div class="teams-mini">${teamsMini(r.teams)}</div>
          </div>
          <div class="pts"><div class="big">${r.total}</div><div class="lbl">Punkte</div></div>
          <div class="bar"><i style="width:${pct}%"></i></div>
        </div>`;
    })
    .join("");

  $$(".rank-row", wrap).forEach((el) =>
    el.addEventListener("click", () => openPerson(decodeURIComponent(el.dataset.person)))
  );
}

function outcomeSymbol(o) {
  return o === "win" ? "S" : o === "draw" ? "U" : "N";
}

function openPerson(name) {
  const row = state.result.standings.find((r) => r.name === name);
  if (!row) return;
  const qName = (q) => state.config.quarterNames?.[q] || `Topf ${q}`;
  const content = `
    <h2 style="margin:0 4px 4px">${name}</h2>
    <p class="hint" style="margin:0 4px 16px">Rang ${row.rank} · ${row.total} Punkte</p>
    ${row.teams
      .map((t) => {
        const chips = t.matches.length
          ? t.matches
              .map(
                (m) =>
                  `<span class="match-chip ${m.outcome}">${tlaOf(m.opponent)} ${m.gf ?? "-"}:${m.ga ?? "-"} <b>+${m.points}</b></span>`
              )
              .join("")
          : `<span class="tmeta">noch keine Spiele gewertet</span>`;
        return `
          <div class="team-line">
            <span class="qdot q${t.quarter}"></span>
            <div>
              <div class="tname">${t.team}</div>
              <div class="tmeta">${qName(t.quarter)}</div>
              <div>${chips}</div>
            </div>
            <div class="tpts">${t.points}</div>
          </div>`;
      })
      .join("")}`;
  $("#sheetContent").innerHTML = content;
  $("#sheet").hidden = false;
}

function tlaOf(name) {
  if (!name) return "?";
  // versuche aus teams.json ein Kürzel zu finden, sonst Name kürzen
  for (const [key, t] of Object.entries(state.teams)) {
    if (key.startsWith("_")) continue;
    if (key === name || (t.aliases || []).includes(name)) return t.code;
  }
  return name.length > 12 ? name.slice(0, 11) + "…" : name;
}

/* ---------- Matches ---------- */

let matchFilter = "all";
const STAGE_LABEL = {
  GROUP_STAGE: "Gruppe", LAST_32: "Sechzehntelfinale", LAST_16: "Achtelfinale",
  QUARTER_FINALS: "Viertelfinale", SEMI_FINALS: "Halbfinale",
  THIRD_PLACE: "Spiel um Platz 3", FINAL: "Finale",
};

function isLive(m) { return ["IN_PLAY", "PAUSED"].includes(m.status); }
function isFinished(m) { return m.status === "FINISHED"; }
function isUpcoming(m) { return ["SCHEDULED", "TIMED"].includes(m.status); }

function renderMatches() {
  const wrap = $("#matches");
  let list = [...(state.matchData.matches || [])];
  if (matchFilter === "live") list = list.filter(isLive);
  else if (matchFilter === "finished") list = list.filter(isFinished);
  else if (matchFilter === "upcoming") list = list.filter(isUpcoming);
  list.sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));

  if (!list.length) {
    wrap.innerHTML = `<div class="empty">Noch keine Spiele in dieser Ansicht.<br>Die GitHub-Action füllt die Daten, sobald das Turnier läuft.</div>`;
    return;
  }

  let lastDay = "";
  wrap.innerHTML = list
    .map((m) => {
      const d = new Date(m.utcDate);
      const day = d.toLocaleDateString("de-CH", { weekday: "short", day: "2-digit", month: "short" });
      let sep = "";
      if (day !== lastDay) { lastDay = day; sep = `<div class="match day-sep"><h3>${day}</h3></div>`; }
      const time = d.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });
      const center = isFinished(m) || isLive(m)
        ? `<div class="score">${m.scoreHome ?? "-"} : ${m.scoreAway ?? "-"}</div>
           <div class="stage">${isLive(m) ? '<span class="live-dot"></span>LIVE' : STAGE_LABEL[m.stage] || ""}</div>`
        : `<div class="when">${time}</div><div class="stage">${STAGE_LABEL[m.stage] || ""}</div>`;
      const homeOwners = ownersOf(m.home);
      const awayOwners = ownersOf(m.away);
      const ownerTags = (names) =>
        names.length
          ? `<div class="owners">${names.map((n) => `<span class="owner">${n}</span>`).join("")}</div>`
          : `<div class="owners none">–</div>`;
      return `${sep}
        <div class="match">
          <div class="side">
            <span class="tla">${m.home.tla || m.home.name || "?"}</span>
            ${ownerTags(homeOwners)}
          </div>
          <div class="center">${center}</div>
          <div class="side away">
            <span class="tla">${m.away.tla || m.away.name || "?"}</span>
            ${ownerTags(awayOwners)}
          </div>
        </div>`;
    })
    .join("");
}

/* ---------- Meta / refresh ---------- */

function renderMeta() {
  const md = state.matchData;
  const finished = state.result.finishedCount;
  let txt;
  if (!md.updatedAt) {
    txt = "Noch keine Live-Daten · warten auf erstes Action-Update";
  } else {
    const d = new Date(md.updatedAt);
    txt = `${finished} Spiele gewertet · Stand ${d.toLocaleString("de-CH", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`;
  }
  $("#meta").textContent = txt;
}

function renderAll() {
  renderRanking();
  renderMatches();
  renderMeta();
}

async function refresh() {
  const btn = $("#refreshBtn");
  btn.classList.add("spin");
  try {
    await loadAll();
    renderAll();
  } catch (e) {
    $("#meta").textContent = "Fehler beim Laden: " + e.message;
  } finally {
    setTimeout(() => btn.classList.remove("spin"), 500);
  }
}

/* ---------- Events ---------- */

$$(".tab").forEach((t) =>
  t.addEventListener("click", () => {
    $$(".tab").forEach((x) => x.classList.remove("active"));
    $$(".tabpanel").forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
    $(`#tab-${t.dataset.tab}`).classList.add("active");
  })
);

$$(".chip").forEach((c) =>
  c.addEventListener("click", () => {
    $$(".chip").forEach((x) => x.classList.remove("active"));
    c.classList.add("active");
    matchFilter = c.dataset.filter;
    renderMatches();
  })
);

$("#refreshBtn").addEventListener("click", refresh);
$$("[data-close]").forEach((el) => el.addEventListener("click", () => ($("#sheet").hidden = true)));

/* ---------- PWA ---------- */

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  $("#installCard").hidden = false;
});
$("#installBtn").addEventListener("click", async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  $("#installCard").hidden = true;
});

/* ---------- Start ---------- */

await refresh();
// automatisch aktualisieren
setInterval(refresh, (state.config?.refreshSeconds || 120) * 1000);
