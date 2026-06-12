// Wandelt die Original-Excel (als CSV exportiert) in data/ownership.json um.
//
// SO GEHT'S:
//   1. Excel öffnen -> "Speichern unter" -> CSV (Trennzeichen-getrennt) -> z.B. tabelle.csv
//   2. node scripts/csv-to-ownership.mjs tabelle.csv
//
// Erwartetes Format (so wie im PDF):
//   - Eine Kopfzeile, die irgendwo die 16 Personennamen enthält (Balz ... Ricco 2).
//   - Danach pro Team eine Zeile: erste Spalte = Landname, dann pro Person eine Zelle.
//   - Eine "1" (oder beliebiger nicht-leerer Wert ausser 0) bedeutet: Person hat dieses Team.
//
// Das Script erkennt die Personenspalten automatisch anhand der bekannten Namen.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(__dirname, "..", "data");

const PEOPLE = ["Balz","Dominik","Nick","Seraina","Angie","Ricco 1","Saskia","Tina","Tobias","Helene","Reto","Marco","Martin S.","Yannick","Xeno","Ricco 2"];
const teams = JSON.parse(readFileSync(resolve(dataDir, "teams.json"), "utf8"));
const teamNames = Object.keys(teams).filter((k) => !k.startsWith("_"));

const file = process.argv[2];
if (!file) {
  console.error("Aufruf: node scripts/csv-to-ownership.mjs <pfad-zur.csv>");
  process.exit(1);
}

// einfacher CSV-Parser (unterstützt , und ; sowie Anführungszeichen)
function parseCSV(text) {
  const delim = (text.match(/;/g) || []).length > (text.match(/,/g) || []).length ? ";" : ",";
  const rows = [];
  let row = [], cur = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === delim) { row.push(cur); cur = ""; }
      else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
      else if (c === "\r") { /* skip */ }
      else cur += c;
    }
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

const norm = (s) => (s || "").toString().trim().toLowerCase().replace(/\s+/g, " ");

const text = readFileSync(file, "utf8");
const rows = parseCSV(text);

// Kopfzeile mit den Personennamen finden
let headerIdx = -1, colOfPerson = {};
for (let r = 0; r < rows.length; r++) {
  const found = {};
  rows[r].forEach((cell, c) => {
    const person = PEOPLE.find((p) => norm(p) === norm(cell));
    if (person) found[person] = c;
  });
  if (Object.keys(found).length >= 8) { headerIdx = r; colOfPerson = found; break; }
}
if (headerIdx === -1) {
  console.error("❌ Keine Kopfzeile mit den Personennamen gefunden. Namen prüfen:", PEOPLE.join(", "));
  process.exit(1);
}
console.log(`✓ Kopfzeile in Zeile ${headerIdx + 1}, ${Object.keys(colOfPerson).length} Personen erkannt.`);

const ownership = {};
for (const p of PEOPLE) ownership[p] = [];

for (let r = headerIdx + 1; r < rows.length; r++) {
  const cells = rows[r];
  // Landname = erste Zelle, die zu einem bekannten Team passt
  let teamKey = null;
  for (const cell of cells) {
    const match = teamNames.find((t) => norm(t) === norm(cell));
    if (match) { teamKey = match; break; }
  }
  if (!teamKey) continue;
  for (const [person, col] of Object.entries(colOfPerson)) {
    const v = (cells[col] || "").trim();
    if (v && v !== "0") ownership[person].push(teamKey);
  }
}

const outPath = resolve(dataDir, "ownership.json");
const header = { _comment: "Automatisch erzeugt aus CSV via scripts/csv-to-ownership.mjs." };
writeFileSync(outPath, JSON.stringify({ ...header, ...ownership }, null, 2) + "\n");

// Kurz-Validierung
let warn = 0;
for (const p of PEOPLE) {
  const byQ = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const t of ownership[p]) byQ[teams[t]?.quarter]++;
  const bad = Object.values(byQ).some((n) => n !== 2);
  if (bad) { warn++; console.warn(`⚠ ${p}: Töpfe ${JSON.stringify(byQ)} (erwartet je 2)`); }
}
console.log(`✅ ownership.json geschrieben.${warn ? ` (${warn} Warnungen – bitte prüfen)` : " Alles plausibel."}`);
