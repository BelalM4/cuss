// Impact measurement: what Cuss actually did for each student, plus whether
// their missing-assignment count goes down over time. Stored per student in
// impact.json; /impact shows anonymous totals across everyone.
import fs from "node:fs";
import path from "node:path";
import { readJson, writeJson, listUserIds, userDir, getConfig, runAsUser } from "./store.js";

const EMPTY = { counts: {}, quizzes: [], missingByDay: {}, firstSeen: null };

function load() {
  return { ...structuredClone(EMPTY), ...readJson("impact.json", {}) };
}

// type: reminder | inbox_alert | email_sent | reply_sent | quiz | briefing | chat
export function recordImpact(type, data = {}) {
  try {
    const imp = load();
    imp.firstSeen ||= new Date().toISOString();
    imp.counts[type] = (imp.counts[type] || 0) + 1;
    if (type === "quiz" && Number.isFinite(data.score) && data.total > 0) {
      imp.quizzes.push({ at: new Date().toISOString(), score: data.score, total: data.total });
      imp.quizzes = imp.quizzes.slice(-200);
    }
    writeJson("impact.json", imp);
  } catch {}
}

// Once a day: how many assignments are missing right now.
export function recordMissingSnapshot(missingCount) {
  try {
    const imp = load();
    imp.firstSeen ||= new Date().toISOString();
    const day = new Date().toISOString().slice(0, 10);
    if (imp.missingByDay[day] === undefined) imp.missingByDay[day] = missingCount;
    writeJson("impact.json", imp);
  } catch {}
}

function quizAverage(quizzes) {
  const total = quizzes.reduce((s, q) => s + q.total, 0);
  return total ? Math.round((quizzes.reduce((s, q) => s + q.score, 0) / total) * 100) : null;
}

function missingTrend(missingByDay) {
  const days = Object.keys(missingByDay).sort();
  if (!days.length) return null;
  return { firstDay: days[0], first: missingByDay[days[0]], lastDay: days.at(-1), last: missingByDay[days.at(-1)] };
}

// The current student's own summary.
export function myImpact() {
  const imp = load();
  return { counts: imp.counts, quizAverage: quizAverage(imp.quizzes), quizzesTaken: imp.quizzes.length, missing: missingTrend(imp.missingByDay), since: imp.firstSeen };
}

// Anonymous totals across all students, split into real and demo accounts.
export function aggregateImpact() {
  const groups = { real: blank(), demo: blank() };
  function blank() {
    return { students: 0, counts: {}, quizzes: [], studentsWithTrend: 0, missingStart: 0, missingNow: 0 };
  }
  for (const id of listUserIds()) {
    if (!fs.existsSync(path.join(userDir(id), "impact.json"))) continue;
    runAsUser(id, () => {
      const imp = load();
      const g = getConfig().demo ? groups.demo : groups.real;
      g.students++;
      for (const [k, v] of Object.entries(imp.counts)) g.counts[k] = (g.counts[k] || 0) + v;
      g.quizzes.push(...imp.quizzes);
      const t = missingTrend(imp.missingByDay);
      if (t && t.firstDay !== t.lastDay) {
        g.studentsWithTrend++;
        g.missingStart += t.first;
        g.missingNow += t.last;
      }
    });
  }
  for (const g of Object.values(groups)) {
    g.quizzesTaken = g.quizzes.length;
    g.quizAverage = quizAverage(g.quizzes);
    delete g.quizzes;
  }
  return { updatedAt: new Date().toISOString(), ...groups };
}
