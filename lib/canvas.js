// Canvas LMS REST API client, acting as the logged-in student (OAuth token
// from SSO login, refreshed automatically, or a personal access token).
import { getConfig } from "./store.js";
import { accessToken } from "./auth.js";
import { readFileForClaude } from "./files.js";

export class CanvasError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

function baseUrl() {
  let url = getConfig().canvasUrl.trim();
  if (!url) throw new CanvasError("The app's Canvas address isn't set up (CANVAS_URL).", 500);
  if (!/^https?:\/\//.test(url)) url = "https://" + url;
  return url.replace(/\/+$/, "");
}

async function headers(extra = {}, opts) {
  const token = await accessToken(opts);
  if (!token) throw new CanvasError("You're not connected to Canvas. Please log in again.", 403);
  return { Authorization: `Bearer ${token}`, Accept: "application/json", ...extra };
}

function buildUrl(pathOrUrl, params) {
  const url = new URL(pathOrUrl.startsWith("http") ? pathOrUrl : baseUrl() + "/api/v1" + pathOrUrl);
  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) value.forEach((v) => url.searchParams.append(key, v));
    else url.searchParams.set(key, value);
  }
  return url;
}

async function request(method, pathOrUrl, { params, body } = {}) {
  const send = async (opts) =>
    fetch(buildUrl(pathOrUrl, params), {
      method,
      headers: await headers(body ? { "Content-Type": "application/json" } : {}, opts),
      body: body ? JSON.stringify(body) : undefined,
    });
  let res = await send();
  // An expired login gets one automatic refresh-and-retry.
  if (res.status === 401 && getConfig().refreshToken) res = await send({ forceRefresh: true });
  if (!res.ok) {
    let detail = "";
    try {
      const j = await res.json();
      detail = j.errors ? JSON.stringify(j.errors) : j.message || "";
    } catch {}
    const hint =
      res.status === 401
        ? "Canvas didn't allow that. If this keeps happening, log out and log back in."
        : res.status === 403
          ? "Canvas says you don't have permission for that."
          : res.status === 404
            ? "Canvas couldn't find that item."
            : `Canvas returned an error (${res.status}).`;
    // 401 from Canvas often just means "no permission for this item", so it is
    // reported as 403 to keep the browser from treating it as a logout.
    throw new CanvasError(`${hint} ${detail}`.trim(), res.status === 401 ? 403 : res.status);
  }
  return res;
}

// GET with automatic pagination via the Link header.
export async function get(path, params = {}, { maxPages = 10 } = {}) {
  let res = await request("GET", path, { params: { per_page: 100, ...params } });
  let data = await res.json();
  if (!Array.isArray(data)) return data;
  let pages = 1;
  let next = nextLink(res.headers.get("link"));
  while (next && pages < maxPages) {
    res = await request("GET", next);
    data = data.concat(await res.json());
    next = nextLink(res.headers.get("link"));
    pages++;
  }
  return data;
}

function nextLink(link) {
  if (!link) return null;
  const m = link.split(",").find((p) => p.includes('rel="next"'));
  return m ? m.match(/<([^>]+)>/)?.[1] : null;
}

export async function post(path, body) {
  const res = await request("POST", path, { body });
  return res.json();
}

// --- Helpers used by the agent and UI --------------------------------------

export function htmlToText(html = "") {
  return String(html)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr|table|ul|ol)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function getProfile() {
  return get("/users/self/profile");
}

export async function getUserRole() {
  const enrollments = await get("/users/self/enrollments", {
    "type[]": ["TeacherEnrollment", "TaEnrollment", "StudentEnrollment"],
  });
  return enrollments.some((e) => /teacher|ta|designer/i.test(e.type || e.role || "")) ? "professor" : "student";
}

export async function listCourses() {
  const courses = await get("/courses", {
    enrollment_state: "active",
    "include[]": ["total_scores", "term", "teachers"],
  });
  return courses
    .filter((c) => c.name && !c.access_restricted_by_date)
    .map((c) => {
      const enr = (c.enrollments || []).find((e) => e.type === "student") || c.enrollments?.[0] || {};
      return {
        id: c.id,
        name: c.name,
        code: c.course_code,
        term: c.term?.name,
        currentGrade: enr.computed_current_grade ?? null,
        currentScore: enr.computed_current_score ?? null,
        teachers: (c.teachers || []).map((t) => ({ id: t.id, name: t.display_name })),
      };
    });
}

export async function listTeachingCourses() {
  const courses = await get("/courses", {
    enrollment_type: "teacher",
    "include[]": ["term", "teachers"],
  });
  return courses
    .filter((c) => c.name && !c.access_restricted_by_date)
    .map((c) => ({ id: c.id, name: c.name, code: c.course_code, term: c.term?.name }));
}

export async function getCourseRoster(courseId) {
  const users = await get(`/courses/${courseId}/users`, {
    "enrollment_type[]": ["student"],
    "include[]": ["enrollments"],
  });
  return users.map((u) => {
    const enrollment = (u.enrollments || [])[0] || {};
    return {
      id: u.id,
      name: u.name,
      email: u.email || null,
      currentGrade: enrollment.computed_current_grade ?? null,
      currentScore: enrollment.computed_current_score ?? null,
    };
  });
}

export async function getGradingQueue(courseId) {
  const assignments = await get(`/courses/${courseId}/assignments`, { order_by: "due_at" });
  const queue = [];
  for (const assignment of assignments) {
    const submissions = await get(`/courses/${courseId}/students/submissions`, {
      assignment_ids: [assignment.id],
      student_ids: ["all"],
      "include[]": ["user", "assignment"],
    });
    for (const submission of submissions) {
      if (submission.workflow_state === "submitted" && submission.score == null) {
        queue.push({
          assignmentId: assignment.id,
          assignment: assignment.name,
          studentId: submission.user_id,
          student: submission.user?.name || `Student ${submission.user_id}`,
          submittedAt: submission.submitted_at,
          points: assignment.points_possible ?? null,
        });
      }
    }
  }
  return queue;
}

export async function postAnnouncement(courseId, title, message) {
  return post("/announcements", { context_codes: [`course_${courseId}`], title, message });
}

export async function getTeachingDashboard() {
  const courses = await listTeachingCourses();
  const dashboards = await Promise.all(courses.map(async (course) => {
    const [roster, gradingQueue] = await Promise.all([
      getCourseRoster(course.id),
      getGradingQueue(course.id),
    ]);
    return {
      ...course,
      roster,
      gradingQueue,
      atRisk: roster.filter((student) => Number(student.currentScore) < 70 || gradingQueue.some((item) => item.studentId === student.id)),
    };
  }));
  return dashboards;
}

// Everything due in a window (assignments, quizzes, discussions, events...)
// from the Canvas planner, which already knows what's been submitted.
export async function getDeadlines({ daysAhead = 14, daysBack = 0 } = {}) {
  const start = new Date(Date.now() - daysBack * 864e5);
  const end = new Date(Date.now() + daysAhead * 864e5);
  const items = await get("/planner/items", {
    start_date: start.toISOString(),
    end_date: end.toISOString(),
  });
  return items
    .map((it) => {
      const p = it.plannable || {};
      const sub = it.submissions || {};
      return {
        key: `${it.plannable_type}-${it.plannable_id}`,
        type: it.plannable_type,
        id: it.plannable_id,
        courseId: it.course_id,
        course: it.context_name,
        title: p.title || p.name || "Untitled",
        dueAt: p.due_at || it.plannable_date,
        points: p.points_possible ?? null,
        url: it.html_url ? new URL(it.html_url, baseUrl()).href : null,
        submitted: Boolean(sub.submitted),
        graded: Boolean(sub.graded),
        missing: Boolean(sub.missing),
        late: Boolean(sub.late),
        markedDone: Boolean(it.planner_override?.marked_complete),
      };
    })
    .filter((d) => d.dueAt)
    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
}

export async function getMissing() {
  const items = await get("/users/self/missing_submissions", { "include[]": ["course"], filter: ["submittable"] });
  return items.map((a) => ({
    id: a.id,
    courseId: a.course_id,
    course: a.course?.name,
    title: a.name,
    dueAt: a.due_at,
    url: a.html_url,
  }));
}

export async function getCourseOverview(courseId) {
  const [course, modules] = await Promise.all([
    get(`/courses/${courseId}`, { "include[]": ["syllabus_body"] }),
    get(`/courses/${courseId}/modules`, { "include[]": ["items"] }).catch(() => []),
  ]);
  return {
    id: course.id,
    name: course.name,
    syllabus: htmlToText(course.syllabus_body || "").slice(0, 15000),
    modules: modules.map((m) => ({
      id: m.id,
      name: m.name,
      items: (m.items || []).map((i) => ({
        type: i.type,
        title: i.title,
        // What to pass to read_course_item:
        itemId: i.type === "Page" ? i.page_url : i.content_id,
      })),
    })),
  };
}

export async function getInstructors(courseId) {
  const users = await get(`/courses/${courseId}/users`, {
    "enrollment_type[]": ["teacher", "ta"],
    "include[]": ["email", "enrollments"],
  });
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email || null,
    role: (u.enrollments || []).some((e) => e.type === "TeacherEnrollment") ? "Instructor" : "TA",
  }));
}

export async function getAnnouncements(courseIds, days = 14) {
  if (!courseIds.length) return [];
  const items = await get("/announcements", {
    "context_codes[]": courseIds.map((id) => `course_${id}`),
    start_date: new Date(Date.now() - days * 864e5).toISOString(),
    end_date: new Date().toISOString(),
  });
  return items.map((a) => ({
    id: a.id,
    courseId: Number(String(a.context_code).replace("course_", "")),
    title: a.title,
    postedAt: a.posted_at,
    author: a.author?.display_name,
    message: htmlToText(a.message).slice(0, 3000),
  }));
}

const MAX_TEXT = 60000;

// Returns { text } or { pdf: base64, name } for the agent to read.
export async function readCourseItem(courseId, type, itemId) {
  const t = String(type).toLowerCase();
  const clip = (s) =>
    s.length > MAX_TEXT ? s.slice(0, MAX_TEXT) + `\n\n[Content cut at ${MAX_TEXT} characters - it continues in Canvas.]` : s;

  if (t === "page") {
    const p = await get(`/courses/${courseId}/pages/${encodeURIComponent(itemId)}`);
    return { text: clip(`# ${p.title}\n\n${htmlToText(p.body)}`) };
  }
  if (t === "assignment") {
    const a = await get(`/courses/${courseId}/assignments/${itemId}`, { "include[]": ["submission"] });
    return {
      text: clip(
        `# ${a.name}\nDue: ${a.due_at || "no due date"} | Points: ${a.points_possible ?? "?"} | ` +
          `Submitted: ${a.submission?.workflow_state === "submitted" || a.submission?.submitted_at ? "yes" : "no"}\n` +
          `Submission types: ${(a.submission_types || []).join(", ")}\n\n${htmlToText(a.description)}`,
      ),
    };
  }
  if (t === "discussion") {
    const d = await get(`/courses/${courseId}/discussion_topics/${itemId}`);
    return { text: clip(`# ${d.title}\n\n${htmlToText(d.message)}`) };
  }
  if (t === "quiz") {
    const q = await get(`/courses/${courseId}/quizzes/${itemId}`);
    return {
      text: `# ${q.title}\nDue: ${q.due_at || "none"} | Questions: ${q.question_count} | Time limit: ${
        q.time_limit ?? "none"
      } min\n\n${htmlToText(q.description)}`,
    };
  }
  if (t === "file") {
    const f = await get(`/courses/${courseId}/files/${itemId}`);
    const name = f.display_name || f.filename;
    const type = f["content-type"] || "";
    if (f.size > 20 * 1024 * 1024) return { text: `"${name}" is too large to read here (${Math.round(f.size / 1e6)} MB).` };
    // f.url carries its own verifier; only add the token if Canvas insists.
    let res = await fetch(f.url);
    if (res.status === 401 || res.status === 403) res = await fetch(f.url, { headers: await headers() });
    if (!res.ok) throw new CanvasError(`Couldn't download "${name}" (${res.status}).`, res.status);
    const item = await readFileForClaude(Buffer.from(await res.arrayBuffer()), name, type);
    if (item.text) item.text = clip(item.html ? htmlToText(item.text) : item.text);
    return item;
  }
  throw new CanvasError(`Unknown item type "${type}". Use page, assignment, discussion, quiz or file.`, 400);
}

export async function listFiles(courseId) {
  const files = await get(`/courses/${courseId}/files`, { sort: "updated_at", order: "desc" }, { maxPages: 3 });
  return files.map((f) => ({ id: f.id, name: f.display_name, type: f["content-type"], updatedAt: f.updated_at }));
}

// Sends a Canvas Inbox message (Canvas also emails it to the recipient).
export async function sendMessage({ courseId, recipientIds, subject, body }) {
  const result = await post("/conversations", {
    recipients: recipientIds.map(String),
    subject,
    body,
    context_code: courseId ? `course_${courseId}` : undefined,
    force_new: true,
    group_conversation: false,
  });
  return Array.isArray(result) ? result[0] : result;
}

// --- Canvas Inbox (reading and replying) -------------------------------------

function summarizeConversation(c) {
  return {
    id: c.id,
    subject: c.subject || "(no subject)",
    course: c.context_name || null,
    unread: c.workflow_state === "unread",
    lastMessage: htmlToText(c.last_message || "").slice(0, 300),
    lastMessageAt: c.last_message_at,
    messageCount: c.message_count,
    participants: (c.participants || []).map((p) => p.name),
  };
}

// scope: "inbox" (default), "unread" or "sent".
export async function listConversations({ scope = "inbox", limit = 20 } = {}) {
  const items = await get("/conversations", { scope, per_page: limit }, { maxPages: 1 });
  return items.slice(0, limit).map(summarizeConversation);
}

// Reading a conversation marks it as read in Canvas, just like opening it there.
export async function getConversation(id) {
  const c = await get(`/conversations/${encodeURIComponent(id)}`);
  const names = Object.fromEntries((c.participants || []).map((p) => [p.id, p.name]));
  return {
    ...summarizeConversation(c),
    participantIds: (c.participants || []).map((p) => p.id),
    messages: (c.messages || [])
      .map((m) => ({ from: names[m.author_id] || "Unknown", fromId: m.author_id, at: m.created_at, body: htmlToText(m.body).slice(0, 6000) }))
      .sort((a, b) => new Date(a.at) - new Date(b.at)),
  };
}

export async function replyToConversation(id, body) {
  return post(`/conversations/${encodeURIComponent(id)}/add_message`, { body });
}
