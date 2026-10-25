# Cuss: Cal Hacks 13.0 table pitch (2 minutes, live demo)

Judges walk up to your table between **10:30 AM and 12:30 PM Sunday**. You get about two minutes, and they want to see it **working live**. The whole team must be at the table.

## Saturday night / Sunday morning checklist
- [ ] **Devpost submitted before 9:00 AM Sunday.** Submit a draft tonight and keep editing (see `DEVPOST.md`). Add your teammates.
- [ ] Hosted link works (Render). Open it at **10:15 AM** so the free server is awake.
- [ ] Laptop charged. Chrome open at the app, full screen (⌘ + Shift + F), zoomed in once (⌘ +).
- [ ] Phone with the **QR code** (`your-link/share`) ready to hand to judges, or a second laptop tab with it.
- [ ] **Settings → Start the demo over** right before each judge arrives, signed in as yourself.
- [ ] Microphone already allowed (click the mic once beforehand).
- [ ] Backup video of a perfect run on your phone, in case the venue Wi-Fi ("Cal Hacks 13.0") fails.

---

## The 2-minute pitch

**0:00 – The problem (15 s)**
> "I'm Belal. I built Cuss for first-gen, working, commuting and transfer students at SF State, people like me with the least time to dig through Canvas. Every semester I juggle five courses, and every one is set up differently. Last month I missed [a real example: a quiz, an announcement, a professor's email] that was sitting in Canvas the whole time. Canvas has everything, but it's a filing cabinet, not an assistant."

**0:15 – What Cuss is (10 s)**
> "Cuss is an AI assistant that signs in to your Canvas and handles your semester. Here it is, live."

**0:25 – What's due + live steps (20 s)**
Click **What's due?** and point at the step bubbles as they appear.
> "It's checking my deadlines and reading my professors' announcements right now. You can see every step. And it caught that my quiz was moved."

**0:45 – Inbox loop (30 s)**
Under **Messages**, click **Prof. Ortiz**.
> "My history professor offered to reopen a quiz I missed. Cuss summarized it and drafted a reply. Nothing sends until I approve it."

Press **Send reply**.
> "Professors usually answer, and Cuss alerts me the moment they do."
(The demo professor replies in about 15 seconds. Keep talking; the pop-up will land during the next step.)

**1:15 – Study from real notes (20 s)**
Type: **"Quiz me for Quiz 5"**.
> "It opened my actual biology notes from Canvas, not the internet, and made a quiz from them."
Answer one question.

**1:35 – Voice (15 s)**
Tap **Talk** (or the sound-wave button) and ask: **"What should I work on tonight?"**

**1:50 – Impact + close (10 s)**
> "We measure impact inside the app: missing assignments over time, reminders delivered, emails actually sent, and quiz scores. It's all on our live impact page."
> "Students sign in with their real school login. It's ready for SF State as soon as the school approves it, and it works at any Canvas school. Scan this to try it yourself."
Hand over the QR code.

---

## For the Anthropic "Claude for Public Benefit" track
Judges look for: (1) a **named community**: say it exactly: "first-gen, working, commuting and transfer students at SF State"; (2) a **real problem you've lived**: tell your story; (3) a **working product and how you measure impact**: show `/impact`; (4) **thoughtful use of Claude**: the live steps, plus the fact that it was built with Claude Code.

### Know where Claude can go wrong
Judges will ask. Have these answers ready:
- **Wrong or made-up deadlines:** Cuss never answers from memory. It calls Canvas tools every time and shows each step, so students can see where an answer came from. Dates come straight from the Canvas planner.
- **Sending the wrong email to a professor:** every email and reply is a draft the student must approve. Auto-send is an opt-in with a warning.
- **Academic dishonesty:** the system prompt tells Claude not to write graded work or answer live quizzes; it teaches, quizzes and plans instead.
- **Privacy:** Claude only sees what the student already sees in Canvas. Students can delete their data and revoke access anytime.
- **Running autonomously:** independent mode can read and draft, but never sends messages on its own.

## Other likely questions
- **Did you build this at Cal Hacks?** Yes, it was started at the event. The GitHub commit history shows it.
- **How does it connect to Canvas?** Canvas's official OAuth2 sign-in through the school's SSO, the same way approved apps connect. Each school approves Cuss once, and then any student can log in.
- **What's real and what's simulated?** The AI, the agent loop, the Canvas API integration and the sign-in are real. "Demo University" is a mock Canvas with sample classes, so we can demo without exposing a real student's data; it speaks the same API as real Canvas.
- **What's next?** An SF State pilot, App Store and Google Play apps with push notifications, and calendar sync.
