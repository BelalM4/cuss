// Loads everything on the Today panel. Each section keeps its last data while
// it reloads, so refreshing never flashes empty lists.
import { useCallback, useRef, useState } from "react";
import { api } from "./lib/util.js";

const section = (data = null) => ({ state: "loading", data, error: null });

export function useDashboard(status) {
  const [deadlines, setDeadlines] = useState(section);
  const [inbox, setInbox] = useState(section);
  const [impact, setImpact] = useState(null);
  const [readings, setReadings] = useState(section);
  const [courses, setCourses] = useState(section);
  const [teacher, setTeacher] = useState(section);
  const statusRef = useRef(status);
  statusRef.current = status;

  const load = (set, fn, error) => {
    set((s) => ({ ...s, state: "loading" }));
    return fn().then(
      (data) => set({ state: "ok", data, error: null }),
      () => set((s) => ({ ...s, state: "error", error })),
    );
  };

  const loadInbox = useCallback(() => load(setInbox, () => api("/api/inbox"), "Couldn’t load messages."), []);
  const loadReadings = useCallback(() => load(setReadings, () => api("/api/library/upcoming"), "Couldn’t load readings."), []);
  const loadImpact = useCallback(() => api("/api/impact").then(setImpact, () => {}), []);

  const loadDashboard = useCallback(() => {
    const s = statusRef.current;
    if (!s) return;
    load(setDeadlines, () => api("/api/deadlines?days=14"), "Couldn’t load deadlines.");
    loadInbox();
    loadImpact();
    loadReadings();
    if (s.role === "teacher") load(setTeacher, () => api("/api/teacher/overview"), "Couldn’t load classes.");
    else load(setCourses, () => api("/api/courses"), "Couldn’t load classes.");
  }, [loadInbox, loadImpact, loadReadings]);

  return { deadlines, inbox, impact, readings, courses, teacher, loadDashboard, loadInbox, loadImpact, loadReadings };
}

// Numbers for the stats row, badges and the welcome line.
export function summarize(dash, isTeacher) {
  if (isTeacher) {
    const courses = dash.teacher.data;
    if (!courses) return null;
    const sum = (f) => courses.reduce((n, c) => n + (f(c) || 0), 0);
    const needs = sum((c) => c.atRisk.length);
    const grading = sum((c) => c.needsGrading);
    return { stats: [sum((c) => c.summary?.students), needs, grading], badge: needs, needs, grading };
  }
  const d = dash.deadlines.data;
  if (!d) return null;
  const open = d.upcoming.filter((x) => !x.submitted && !x.markedDone);
  const week = open.filter((x) => new Date(x.dueAt) - Date.now() < 7 * 864e5).length;
  const soon = open.filter((x) => new Date(x.dueAt) - Date.now() < 48 * 36e5).length;
  const scored = (dash.courses.data || []).filter((c) => c.currentScore != null);
  const grade = scored.length ? Math.round(scored.reduce((s, c) => s + c.currentScore, 0) / scored.length) + "%" : "–";
  return { stats: [week, d.missing.length, grade], badge: soon + d.missing.length, soon, missing: d.missing.length };
}
