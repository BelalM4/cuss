# Cuss for Canvas 🎓

A personal AI assistant for school. Students click **"Log in with SFSU Canvas"**, sign in on the usual school login page, and Cuss:

- **Reminds them about due dates.** It alerts them 3 days, 1 day and 3 hours before anything unsubmitted is due (adjustable) and when there's a new announcement. A one-click calendar export covers Google, Apple and Outlook.
- **Writes emails to professors.** It finds the right instructor or TA, writes a polite message, and sends it through Canvas Inbox when the student presses **Send** (or says *"send it"*).
- **Helps them study.** It reads their actual course pages, files (PDFs too), assignments and syllabus, explains topics, and makes **flashcards** and **practice quizzes**.
- **Remembers them.** Saved chats appear in the sidebar, and long-term notes about the student (major, study style…) carry across chats.
- **Can work independently.** In *Independent mode*, Cuss checks Canvas every morning by itself and writes a daily briefing and study plan.
- **Talks.** Students can tap the 🎤 mic and speak, and turn on **Voice replies** for hands-free conversation.

**Try it without a school account:** click **▶ Try the demo** on the login page. You sign in on a practice login page for "Demo University" and get a sample student with real-looking classes, deadlines, professors and course notes. The AI is real, so chatting, quizzes, flashcards and emails all work, but demo emails go nowhere. This is handy for showing Cuss to schools.

Each student's chats, notes and settings are private to them. Students can log out, or delete their data and disconnect at any time (Settings → *Delete my data*).

---

## Setting it up (for the person running the app)

Students don't install anything. One person runs the app, and everyone else just logs in.

### 1. Install and configure
1. Install Node.js 20.12 or newer from <https://nodejs.org>.
2. In the app folder, copy `.env.example` to a new file named `.env` and fill in:
   - `CANVAS_URL`: `https://sfsu.instructure.com`
   - `ANTHROPIC_API_KEY`: from <https://console.anthropic.com/settings/keys> (pay-as-you-go; all students' chats use this key, and `DAILY_MESSAGE_LIMIT` caps each student's daily use)
3. In Terminal, from the app folder: `npm install`, then `npm start`. Open <http://localhost:3000>.

### 2. Turn on "Log in with Canvas" (needs your school's approval)
Canvas only lets an app use the school's login page once the school's Canvas admins register it and issue a **Developer Key**. Students can't create one themselves.

1. Send the request in **`ADMIN-REQUEST.md`** to your school's Canvas support (fill in the brackets).
2. When they reply with a **Client ID** and **Client Secret**, put them in `.env` as `CANVAS_CLIENT_ID` and `CANVAS_CLIENT_SECRET`. If they set up scopes, also paste those into `CANVAS_SCOPES`.
3. Restart the app. The terminal says **"✓ Canvas SSO login is on"**, and the login button works.

Until then, the login page shows **"Use a Canvas access token instead"**. That works at schools that allow personal tokens, or with a token an SFSU admin generates for you.

### 3. Share it with other students (hosting)
Running it on your laptop lets you use it yourself. For other students, it needs to run on a server with a public `https://` address, for example Render, Railway or Fly.io:
- Set the same values as your `.env` in the host's "environment variables" settings, plus `HOST=0.0.0.0` and `PUBLIC_URL=https://your-app-address`.
- Give the app a **persistent disk** for the `data/` folder (or set `DATA_DIR` to one). That's where logins, chats and memory are saved.
- Ask the Canvas admins to add `https://your-app-address/auth/callback` as a redirect URI on the Developer Key.
- Expect your school to ask about student-data privacy (FERPA). `ADMIN-REQUEST.md` explains how data is handled.

---

## Using it (for students)
1. Open the app and click **Log in with SFSU Canvas**.
2. Sign in as usual, and click **Authorize** when Canvas asks.
3. Click **Enable reminders** in the sidebar.

Things to try:
- "What's due this week? Anything missing?"
- "Email my biology professor that I'll miss Thursday's lab and ask how to make it up."
- "Quiz me on chapter 4 from my psych class."
- "Make flashcards from this week's module in Chem."
- "Remind me tomorrow at 6pm to start my essay."
- "Remember that I'm a nursing major and I like practice questions."

> 🎤 Voice input works best in **Chrome or Edge**. Allow microphone access when asked.

### Settings
| Setting | What it does |
|---|---|
| Remind me before due dates | Hours before a deadline to get a reminder (default `72, 24, 3`). |
| Independent mode | Daily check-in at your chosen time, saved as a ☀️ *Daily briefing* chat. **Run a briefing now** tries it out right away. |
| Send emails without asking me | **Off (recommended):** you review every email and press Send. **On:** Cuss sends as soon as you ask. Independent check-ins never send emails. |
| What Cuss remembers | View, add or delete Cuss's notes about you. |
| Delete my data & disconnect | Erases your chats, notes and settings and revokes Cuss's Canvas access. |

## Troubleshooting
- **The login page says Canvas login isn't switched on:** the Developer Key isn't in `.env` yet (see step 2).
- **"Canvas didn't allow that":** your professor may have restricted that page or file. If it happens everywhere, log out and back in.
- **No reminders:** click *Enable reminders*, and keep the app running.

## How it works
- `server.js`: web server, login routes, API.
- `lib/auth.js`: Canvas OAuth2 sign-in (school SSO), automatic token refresh, sessions.
- `lib/store.js`: per-student storage under `data/users/<canvas id>/`.
- `lib/canvas.js`: Canvas REST API (planner, courses, modules, pages, files, inbox).
- `lib/agent.js`: the AI assistant (Claude) and its tools.
- `lib/chats.js`: saved chats, email drafts, long-term memory.
- `lib/reminders.js`: background reminders, announcements, independent-mode briefings, calendar feed.
- `public/`: the web app (`login.html` landing page, chat with live AI steps, Today panel, voice mode, flashcards, quizzes).

Presenting Cuss? See **`DEMO-SCRIPT.md`** for a 3-minute walkthrough and a pre-demo checklist.
