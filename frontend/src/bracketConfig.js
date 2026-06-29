// TODO: Hardcoded from WC2026 bracket draw — replace with API linkage if football-data.org
// ever provides bracket slot references on unplayed matches.
//
// Structure: each match has a unique id, the two "slots" that feed it (either a team name
// for known R32 participants, or the id of the R32/R16/QF match whose winner advances here),
// and the id of the next match the winner progresses to.
//
// Team names must match exactly what football-data.org returns (and what is stored in the DB).

export const BRACKET_MATCHES = [
  // ── Round of 32 ──────────────────────────────────────────────────────────
  { id: "r32_1",  stage: "LAST_32",      home: "Germany",            away: "Paraguay",               next: "r16_1" },
  { id: "r32_2",  stage: "LAST_32",      home: "France",             away: "Sweden",                 next: "r16_1" },
  { id: "r32_3",  stage: "LAST_32",      home: "South Africa",       away: "Canada",                 next: "r16_2" },
  { id: "r32_4",  stage: "LAST_32",      home: "Netherlands",        away: "Morocco",                next: "r16_2" },
  { id: "r32_5",  stage: "LAST_32",      home: "Portugal",           away: "Croatia",                next: "r16_3" },
  { id: "r32_6",  stage: "LAST_32",      home: "Spain",              away: "Austria",                next: "r16_3" },
  { id: "r32_7",  stage: "LAST_32",      home: "United States",      away: "Bosnia and Herzegovina", next: "r16_4" },
  { id: "r32_8",  stage: "LAST_32",      home: "Belgium",            away: "Senegal",                next: "r16_4" },
  { id: "r32_9",  stage: "LAST_32",      home: "Brazil",             away: "Japan",                  next: "r16_5" },
  { id: "r32_10", stage: "LAST_32",      home: "Ivory Coast",        away: "Norway",                 next: "r16_5" },
  { id: "r32_11", stage: "LAST_32",      home: "Mexico",             away: "Ecuador",                next: "r16_6" },
  { id: "r32_12", stage: "LAST_32",      home: "DR Congo",           away: "England",                next: "r16_6" },
  { id: "r32_13", stage: "LAST_32",      home: "Argentina",          away: "Cape Verde",             next: "r16_7" },
  { id: "r32_14", stage: "LAST_32",      home: "Australia",          away: "Egypt",                  next: "r16_7" },
  { id: "r32_15", stage: "LAST_32",      home: "Switzerland",        away: "Algeria",                next: "r16_8" },
  { id: "r32_16", stage: "LAST_32",      home: "Colombia",           away: "Ghana",                  next: "r16_8" },

  // ── Round of 16 ──────────────────────────────────────────────────────────
  { id: "r16_1",  stage: "LAST_16",      home: "r32_1",  away: "r32_2",  next: "qf_1" },
  { id: "r16_2",  stage: "LAST_16",      home: "r32_3",  away: "r32_4",  next: "qf_1" },
  { id: "r16_3",  stage: "LAST_16",      home: "r32_5",  away: "r32_6",  next: "qf_2" },
  { id: "r16_4",  stage: "LAST_16",      home: "r32_7",  away: "r32_8",  next: "qf_2" },
  { id: "r16_5",  stage: "LAST_16",      home: "r32_9",  away: "r32_10", next: "qf_3" },
  { id: "r16_6",  stage: "LAST_16",      home: "r32_11", away: "r32_12", next: "qf_3" },
  { id: "r16_7",  stage: "LAST_16",      home: "r32_13", away: "r32_14", next: "qf_4" },
  { id: "r16_8",  stage: "LAST_16",      home: "r32_15", away: "r32_16", next: "qf_4" },

  // ── Quarter-finals ───────────────────────────────────────────────────────
  { id: "qf_1",   stage: "QUARTER_FINALS", home: "r16_1", away: "r16_2", next: "sf_1" },
  { id: "qf_2",   stage: "QUARTER_FINALS", home: "r16_3", away: "r16_4", next: "sf_1" },
  { id: "qf_3",   stage: "QUARTER_FINALS", home: "r16_5", away: "r16_6", next: "sf_2" },
  { id: "qf_4",   stage: "QUARTER_FINALS", home: "r16_7", away: "r16_8", next: "sf_2" },

  // ── Semi-finals ──────────────────────────────────────────────────────────
  { id: "sf_1",   stage: "SEMI_FINALS",    home: "qf_1",  away: "qf_2",  next: "final" },
  { id: "sf_2",   stage: "SEMI_FINALS",    home: "qf_3",  away: "qf_4",  next: "final" },

  // ── Third place ──────────────────────────────────────────────────────────
  { id: "third",  stage: "THIRD_PLACE",    home: "sf_1_loser", away: "sf_2_loser", next: null },

  // ── Final ────────────────────────────────────────────────────────────────
  { id: "final",  stage: "FINAL",          home: "sf_1",  away: "sf_2",  next: null },
];

export const BRACKET_STAGES = [
  { key: "LAST_32",       label: "Round of 32",  ids: ["r32_1","r32_2","r32_3","r32_4","r32_5","r32_6","r32_7","r32_8","r32_9","r32_10","r32_11","r32_12","r32_13","r32_14","r32_15","r32_16"] },
  { key: "LAST_16",       label: "Round of 16",  ids: ["r16_1","r16_2","r16_3","r16_4","r16_5","r16_6","r16_7","r16_8"] },
  { key: "QUARTER_FINALS",label: "Quarter-finals",ids: ["qf_1","qf_2","qf_3","qf_4"] },
  { key: "SEMI_FINALS",   label: "Semi-finals",  ids: ["sf_1","sf_2"] },
  { key: "FINAL",         label: "Final",        ids: ["final","third"] },
];
