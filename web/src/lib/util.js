// Small helpers shared by the whole app.

export const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

export const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem("cuss." + key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem("cuss." + key, JSON.stringify(value));
    } catch {}
  },
};

export async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    body: options.body && typeof options.body !== "string" ? JSON.stringify(options.body) : options.body,
  });
  if (res.status === 401) {
    location.replace("/login.html");
    throw new Error("Please log in.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Small, safe Markdown renderer (input is escaped first).
export function markdown(src) {
  const inline = (t) =>
    escapeHtml(t)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]*)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
  const out = [];
  let list = null;
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  for (const line of String(src).split("\n")) {
    let m;
    if ((m = line.match(/^\s*[-*•]\s+(.*)/))) {
      if (list !== "ul") closeList(), out.push("<ul>"), (list = "ul");
      out.push(`<li>${inline(m[1])}</li>`);
    } else if ((m = line.match(/^\s*\d+[.)]\s+(.*)/))) {
      if (list !== "ol") closeList(), out.push("<ol>"), (list = "ol");
      out.push(`<li>${inline(m[1])}</li>`);
    } else if ((m = line.match(/^#{1,6}\s+(.*)/))) {
      closeList();
      out.push(`<h3>${inline(m[1])}</h3>`);
    } else if (!line.trim()) {
      closeList();
    } else {
      closeList();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  closeList();
  return out.join("");
}

export function plainText(md) {
  return md
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_`#>]/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .trim();
}

export function formatDue(iso) {
  const d = new Date(iso);
  const ms = d - Date.now();
  const hours = ms / 36e5;
  let rel;
  if (ms < 0) rel = "past due";
  else if (hours < 1) rel = `${Math.max(1, Math.round(ms / 6e4))}m`;
  else if (hours < 24) rel = `${Math.round(hours)}h`;
  else rel = `${Math.round(hours / 24)}d`;
  const cls = ms < 0 || hours < 24 ? "urgent" : hours < 72 ? "soon" : "later";
  const when = d.toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return { rel, cls, when };
}

export const initials = (name = "") =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "?";

export const ymdLocal = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const dayLabel = (ymd) => {
  const today = ymdLocal();
  const tomorrow = ymdLocal(new Date(Date.now() + 864e5));
  if (ymd === today) return "Today";
  if (ymd === tomorrow) return "Tomorrow";
  return new Date(ymd + "T12:00:00").toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
};

export const shortCourse = (name = "") => name.split(/ [–-] /)[0];

export const shortTime = (iso) => new Date(iso).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });

export function confetti() {
  const colors = ["#6366f1", "#a855f7", "#ec4899", "#f5a524", "#12a150"];
  for (let k = 0; k < 90; k++) {
    const c = document.createElement("div");
    c.className = "confetti";
    c.style.left = Math.random() * 100 + "vw";
    c.style.background = colors[k % colors.length];
    c.style.animationDuration = 1.6 + Math.random() * 1.6 + "s";
    c.style.animationDelay = Math.random() * 0.4 + "s";
    document.body.append(c);
    setTimeout(() => c.remove(), 3800);
  }
}
