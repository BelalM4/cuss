const $ = (s) => document.querySelector(s);
const state = { data: null, selected: 0, conversationId: `prof-${crypto.randomUUID()}` };
const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
async function api(url, options) {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed.");
  return data;
}
function selected() { return state.data?.courses?.[state.selected]; }
function render() {
  const c = selected();
  const courses = state.data?.courses || [];
  $("#courseCount").textContent = courses.length;
  $("#courses").innerHTML = courses.map((course, i) => `<button class="course ${i === state.selected ? "active" : ""}" data-course="${i}"><b>${escapeHtml(course.name)}</b><small>${course.roster.length} students · ${course.gradingQueue.length} to grade</small></button>`).join("") || `<div class="empty">No teaching courses found.</div>`;
  document.querySelectorAll("[data-course]").forEach((b) => b.onclick = () => { state.selected = Number(b.dataset.course); render(); });
  if (!c) return;
  $("#studentCount").textContent = c.roster.length;
  $("#riskCount").textContent = c.atRisk.length;
  $("#gradingCount").textContent = c.gradingQueue.length;
  $("#rosterTitle").textContent = `Class health · ${c.name}`;
  $("#roster").innerHTML = `<table><thead><tr><th>Student</th><th>Grade</th><th>Score</th><th>Status</th></tr></thead><tbody>${c.roster.map((s) => `<tr><td>${escapeHtml(s.name)}</td><td>${escapeHtml(s.currentGrade || "—")}</td><td>${s.currentScore ?? "—"}%</td><td class="${c.atRisk.some((r) => r.id === s.id) ? "risk" : ""}">${c.atRisk.some((r) => r.id === s.id) ? "May need support" : "On track"}</td></tr>`).join("")}</tbody></table>`;
  $("#grading").innerHTML = c.gradingQueue.length ? `<ul>${c.gradingQueue.map((x) => `<li><b>${escapeHtml(x.student)}</b> · ${escapeHtml(x.assignment)}</li>`).join("")}</ul>` : `<div class="empty">Nothing waiting for grading.</div>`;
}
function draftCard(card) {
  const title = card.kind === "announcement" ? card.title : `${card.subject} · ${card.recipients.map((r) => r.name).join(", ")}`;
  const action = card.kind === "announcement" ? "Post announcement" : "Send nudge";
  const div = document.createElement("div");
  div.className = "draft";
  div.innerHTML = `<h3>${escapeHtml(title)}</h3><textarea>${escapeHtml(card.body)}</textarea><div class="draft-actions"><button class="btn">${action}</button><button class="btn secondary">Keep draft</button></div>`;
  div.querySelector(".btn").onclick = async () => {
    const body = div.querySelector("textarea").value;
    const extra = card.kind === "announcement" ? { title: card.title, body } : { subject: card.subject, body };
    try { await api(`/api/drafts/${encodeURIComponent(card.id)}/send`, { method: "POST", body: JSON.stringify(extra) }); div.remove(); } catch (e) { alert(e.message); }
  };
  $("#drafts .empty")?.remove();
  $("#drafts").prepend(div);
}
async function ask(text) {
  const log = $("#chatLog");
  log.insertAdjacentHTML("beforeend", `<div class="bubble user">${escapeHtml(text)}</div>`);
  const bot = document.createElement("div"); bot.className = "bubble bot"; log.append(bot);
  const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: state.conversationId, text }) });
  if (!res.ok) { bot.textContent = (await res.json().catch(() => ({}))).error || "Request failed."; return; }
  const reader = res.body.getReader(); const decoder = new TextDecoder(); let pending = "";
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    pending += decoder.decode(value, { stream: true });
    const lines = pending.split("\n"); pending = lines.pop();
    for (const line of lines) { if (!line) continue; const event = JSON.parse(line); if (event.type === "text") bot.textContent += event.delta; if (event.type === "card") draftCard(event.card); }
  }
  log.scrollTop = log.scrollHeight;
}
$("#chatForm").onsubmit = (e) => { e.preventDefault(); const input = $("#chatInput"); const text = input.value.trim(); if (text) { input.value = ""; ask(text).catch((err) => alert(err.message)); } };
$("#logout").onclick = async () => { await api("/auth/logout", { method: "POST" }).catch(() => {}); location.replace("/login.html"); };
(async () => {
  const status = await api("/api/status");
  if (status.role !== "professor") return location.replace("/");
  $("#profName").textContent = `${status.studentName || "Professor"} · Demo University`;
  state.data = await api("/api/professor/dashboard");
  render();
})().catch((err) => { document.body.innerHTML = `<main class="prof"><div class="panel"><h1>Couldn't load professor dashboard</h1><p>${escapeHtml(err.message)}</p></div></main>`; });
