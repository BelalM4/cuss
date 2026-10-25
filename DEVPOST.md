# Devpost submission: Cuss (Cal Hacks 13.0)

Copy each section into the matching Devpost field. Replace the `[brackets]` with true details from your own experience.
**Deadline: Sunday 9:00 AM.** Submit a draft Saturday night, then keep editing. Add every teammate on Devpost.

## Prize tracks to select
- **Anthropic: Claude for Public Benefit** (see the track checklist right below)
- **Best People-First Hack**
- **Best Solo Hack** (only if you're competing alone)
- **Microsoft: Built for the Real World** (production-minded AI agent for productivity)

---

## Project name
Cuss

## Tagline (short description)
Your semester, handled: an AI assistant for first-gen, working, commuting and transfer students at SF State that reads your Canvas, tracks every deadline, handles your professor emails and inbox, and quizzes you on your actual course notes, by voice or text.

## Thumbnail / gallery
Use `public/icons/logo-512.png` as the thumbnail. Add screenshots from **your own live run**: the Today panel, the live step bubbles, a quiz, the email card and voice mode.

## Claude for Public Benefit: how Cuss meets each criterion
1. **Named community:** first-generation, working, commuting and transfer students at SF State: students who often don't have family who've been through college to explain how it works, who squeeze classes between jobs and long commutes, or who just transferred in and are learning a new campus's Canvas setup mid-degree. They have the least time to dig through five differently organized courses, and the most to lose from one missed deadline.
2. **A real problem we've lived:** [Your story, one or two sentences: what you missed in Canvas, or the professor email you put off.] [Optional: "We also talked to N classmates who…" only if you actually did.]
3. **A working, high-impact product, and how we measure impact:** Cuss is fully working: real Canvas OAuth2 sign-in, a Claude agent with live Canvas tools, inbox, reminders, study tools and voice. Impact is measured inside the product (live at `/impact`, anonymous):
   - **Missing assignments over time**, snapshotted daily from Canvas for each student; the goal is for it to drop after joining.
   - **Deadline reminders delivered** before due dates, and on-time submission afterwards.
   - **Emails and replies to professors actually sent**, a proxy for asking for help instead of staying stuck.
   - **Practice quizzes taken and scores** from real course material.
   - **Pilot plan:** 20–30 students from our community at SF State for 4 weeks, with before/after surveys (deadline stress, confidence emailing professors) and a before/after comparison of missing-assignment counts.
4. **Thoughtful use of Claude:** Claude runs the product. It's an agent that decides which Canvas data to fetch, reads course PDFs natively, writes emails in the student's voice, and builds quizzes from the student's own notes, with every step shown. Claude also built it: Cuss was developed with **Claude Code** during the hackathon. See "Where Claude could go wrong" below for the risks we designed around.

## Links
- **Try it:** [your Render link, e.g. https://cuss.onrender.com] (click "Try the live demo", no account needed)
- **Code:** https://github.com/BelalM4/cuss
- **Impact dashboard:** [your Render link]/impact
- **Demo video:** [YouTube link]

## Built with (tags)
`node.js` `express` `javascript` `html` `css` `canvas-lms` `canvas-api` `oauth2` `claude` `anthropic` `web-speech-api` `render`

---

## Inspiration
**Who it's for:** first-generation, working, commuting and transfer students at SF State. We juggle jobs, commutes and four or five Canvas courses that are each organized differently, often without anyone at home who's done college before. [Add one true sentence about your own experience, e.g. a missed quiz or a professor email you put off for a week.]

Every student we know has missed something that was sitting in Canvas the whole time: a deadline buried in a module, an announcement that moved a quiz, a professor's message offering a second chance. Canvas has everything a student needs, but it's a filing cabinet, not an assistant. Meanwhile, students juggle five courses, each organized differently, and writing a "professional" email to a professor can feel harder than the assignment itself.

We wanted an assistant that already knows your semester: one you can just ask, "What should I work on tonight?"

## What it does
Students sign in with their school's normal Canvas login, and Cuss takes it from there:

- **Never miss a deadline.** A "Today" dashboard shows what's due this week, missing work and grades. Cuss sends reminders days and hours before anything unsubmitted is due, and exports every deadline to Google/Apple/Outlook Calendar.
- **Your inbox, handled.** Cuss reads your Canvas Inbox, summarizes what professors need from you, and drafts replies. You get an alert the moment a professor writes back.
- **Emails to professors.** Ask "email my bio professor about office hours" and Cuss finds the right instructor and writes a polite, specific message. Nothing is sent until you press Send.
- **Study from your real notes.** Cuss opens your actual course pages, PDFs and syllabus, explains the material, and builds interactive flashcards and practice quizzes from them, instead of from random internet content.
- **Talk to it.** A full-screen voice mode lets you have a hands-free conversation, like a friend who actually read the syllabus.
- **It remembers you and can work on its own.** Chats are saved, Cuss keeps long-term notes (your major, how you like to study), and "independent mode" checks Canvas every morning to write your daily briefing and study plan.
- **Live agent transparency.** As Cuss works, you see each step ("Checked deadlines ✓", "Read 'Week 8: Cell Membrane' ✓"), so students can trust where answers come from.

Built for academic integrity: Cuss helps students learn and plan. It won't do graded work or answer live quizzes.

It also installs like an app: on iPhone or Android, open the link and tap **Add to Home Screen**.

## Where Claude could go wrong (and what we did about it)
- **Hallucinated deadlines or facts:** Cuss is told never to answer from memory. It must call Canvas tools, and every tool call is shown to the student, so they can see where each answer came from.
- **A wrong email to a professor:** every email and reply is a draft until the student presses Send. Auto-send is an opt-in with a warning, and the daily "independent mode" can draft but never send.
- **Academic integrity:** Claude is instructed not to write graded work or answer live quizzes and exams; it explains, quizzes and plans instead.
- **Privacy:** Claude sees only what the student can already see in Canvas, and students can delete their data and revoke access at any time.
- **Cost and abuse:** per-student and global daily message caps.

## How we built it
- **Backend:** Node.js + Express. Students authenticate with **Canvas OAuth2**, which redirects to the school's own SSO page, so Cuss never sees a password. Tokens refresh automatically, and each student's data is stored separately.
- **Built with Claude Code** during Cal Hacks: planning, coding, testing and the UI.
- **AI agent:** **Claude (Anthropic)** with tool use. We gave the model tools that wrap the **Canvas REST API**: planner items, missing submissions, announcements, modules, pages, files (including PDFs read natively), instructors, and Canvas Inbox conversations. The model decides which tools to call, and we stream every step to the browser live.
- **Interactive cards:** tools like `make_quiz`, `make_flashcards`, `draft_email` and `draft_reply` return structured data that the frontend renders as quiz, flashcard and email UIs, rather than walls of text.
- **Voice:** the browser's **Web Speech API** handles speech recognition and text-to-speech. Voice turns use a faster, lower-effort model setting so conversation feels natural.
- **Impact measurement:** per-student counters and daily missing-work snapshots, with an anonymous public dashboard at `/impact`.
- **Background jobs:** a scheduler checks deadlines, new announcements and new inbox messages for each student and queues notifications. Independent mode runs a daily agent "check-in."
- **Demo University:** a built-in mock Canvas that speaks the same OAuth2 and REST API as real Canvas, including professors who reply to your messages, so anyone can try the full experience without a school account.
- **Frontend:** vanilla JS, HTML and CSS (no framework): streaming markdown, animations, dark/light themes, and an iOS-style phone layout with a tab bar. It's an installable PWA, and a Capacitor project is set up for App Store and Google Play builds.
- **Hosting:** Render (one-click `render.yaml`) with a QR-code share page for judges.

## Challenges we ran into
- **Schools lock down Canvas access.** Our own school disables personal API tokens, so we built proper OAuth2 sign-in, plus a full mock Canvas, so the product works end to end before official approval.
- **Making an agent feel fast.** Multi-step tool use can feel slow, so we stream text and show each tool step live, run independent tools in parallel, and tune the model's effort for voice versus typed questions.
- **Safety with real email.** An AI that can message professors needs guardrails: every email and reply is a draft until the student approves it, and auto-send is a clearly labeled opt-in.
- **Saving conversations correctly.** Persisting the full agent history (tool calls, results and UI cards) so chats can be reopened and continued, without the steps getting out of order.
- **Voice in the browser.** Handling speech recognition and speech synthesis quirks across browsers (missing end events, long-utterance cutoffs).

## Accomplishments that we're proud of
- A complete loop in one product: deadlines → study → email → professor replies → alerts.
- Real Canvas OAuth2 integration that works with any school's SSO.
- Quizzes and flashcards generated from the student's *actual* course material, with the source shown.
- A voice mode that makes a study assistant feel like a conversation.
- An AI that shows its work: every step is visible.

## What we learned
- How Canvas's OAuth2, planner, modules and conversations APIs fit together, and why schools gate API access.
- How to design tools for an LLM agent so its outputs become rich UI, not just text.
- That trust matters most for student-facing AI: showing the steps, citing the course material, and never sending anything without consent.

## What's next for Cuss
- **Official approval at San Francisco State University** (we've [applied / are applying] for a Canvas developer key), then a pilot with students.
- App Store and Google Play release with native push notifications (the Capacitor project is ready).
- Google Calendar and school email (Gmail/Outlook) integration.
- Study groups: shared flashcard decks and quiz battles for the same course.
- Expansion to other Canvas schools: any school can enable Cuss with one approval.

---

## Demo video (optional but recommended)
Record your 2-minute table pitch from `DEMO-SCRIPT.md` with ⌘ + Shift + 5, upload it to YouTube (Unlisted), and paste the link. It doubles as your backup if the Wi-Fi fails during judging.
