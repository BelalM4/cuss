// A built-in pretend Canvas ("Demo University") so anyone can try Cuss, including
// the full sign-in flow, without a school account. It speaks the same OAuth2
// and REST API as real Canvas, so the rest of the app runs unchanged.
// Messages "sent" here go nowhere.
import express from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FILES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "demo-files");

export const DEMO_CLIENT = { clientId: "cuss-demo", clientSecret: "cuss-demo-secret" };
const DEMO_SCHOOL = "Demo University";

const router = express.Router();
const day = 864e5;
const hour = 36e5;

// --- Sample data (dates are relative to "now" so it always looks current) ----

function at(offsetMs, h = 23, m = 59) {
  const d = new Date(Date.now() + offsetMs);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

const TEACHERS = {
  101: [{ id: 501, name: "Dr. Maya Chen", email: "mchen@demo.edu", role: "TeacherEnrollment" }, { id: 502, name: "Jordan Lee (TA)", email: "jlee@demo.edu", role: "TaEnrollment" }],
  102: [{ id: 503, name: "Prof. Daniel Ortiz", email: "dortiz@demo.edu", role: "TeacherEnrollment" }],
  103: [{ id: 504, name: "Dr. Aisha Rahman", email: "arahman@demo.edu", role: "TeacherEnrollment" }],
};

const COURSES = [
  { id: 101, name: "BIOL 230 – Introductory Cell Biology", course_code: "BIOL 230", grade: "B+", score: 88.4 },
  { id: 102, name: "HIST 120 – U.S. History Since 1865", course_code: "HIST 120", grade: "A-", score: 91.0 },
  { id: 103, name: "MATH 226 – Calculus I", course_code: "MATH 226", grade: "B", score: 84.2 },
];

const PAGES = {
  101: {
    "cell-membrane-and-transport": {
      title: "Week 8: The Cell Membrane & Transport",
      body: `<h2>Structure: the fluid mosaic model</h2>
<p>The plasma membrane is a <b>phospholipid bilayer</b>. Each phospholipid has a hydrophilic (water-loving) phosphate head and two hydrophobic fatty-acid tails. Tails face inward, heads face the watery inside and outside of the cell.</p>
<p>Proteins float in the bilayer like tiles in a mosaic: <b>integral proteins</b> span the membrane (channels, carriers, pumps); <b>peripheral proteins</b> sit on the surface. <b>Cholesterol</b> keeps the membrane fluid at low temperatures and stable at high temperatures. <b>Glycoproteins</b> and glycolipids act as ID tags for cell recognition.</p>
<h2>Passive transport (no ATP)</h2>
<ul><li><b>Simple diffusion</b>: small nonpolar molecules (O2, CO2) move down their concentration gradient straight through the bilayer.</li>
<li><b>Facilitated diffusion</b>: ions and polar molecules (glucose, Na+) move down their gradient through channel or carrier proteins. Aquaporins are channels for water.</li>
<li><b>Osmosis</b>: diffusion of water across a selectively permeable membrane toward higher solute concentration. In a <b>hypotonic</b> solution animal cells swell and may burst (lyse); in a <b>hypertonic</b> solution they shrivel (crenate); <b>isotonic</b> means no net movement. Plant cells prefer hypotonic surroundings (turgid).</li></ul>
<h2>Active transport (uses energy)</h2>
<ul><li><b>Sodium-potassium pump</b>: uses 1 ATP to pump 3 Na+ out and 2 K+ in, against their gradients. This builds the membrane potential.</li>
<li><b>Cotransport</b> (secondary active transport): a pump's gradient powers another molecule's movement, e.g. the H+/sucrose cotransporter in plants.</li>
<li><b>Bulk transport</b>: <b>endocytosis</b> (phagocytosis = "cell eating", pinocytosis = "cell drinking", receptor-mediated endocytosis, e.g. LDL cholesterol uptake) and <b>exocytosis</b> (vesicles fuse with the membrane to release contents, e.g. neurotransmitters).</li></ul>`,
    },
    "cellular-respiration": {
      title: "Week 9: Cellular Respiration",
      body: `<p>Overall: C6H12O6 + 6 O2 → 6 CO2 + 6 H2O + energy (~30–32 ATP).</p>
<h2>1. Glycolysis (cytoplasm)</h2><p>Glucose is split into 2 pyruvate. Net yield: <b>2 ATP</b> and <b>2 NADH</b>. Does not need oxygen.</p>
<h2>2. Pyruvate oxidation (mitochondrial matrix)</h2><p>Each pyruvate becomes acetyl-CoA, releasing CO2 and making NADH.</p>
<h2>3. Citric acid (Krebs) cycle (matrix)</h2><p>Per glucose (2 turns): 2 ATP, 6 NADH, 2 FADH2, 4 CO2.</p>
<h2>4. Oxidative phosphorylation (inner mitochondrial membrane)</h2><p>NADH and FADH2 drop electrons into the <b>electron transport chain</b>. The energy pumps H+ into the intermembrane space; H+ flows back through <b>ATP synthase</b> (chemiosmosis), making ~26–28 ATP. <b>Oxygen is the final electron acceptor</b> and forms water.</p>
<h2>Without oxygen: fermentation</h2><p>Regenerates NAD+ so glycolysis can continue. Lactic acid fermentation (muscle cells) or alcohol fermentation (yeast: ethanol + CO2). Only 2 ATP per glucose.</p>`,
    },
  },
  102: {
    "reconstruction": {
      title: "Unit 1: Reconstruction (1865–1877)",
      body: `<p><b>Goal:</b> rebuild the South and define freedom for four million formerly enslaved people.</p>
<ul><li><b>13th Amendment (1865)</b> abolished slavery. <b>14th (1868)</b>: citizenship and equal protection. <b>15th (1870)</b>: voting can't be denied by race.</li>
<li><b>Presidential Reconstruction</b>: Andrew Johnson pardoned Confederates; Southern states passed <b>Black Codes</b> restricting freedpeople.</li>
<li><b>Radical (Congressional) Reconstruction</b> from 1867: Reconstruction Acts put the South under military districts; Johnson was impeached in 1868 but acquitted by one vote.</li>
<li><b>Freedmen's Bureau</b> (1865): schools, food, labor contracts. Over 1,000 schools; roots of HBCUs like Howard and Fisk.</li>
<li>Sharecropping and crop-lien systems trapped many Black and poor white farmers in debt.</li>
<li>Violence by the <b>Ku Klux Klan</b>; Enforcement Acts (1870–71) tried to stop it.</li>
<li><b>Compromise of 1877</b>: Rutherford B. Hayes became president; federal troops left the South, ending Reconstruction and opening the way to Jim Crow laws.</li></ul>`,
    },
    "gilded-age": {
      title: "Unit 2: The Gilded Age & Industrialization",
      body: `<ul><li>Railroads, steel (Carnegie, vertical integration), oil (Rockefeller, horizontal integration / trusts).</li>
<li><b>Sherman Antitrust Act (1890)</b> outlawed monopolies but was weakly enforced at first.</li>
<li>New immigrants from Southern and Eastern Europe; Ellis Island (1892). <b>Chinese Exclusion Act (1882)</b>.</li>
<li>Labor conflict: Great Railroad Strike (1877), Haymarket (1886), Homestead (1892), Pullman (1894).</li>
<li>Political machines like Tammany Hall; Pendleton Act (1883) created the merit-based civil service.</li></ul>`,
    },
  },
  103: {
    "derivative-rules": {
      title: "Section 3.1–3.4: Differentiation Rules",
      body: `<ul><li><b>Power rule</b>: d/dx [x^n] = n·x^(n−1). Example: d/dx [x^5] = 5x^4.</li>
<li><b>Constant multiple & sum</b>: d/dx [3x^2 + 4x] = 6x + 4.</li>
<li><b>Product rule</b>: (fg)' = f'g + fg'. Example: d/dx [x^2 sin x] = 2x sin x + x^2 cos x.</li>
<li><b>Quotient rule</b>: (f/g)' = (f'g − fg') / g^2. "Low d-high minus high d-low, over low squared."</li>
<li><b>Chain rule</b>: d/dx f(g(x)) = f'(g(x))·g'(x). Example: d/dx (3x+1)^4 = 4(3x+1)^3 · 3 = 12(3x+1)^3.</li>
<li>Trig: (sin x)' = cos x, (cos x)' = −sin x, (tan x)' = sec^2 x.</li>
<li>Exponential & log: (e^x)' = e^x, (ln x)' = 1/x.</li></ul>
<p><b>Common mistake:</b> forgetting to multiply by the inside derivative in the chain rule.</p>`,
    },
  },
};

const ASSIGNMENTS = () => [
  { id: 1001, course: 101, name: "Lab Report 4: Osmosis in Potato Cores", due: at(1 * day, 23, 59), points: 25, type: "assignment", desc: "Write up your osmosis lab using the template. Include a graph of % mass change vs. sucrose molarity and estimate the isotonic point." },
  { id: 1002, course: 103, name: "WebAssign 3.4: Chain Rule", due: at(2 * day, 23, 59), points: 10, type: "assignment", desc: "Online homework on the chain rule. 15 problems, unlimited attempts." },
  { id: 1003, course: 101, name: "Quiz 5: Membranes & Transport", due: at(3 * day, 10, 0), points: 20, type: "quiz", desc: "Covers Week 8: membrane structure, passive and active transport, osmosis and tonicity. 20 questions, 30 minutes." },
  { id: 1004, course: 102, name: "Primary Source Analysis: Freedmen's Bureau Letters", due: at(5 * day, 23, 59), points: 50, type: "assignment", desc: "Analyze two letters from the Freedmen's Bureau archive (750–1000 words). Use the HAPP framework." },
  { id: 1005, course: 103, name: "Midterm 2 (in class)", due: at(8 * day, 9, 0), points: 100, type: "assignment", desc: "Covers Sections 2.7–3.6: limits review, derivative rules, product/quotient/chain rule, implicit differentiation. One page of notes allowed." },
  { id: 1006, course: 102, name: "Discussion: Was Reconstruction a failure?", due: at(4 * day, 23, 59), points: 15, type: "discussion", desc: "Post 250 words taking a position and reply to two classmates.", submitted: true },
];

const MISSING = () => [{ id: 990, course: 102, name: "Reading Quiz: Gilded Age", due: at(-2 * day, 23, 59) }];

const ANNOUNCEMENTS = () => [
  { id: 7001, course: 101, title: "Quiz 5 moved to Thursday", posted: new Date(Date.now() - 5 * hour).toISOString(), message: "Hi all, Quiz 5 on membranes is now on Thursday at 10am to give you more time after the lab. Office hours Wednesday 2–4pm. – Dr. Chen" },
  { id: 7002, course: 103, title: "Midterm 2 review session", posted: new Date(Date.now() - 1.5 * day).toISOString(), message: "Review session next Monday 5–6:30pm in TH 331. Bring questions on the chain rule and implicit differentiation." },
];

const MODULES = {
  101: [
    { id: 1, name: "Week 8 – Membranes", items: [["Page", "Week 8: The Cell Membrane & Transport", "cell-membrane-and-transport"], ["File", "Lecture 15 slides: Membrane Transport (PDF)", 4001], ["Assignment", "Lab Report 4: Osmosis in Potato Cores", 1001], ["Quiz", "Quiz 5: Membranes & Transport", 1003]] },
    { id: 2, name: "Week 9 – Cellular Respiration", items: [["Page", "Week 9: Cellular Respiration", "cellular-respiration"]] },
  ],
  102: [
    { id: 3, name: "Unit 1 – Reconstruction", items: [["Page", "Unit 1: Reconstruction (1865–1877)", "reconstruction"], ["File", "Primary Source Analysis Guide (HAPP).docx", 4002], ["Discussion", "Discussion: Was Reconstruction a failure?", 1006], ["Assignment", "Primary Source Analysis: Freedmen's Bureau Letters", 1004]] },
    { id: 4, name: "Unit 2 – The Gilded Age", items: [["Page", "Unit 2: The Gilded Age & Industrialization", "gilded-age"]] },
  ],
  103: [{ id: 5, name: "Chapter 3 – Derivatives", items: [["Page", "Section 3.1–3.4: Differentiation Rules", "derivative-rules"], ["Assignment", "WebAssign 3.4: Chain Rule", 1002], ["Assignment", "Midterm 2 (in class)", 1005]] }],
};

const SYLLABI = {
  101: "BIOL 230 – Dr. Maya Chen. Grading: Labs 30%, Quizzes 20%, Midterms 30%, Final 20%. Late labs lose 10% per day. Office hours: Wed 2–4pm, HH 412.",
  102: "HIST 120 – Prof. Daniel Ortiz. Grading: Discussions 20%, Source analyses 30%, Midterm 20%, Final paper 30%. Office hours: Tue/Thu 11–12, HUM 210.",
  103: "MATH 226 – Dr. Aisha Rahman. Grading: WebAssign 15%, Quizzes 15%, Midterms 40%, Final 30%. One page of handwritten notes allowed on exams.",
};

// --- Professor side: Dr. Chen's BIOL 230 class -----------------------------------
// A professor demo signs in as the instructor of BIOL 230 and sees this roster.

const ROSTER = [
  { id: 7001, name: "Ana Ramirez", score: 92 },
  { id: 7002, name: "Kevin Nguyen", score: 41 },
  { id: 7003, name: "Destiny Brooks", score: 74 },
  { id: 7004, name: "Marcus Lee", score: 70 },
  { id: 7005, name: "Priya Shah", score: 90 },
  { id: 7006, name: "Jordan Ellis", score: 52 },
  { id: 7007, name: "Sofia Martinez", score: 97 },
  { id: 7008, name: "Tyler Chen", score: 66 },
];
const TEACH_ASSIGNMENTS = () => [
  { id: 1101, course: 101, name: "Lab Report 3: Enzyme Kinetics", due: at(-6 * day), points: 25, desc: "Report on the catalase lab: rate vs. substrate concentration, with a Michaelis-Menten style graph." },
  { id: 1102, course: 101, name: "Quiz 4: Cell Structure", due: at(-3 * day, 10, 0), points: 20, desc: "Organelles and their functions; prokaryotic vs. eukaryotic cells." },
  { id: 1001, name: "Lab Report 4: Osmosis in Potato Cores", due: at(1 * day), points: 25 },
  { id: 1003, name: "Quiz 5: Membranes & Transport", due: at(3 * day, 10, 0), points: 20 },
];
// [student, assignment, state, score]: state is graded | submitted | late | missing
const SUBMISSIONS = [
  [7001, 1101, "graded", 23], [7001, 1102, "graded", 18],
  [7002, 1101, "missing"], [7002, 1102, "missing"],
  [7003, 1101, "late"], [7003, 1102, "graded", 15],
  [7004, 1101, "graded", 20], [7004, 1102, "graded", 12],
  [7005, 1101, "submitted"], [7005, 1102, "graded", 19],
  [7006, 1101, "missing"], [7006, 1102, "graded", 9],
  [7007, 1101, "graded", 24], [7007, 1102, "graded", 20],
  [7008, 1101, "submitted"], [7008, 1102, "missing"],
];
const TEACHER_COURSE = 101;
const isTeacher = (userId) => users.get(userId)?.role === "teacher";

// --- OAuth2: a pretend school sign-in page ----------------------------------------

const codes = new Map(); // code -> { userId, name, role }

const page = (title, body) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><style>
body{margin:0;font:16px/1.5 system-ui,sans-serif;background:#0b3d5c;color:#1c1d29;display:grid;place-items:center;min-height:100vh;padding:16px;box-sizing:border-box}
.card{background:#fff;border-radius:14px;padding:28px;width:min(380px,100%);box-shadow:0 10px 40px rgb(0 0 0/30%)}
h1{font-size:20px;margin:0 0 4px}.sub{color:#667;margin:0 0 18px;font-size:14px}
label{display:block;font-weight:600;font-size:14px;margin:12px 0 4px}input{width:100%;box-sizing:border-box;padding:10px;border:1px solid #ccd;border-radius:8px;font:inherit}
button{margin-top:18px;width:100%;padding:12px;border:0;border-radius:8px;background:#0b3d5c;color:#fff;font-weight:700;font:inherit;cursor:pointer}
.badge{display:inline-block;background:#fde68a;color:#7c4a03;font-size:12px;font-weight:700;padding:2px 8px;border-radius:999px;margin-bottom:10px}
.fine{font-size:12.5px;color:#667;margin-top:14px}
</style></head><body><div class="card">${body}</div></body></html>`;

router.get("/login/oauth2/auth", (req, res) => {
  const { client_id, redirect_uri, state } = req.query;
  const teacher = req.query.login_hint === "teacher";
  if (client_id !== DEMO_CLIENT.clientId) return res.status(400).send("Unknown app.");
  const esc = (s) => String(s || "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  res.send(
    page(
      `${DEMO_SCHOOL} Sign-In`,
      `<span class="badge">DEMO</span><h1>${DEMO_SCHOOL} Single Sign-On</h1><p class="sub">This is a practice login page. Use any name; no password is checked.</p>
<form method="post" action="approve">
<input type="hidden" name="redirect_uri" value="${esc(redirect_uri)}"><input type="hidden" name="state" value="${esc(state)}"><input type="hidden" name="role" value="${teacher ? "teacher" : "student"}">
<p class="sub" style="margin:0">Signing in as a <b>${teacher ? "professor (BIOL 230 instructor)" : "student"}</b>.</p>
<label>Your name<input name="name" value="${teacher ? "Dr. Maya Chen" : "Jamie Student"}" required></label>
<label>Password<input type="password" value="demo-password" readonly></label>
<button type="submit">Sign in &amp; allow Cuss to access Canvas</button></form>
<p class="fine">At a real school this is your usual login page (with Duo/MFA). Cuss never sees your password.</p>`,
    ),
  );
});

router.post("/login/oauth2/approve", express.urlencoded({ extended: false }), (req, res) => {
  const { redirect_uri, state, name, role } = req.body;
  // Only send people back to this app's own callback.
  let target;
  try {
    target = new URL(redirect_uri);
  } catch {
    return res.status(400).send("Bad redirect.");
  }
  if (target.pathname !== "/auth/callback") return res.status(400).send("Bad redirect.");
  const code = crypto.randomBytes(16).toString("hex");
  // Each demo sign-in gets its own pretend student, so visitors don't share data.
  const userId = String(9_000_000_000 + crypto.randomInt(0, 999_999_999));
  codes.set(code, { userId, name: String(name || "Jamie Student").slice(0, 60), role: role === "teacher" ? "teacher" : "student" });
  setTimeout(() => codes.delete(code), 10 * 60e3).unref();
  target.searchParams.set("code", code);
  target.searchParams.set("state", state || "");
  res.redirect(target.href);
});

router.post("/login/oauth2/token", express.urlencoded({ extended: false }), (req, res) => {
  const { client_id, client_secret, grant_type, code, refresh_token } = req.body;
  if (client_id !== DEMO_CLIENT.clientId || client_secret !== DEMO_CLIENT.clientSecret) return res.status(401).json({ error: "invalid_client" });
  if (grant_type === "authorization_code" && codes.has(code)) {
    const { userId, name, role } = codes.get(code);
    codes.delete(code);
    users.set(userId, { name, role });
    return res.json({ access_token: `demo-${userId}-${Date.now()}`, refresh_token: `demo-refresh-${userId}`, expires_in: 3600, user: { id: Number(userId), name } });
  }
  if (grant_type === "refresh_token" && /^demo-refresh-\d+$/.test(refresh_token || "")) {
    const userId = refresh_token.split("-")[2];
    return res.json({ access_token: `demo-${userId}-${Date.now()}`, expires_in: 3600 });
  }
  res.status(400).json({ error: "invalid_grant" });
});

router.delete("/login/oauth2/token", (req, res) => res.json({}));

// --- REST API ---------------------------------------------------------------------------

const users = new Map(); // userId -> { name, role } (forgotten on restart)
const nameOf = (userId) => users.get(userId)?.name || "Demo Student";

router.use("/api/v1", (req, res, next) => {
  const m = (req.headers.authorization || "").match(/^Bearer demo-(\d+)-\d+$/);
  if (!m) return res.status(401).json({ errors: [{ message: "Invalid access token." }] });
  req.demoUserId = m[1];
  next();
});

const htmlUrl = (req, path) => `/demo-canvas${path}`;
const course = (id) => COURSES.find((c) => c.id === Number(id));

router.get("/api/v1/users/self/profile", (req, res) => {
  const name = nameOf(req.demoUserId);
  res.json({ id: Number(req.demoUserId), name, short_name: name });
});

router.get("/api/v1/courses", (req, res) =>
  res.json(
    isTeacher(req.demoUserId)
      ? COURSES.filter((c) => c.id === TEACHER_COURSE).map((c) => ({
          id: c.id,
          name: c.name,
          course_code: c.course_code,
          term: { name: "Fall 2026" },
          total_students: ROSTER.length,
          enrollments: [{ type: "teacher" }],
          teachers: TEACHERS[c.id].map((t) => ({ id: t.id, display_name: t.name })),
        }))
      : COURSES.map((c) => ({
      id: c.id,
      name: c.name,
      course_code: c.course_code,
      term: { name: "Fall 2026" },
      enrollments: [{ type: "student", computed_current_grade: c.grade, computed_current_score: c.score }],
      teachers: TEACHERS[c.id].map((t) => ({ id: t.id, display_name: t.name })),
    })),
  ),
);

router.get("/api/v1/courses/:id", (req, res) => {
  const c = course(req.params.id);
  if (!c) return res.status(404).json({ errors: [{ message: "Not found" }] });
  res.json({ id: c.id, name: c.name, course_code: c.course_code, syllabus_body: `<p>${SYLLABI[c.id]}</p>` });
});

router.get("/api/v1/planner/items", (req, res) => {
  const start = new Date(req.query.start_date || 0);
  const end = new Date(req.query.end_date || Date.now() + 365 * day);
  const teacher = isTeacher(req.demoUserId);
  res.json(
    ASSIGNMENTS()
      .filter((a) => !teacher || a.course === TEACHER_COURSE)
      .filter((a) => new Date(a.due) >= start && new Date(a.due) <= end)
      .map((a) => ({
        plannable_type: a.type,
        plannable_id: a.id,
        course_id: a.course,
        context_name: course(a.course).course_code,
        html_url: htmlUrl(req, `/courses/${a.course}/assignments/${a.id}`),
        plannable: { title: a.name, due_at: a.due, points_possible: a.points },
        plannable_date: a.due,
        submissions: teacher ? false : { submitted: Boolean(a.submitted), graded: false, missing: false, late: false },
      })),
  );
});

router.get("/api/v1/users/self/missing_submissions", (req, res) =>
  res.json(
    (isTeacher(req.demoUserId) ? [] : MISSING()).map((a) => ({
      id: a.id,
      course_id: a.course,
      course: { name: course(a.course).name },
      name: a.name,
      due_at: a.due,
      html_url: htmlUrl(req, `/courses/${a.course}/assignments/${a.id}`),
    })),
  ),
);

router.get("/api/v1/announcements", (req, res) => {
  const wanted = [].concat(req.query["context_codes[]"] || req.query.context_codes || []).map((c) => Number(String(c).replace("course_", "")));
  res.json(
    [...(posted.get(req.demoUserId) || []), ...ANNOUNCEMENTS()]
      .filter((a) => !wanted.length || wanted.includes(a.course))
      .map((a) => ({ id: a.id, context_code: `course_${a.course}`, title: a.title, posted_at: a.posted, message: `<p>${a.message}</p>`, author: { display_name: TEACHERS[a.course][0].name } })),
  );
});

router.get("/api/v1/courses/:id/modules", (req, res) =>
  res.json(
    (MODULES[req.params.id] || []).map((m) => ({
      id: m.id,
      name: m.name,
      items: m.items.map(([type, title, ref]) => ({ type, title, ...(type === "Page" ? { page_url: ref } : { content_id: ref }) })),
    })),
  ),
);

router.get("/api/v1/courses/:id/pages/:slug", (req, res) => {
  const p = PAGES[req.params.id]?.[req.params.slug];
  if (!p) return res.status(404).json({ errors: [{ message: "Page not found" }] });
  res.json({ url: req.params.slug, title: p.title, body: p.body });
});

function findAssignment(req, res) {
  const a = [...ASSIGNMENTS(), ...TEACH_ASSIGNMENTS().filter((t) => t.desc)].find((x) => x.id === Number(req.params.aid) && x.course === Number(req.params.id));
  if (!a) res.status(404).json({ errors: [{ message: "Not found" }] });
  return a;
}

router.get("/api/v1/courses/:id/assignments/:aid", (req, res) => {
  const a = findAssignment(req, res);
  if (a)
    res.json({
      id: a.id,
      name: a.name,
      due_at: a.due,
      points_possible: a.points,
      submission_types: ["online_upload"],
      description: `<p>${a.desc}</p>`,
      submission: a.submitted ? { workflow_state: "submitted", submitted_at: new Date().toISOString() } : { workflow_state: "unsubmitted" },
    });
});

router.get("/api/v1/courses/:id/discussion_topics/:aid", (req, res) => {
  const a = findAssignment(req, res);
  if (a) res.json({ id: a.id, title: a.name, message: `<p>${a.desc}</p>` });
});

router.get("/api/v1/courses/:id/quizzes/:aid", (req, res) => {
  const a = findAssignment(req, res);
  if (a) res.json({ id: a.id, title: a.name, due_at: a.due, question_count: 20, time_limit: 30, description: `<p>${a.desc}</p>` });
});

// Course files: a real lecture-slides PDF and a Word document.
const FILES = [
  { id: 4001, course: 101, name: "BIOL230_Lecture15_Membrane_Transport.pdf", file: "biol230-lecture15-membrane-transport.pdf", type: "application/pdf", daysAgo: 2 },
  { id: 4002, course: 102, name: "HIST120_Primary_Source_Guide_HAPP.docx", file: "hist120-primary-source-guide.docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", daysAgo: 6 },
];

function fileJson(req, f) {
  const size = fs.statSync(path.join(FILES_DIR, f.file)).size;
  // Like real Canvas, the download link carries its own verifier (no token needed).
  const base = `${req.protocol}://${req.get("host")}${req.baseUrl}`;
  return {
    id: f.id,
    display_name: f.name,
    filename: f.name,
    "content-type": f.type,
    size,
    updated_at: new Date(Date.now() - f.daysAgo * day).toISOString(),
    url: `${base}/files/${f.id}/download?verifier=demo`,
  };
}

router.get("/api/v1/courses/:id/files", (req, res) => res.json(FILES.filter((f) => f.course === Number(req.params.id)).map((f) => fileJson(req, f))));
router.get("/api/v1/courses/:id/files/:fid", (req, res) => {
  const f = FILES.find((x) => x.id === Number(req.params.fid) && x.course === Number(req.params.id));
  if (!f) return res.status(404).json({ errors: [{ message: "File not found" }] });
  res.json(fileJson(req, f));
});
router.get("/files/:fid/download", (req, res) => {
  const f = FILES.find((x) => x.id === Number(req.params.fid));
  if (!f || req.query.verifier !== "demo") return res.status(404).send("Not found");
  res.type(f.type).set("Content-Disposition", `inline; filename="${f.name}"`).sendFile(path.join(FILES_DIR, f.file));
});

router.get("/api/v1/courses/:id/users", (req, res) =>
  res.json((TEACHERS[req.params.id] || []).map((t) => ({ id: t.id, name: t.name, email: t.email, enrollments: [{ type: t.role }] }))),
);

// --- Professor tools: roster, submissions, grading queue, announcements --------

const posted = new Map(); // teacher userId -> announcements they posted in the demo
const notTeacher = (req, res) => {
  if (isTeacher(req.demoUserId) && Number(req.params.id) === TEACHER_COURSE) return false;
  res.status(401).json({ status: "unauthorized", errors: [{ message: "user not authorized to perform that action" }] });
  return true;
};

router.get("/api/v1/courses/:id/enrollments", (req, res) => {
  if (notTeacher(req, res)) return;
  res.json(ROSTER.map((s) => ({ type: "StudentEnrollment", user_id: s.id, user: { id: s.id, name: s.name, sortable_name: s.name }, grades: { current_score: s.score } })));
});

router.get("/api/v1/courses/:id/students/submissions", (req, res) => {
  if (notTeacher(req, res)) return;
  const due = Object.fromEntries(TEACH_ASSIGNMENTS().map((a) => [a.id, a.due]));
  res.json(
    SUBMISSIONS.map(([user_id, assignment_id, state, score]) => ({
      user_id,
      assignment_id,
      workflow_state: state === "graded" ? "graded" : state === "missing" ? "unsubmitted" : "submitted",
      missing: state === "missing",
      late: state === "late",
      score: score ?? null,
      submitted_at: state === "missing" ? null : due[assignment_id],
    })),
  );
});

router.get("/api/v1/courses/:id/assignments", (req, res) => {
  if (notTeacher(req, res)) return;
  const waiting = (aid) => SUBMISSIONS.filter(([, a, st]) => a === aid && (st === "submitted" || st === "late")).length;
  res.json(TEACH_ASSIGNMENTS().map((a) => ({ id: a.id, name: a.name, due_at: a.due, points_possible: a.points, needs_grading_count: waiting(a.id), html_url: htmlUrl(req, `/courses/101/assignments/${a.id}`) })));
});

router.post("/api/v1/courses/:id/discussion_topics", express.json(), (req, res) => {
  if (notTeacher(req, res)) return;
  const list = posted.get(req.demoUserId) || [];
  const a = { id: 7100 + list.length, course: TEACHER_COURSE, title: String(req.body?.title || "Announcement"), message: String(req.body?.message || ""), posted: new Date().toISOString() };
  list.unshift(a);
  posted.set(req.demoUserId, list);
  res.json({ id: a.id, title: a.title, is_announcement: true, posted_at: a.posted });
});

// --- Inbox: sample messages, and professors who write back -------------------
// Each demo student gets their own inbox. When the student messages a
// professor, the professor "replies" about 15 seconds later so the whole
// email loop can be shown live. Nothing leaves the demo.

const inboxes = new Map(); // userId -> { convos, nextId }
const STAFF = Object.fromEntries(Object.values(TEACHERS).flat().map((t) => [t.id, t]));
const STUDENTS = Object.fromEntries(ROSTER.map((s) => [s.id, s]));
const PEOPLE = { ...STAFF, ...STUDENTS };
const COURSE_OF = { ...Object.fromEntries(Object.entries(TEACHERS).flatMap(([cid, ts]) => ts.map((t) => [t.id, Number(cid)]))), ...Object.fromEntries(ROSTER.map((s) => [s.id, TEACHER_COURSE])) };
const REPLY_LINES = {
  501: "Stop by Wednesday between 2 and 4pm and bring your graph. We can go over the isotonic point together.",
  502: "Come to lab office hours Thursday at 3 and I'll take a look with you.",
  503: "I've reopened the reading quiz for you until Friday at 5pm. Good luck!",
  504: "See you at the review session on Monday, and bring any chain rule questions.",
};

const firstName = (userId) => (users.get(userId)?.name || "there").split(" ")[0];

// A professor's inbox: questions from students in BIOL 230.
function teacherInbox(me, ago) {
  return {
    nextId: 3100,
    convos: [
      {
        id: 3011, course: 101, subject: "Lab Report 3: I'm behind", workflow_state: "unread", participants: [me, 7002],
        messages: [{ id: 11, author_id: 7002, created_at: ago(5 * hour), body: "Hi Dr. Chen,\n\nI work nights at my job and fell behind on Lab Report 3. Is there any way I could still turn it in this week? I really don't want to fail the lab portion.\n\nKevin Nguyen" }],
      },
      {
        id: 3012, course: 101, subject: "Quiz 5 time conflict", workflow_state: "unread", participants: [me, 7005],
        messages: [{ id: 12, author_id: 7005, created_at: ago(9 * hour), body: "Dr. Chen,\n\nI have a medical appointment during Quiz 5 on Tuesday morning. Could I take it at a different time?\n\nThank you,\nPriya Shah" }],
      },
      {
        id: 3013, course: 101, subject: "Isotonic point question", workflow_state: "read", participants: [me, 7007],
        messages: [
          { id: 13, author_id: 7007, created_at: ago(1.5 * day), body: "Hi Dr. Chen, for Lab 4, do we estimate the isotonic point from where the line crosses 0% mass change?" },
          { id: 14, author_id: me, created_at: ago(1.2 * day), body: "Yes, exactly: interpolate where your best-fit line crosses zero." },
        ],
      },
    ],
  };
}

function inbox(userId) {
  if (inboxes.has(userId)) return inboxes.get(userId);
  const me = Number(userId);
  const ago = (ms) => new Date(Date.now() - ms).toISOString();
  const name = firstName(userId);
  if (isTeacher(userId)) {
    const box = teacherInbox(me, ago);
    inboxes.set(userId, box);
    return box;
  }
  const box = {
    nextId: 3100,
    convos: [
      {
        id: 3001, course: 102, subject: "Gilded Age reading quiz", workflow_state: "unread", participants: [me, 503],
        messages: [{ id: 1, author_id: 503, created_at: ago(3 * hour), body: `Hi ${name},\n\nI noticed you haven't taken the Gilded Age reading quiz yet. I can reopen it for you until Friday at 5pm. Just let me know if you'd like that.\n\nBest,\nProf. Ortiz` }],
      },
      {
        id: 3002, course: 101, subject: "Lab 4: graph formatting", workflow_state: "unread", participants: [me, 502],
        messages: [{ id: 2, author_id: 502, created_at: ago(20 * hour), body: "Hi everyone, quick reminder for Lab Report 4: your % mass change graph needs labeled axes with units and a best-fit line. Points come off for missing labels.\n\nJordan (TA)" }],
      },
      {
        id: 3003, course: 103, subject: "Midterm 2 notes sheet", workflow_state: "read", participants: [me, 504],
        messages: [
          { id: 3, author_id: me, created_at: ago(2.2 * day), body: "Hi Dr. Rahman, can our notes sheet for Midterm 2 be double-sided? Thanks!" },
          { id: 4, author_id: 504, created_at: ago(2 * day), body: `Hi ${name}, yes, one page double-sided is fine. Handwritten only.\n\nDr. Rahman` },
        ],
      },
    ],
  };
  inboxes.set(userId, box);
  return box;
}

function convoJson(c, userId, withMessages = false) {
  const last = c.messages[c.messages.length - 1];
  const people = c.participants.map((id) => ({ id, name: id === Number(userId) ? nameOf(userId) : PEOPLE[id]?.name || "Someone" }));
  return {
    id: c.id,
    subject: c.subject,
    workflow_state: c.workflow_state,
    last_message: last?.body,
    last_message_at: last?.created_at,
    message_count: c.messages.length,
    participants: people,
    context_code: `course_${c.course}`,
    context_name: course(c.course)?.name,
    ...(withMessages ? { messages: [...c.messages].reverse() } : {}),
  };
}

// The other person writes back ~15 s later: a professor to a student, or a
// student to a professor.
function scheduleProfessorReply(userId, c) {
  const otherId = c.participants.find((id) => PEOPLE[id] && id !== Number(userId));
  if (!otherId || (c.autoReplies || 0) >= 2) return;
  c.autoReplies = (c.autoReplies || 0) + 1;
  setTimeout(() => {
    const p = PEOPLE[otherId];
    const body = STUDENTS[otherId]
      ? `Thank you so much, Dr. ${nameOf(userId).split(" ").at(-1)}! ${c.autoReplies > 1 ? "Got it." : "I'll take care of it this week."}\n\n${p.name}`
      : `Hi ${firstName(userId)},\n\nThanks for your message! ${c.autoReplies > 1 ? "Sounds good, see you then!" : REPLY_LINES[otherId] || "Thanks for reaching out, that works for me."}\n\nBest,\n${p.name.replace(/ \(TA\)$/, "")}`;
    c.messages.push({ id: Date.now(), author_id: otherId, created_at: new Date().toISOString(), body });
    c.workflow_state = "unread";
  }, 15_000).unref();
}

router.get("/api/v1/conversations", (req, res) => {
  const box = inbox(req.demoUserId);
  const me = Number(req.demoUserId);
  const scope = req.query.scope || "inbox";
  let list = box.convos;
  if (scope === "unread") list = list.filter((c) => c.workflow_state === "unread");
  if (scope === "sent") list = list.filter((c) => c.messages.some((m) => m.author_id === me));
  if (scope === "inbox") list = list.filter((c) => c.messages.some((m) => m.author_id !== me));
  const sorted = [...list].sort((a, b) => new Date(b.messages.at(-1).created_at) - new Date(a.messages.at(-1).created_at));
  res.json(sorted.slice(0, Number(req.query.per_page) || 20).map((c) => convoJson(c, req.demoUserId)));
});

router.get("/api/v1/conversations/:cid", (req, res) => {
  const c = inbox(req.demoUserId).convos.find((x) => x.id === Number(req.params.cid));
  if (!c) return res.status(404).json({ errors: [{ message: "Conversation not found" }] });
  c.workflow_state = "read";
  res.json(convoJson(c, req.demoUserId, true));
});

router.post("/api/v1/conversations", express.json(), (req, res) => {
  const box = inbox(req.demoUserId);
  const me = Number(req.demoUserId);
  const allowed = isTeacher(req.demoUserId) ? STUDENTS : STAFF;
  const to = [].concat(req.body?.recipients || []).map(Number).filter((id) => allowed[id]);
  if (!to.length) return res.status(400).json({ errors: [{ message: "Pick a recipient." }] });
  const courseId = Number(String(req.body?.context_code || "").replace("course_", "")) || COURSE_OF[to[0]];
  // Like Canvas with group_conversation=false: one private conversation per recipient.
  const created = to.map((id) => {
    const c = {
      id: box.nextId++, course: courseId, subject: String(req.body?.subject || "(no subject)"), workflow_state: "read", participants: [me, id],
      messages: [{ id: Date.now(), author_id: me, created_at: new Date().toISOString(), body: String(req.body?.body || "") }],
    };
    box.convos.push(c);
    scheduleProfessorReply(req.demoUserId, c);
    return convoJson(c, req.demoUserId);
  });
  res.json(created);
});

router.post("/api/v1/conversations/:cid/add_message", express.json(), (req, res) => {
  const c = inbox(req.demoUserId).convos.find((x) => x.id === Number(req.params.cid));
  if (!c) return res.status(404).json({ errors: [{ message: "Conversation not found" }] });
  c.messages.push({ id: Date.now(), author_id: Number(req.demoUserId), created_at: new Date().toISOString(), body: String(req.body?.body || "") });
  c.workflow_state = "read";
  scheduleProfessorReply(req.demoUserId, c);
  res.json(convoJson(c, req.demoUserId, true));
});

// Course links in the demo open a simple placeholder instead of real Canvas.
router.get("/courses/*", (req, res) =>
  res.send(page("Demo Canvas", `<span class="badge">DEMO</span><h1>This is the demo</h1><p class="sub">At a real school, this link opens the assignment in Canvas.</p>`)),
);

export const demoCanvasRouter = router;
