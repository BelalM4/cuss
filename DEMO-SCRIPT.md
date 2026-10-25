# Cuss: Cal Hacks 13.0 table pitch (2 minutes, live demo)

Judges walk up to your table between **10:30 AM and 12:30 PM Sunday**. You get about two minutes, and they want to see it **working live**. The whole team must be at the table.

## Saturday night / Sunday morning checklist
- [ ] **Devpost submitted before 9:00 AM Sunday.** Submit a draft tonight and keep editing (see `DEVPOST.md`). Add your teammates.
- [ ] Hosted link works (Render). Open it at **10:15 AM** so the free server is awake.
- [ ] Laptop charged. Chrome open at the app, full screen (⌘ + Shift + F), zoomed in once (⌘ +).
- [ ] Phone with the **QR code** (`cuss.onrender.com/share`) ready to hand to judges, or a second laptop tab with it.
- [ ] **Settings → Start the demo over** right before each judge arrives, signed in as yourself.
- [ ] Microphone already allowed (click the mic once beforehand).
- [ ] Optional: on your phone, **Settings → Add to iPhone Calendar** once, so you can show deadlines and readings in your real iPhone Calendar if a judge asks.
- [ ] Demo classes already know when they meet (BIOL 230 Mon/Wed, HIST 120 Tue/Thu, MATH 226 Mon/Wed/Fri), so "next class" works right after **Start the demo over**.
- [ ] Backup video of a perfect run on your phone, in case the venue Wi-Fi ("Cal Hacks 13.0") fails.

---

## The 2-minute pitch

**0:00 – The problem (15 s)**
> "I'm Belal, a student at SF State. Every student juggles four or five Canvas courses that move fast: deadlines in one place, announcements in another, readings the professor only mentions out loud. Canvas has everything, but it's a filing cabinet, not an assistant. For me it's even harder because I have ADHD, so I built Cuss, for every student and teacher."

**0:15 – What Cuss is (5 s)**
> "Cuss is an AI assistant that signs in to your Canvas and handles your semester. Here it is, live."

One flow, start to finish:

**0:20 – "What needs my attention?" (25 s)**
Type: **"What needs my attention this week?"** Point at the step bubbles as they appear.
> "It's checking my deadlines, announcements and messages right now, and I can see every step. It caught that my biology quiz moved, and that my history professor offered to reopen a quiz."

**0:45 – Explain a deadline (20 s)**
Type: **"What do I need to know for Quiz 5?"**
> "Instead of guessing, it opens my professor's actual Lecture 15 slides from Canvas and tells me what's on the quiz."

**1:05 – Quiz me from the real lecture notes (25 s)**
Type: **"Quiz me on it."** Answer one question.
> "The questions come from my professor's real PDF, diagrams and all, not random internet content."

**1:30 – Draft a professor email (20 s)**
Type: **"Email Dr. Chen and ask if I can come to office hours before the quiz."**
> "It finds my professor and writes a polite, specific email. Nothing sends until I review it and press Send."
Don't press Send unless a judge asks.

**1:50 – Close (10 s)**
> "We measure impact inside the app: missing assignments over time, reminders, emails actually sent, and quiz scores. It's ready for SF State as soon as the school approves it, and it works at any Canvas school. Scan this to try it yourself."
Hand over the QR code.

### If there's time, or a judge asks
- **Professor mode:** Settings → Log out → **Professor demo** → "Who's falling behind?" → "Draft an announcement about Quiz 5." *"Same Canvas login; professors can reach struggling students sooner."*
- **Due next class:** "The Wilson speech reading is due next class, remind me tomorrow night" → the card's **Add to Calendar** and **Add to Reminders**, then **Open class**.
- **Inbox:** under Messages click **Prof. Ortiz** → reply draft → **Send reply**. The demo professor answers about 15 seconds later; Cuss checks for new replies about every minute, so the alert can take a minute or so.
- **Voice:** tap **Talk**, ask "What should I work on tonight?"

---

## For the Anthropic "Claude for Public Benefit" track
Judges look for: (1) a **named community**: for this track say: "Cuss is for every student, and the community I'm starting with is students with ADHD and other disabilities, because I'm one of them"; (2) a **real problem you've lived**: tell your story; (3) a **working product and how you measure impact**: show `/impact`; (4) **thoughtful use of Claude**: the live steps, plus the fact that it was built with Claude Code.

### Know where Claude can go wrong
Judges will ask. Have these answers ready:
- **Wrong or made-up deadlines:** Cuss never answers from memory. It calls Canvas tools every time and shows each step, so students can see where an answer came from. Dates come straight from the Canvas planner.
- **Sending the wrong email to a professor:** every email and reply is a draft the student must approve. Auto-send is an opt-in with a warning.
- **Academic dishonesty:** the system prompt tells Claude not to write graded work or answer live quizzes; it teaches, quizzes and plans instead.
- **Privacy:** Claude only sees what the student already sees in Canvas. Students can delete their data and revoke access anytime.
- **Running autonomously:** independent mode can read and draft, but never sends messages on its own.

## If a judge asks "what about professors?"
Log out, click **Professor demo**, and show the Today panel: "Kevin has 2 missing assignments at 41%, and he messaged that he works nights." Ask **"Who's falling behind?"**, then **"Draft an announcement about Quiz 5"** → **Post to course**. One sentence: "Same Canvas login; Cuss switches to professor mode, so professors can reach struggling students sooner."

## Other likely questions
- **Does it work with my iPhone?** Yes: install it from Safari (Add to Home Screen), subscribe to the auto-updating calendar in Settings, and send any reading to Reminders. In the App Store version it adds events and reminders directly.
- **Where do my uploads go?** Into that class's private library. Only the student and Cuss (when they ask) can read them, and Delete my data erases them.
- **Did you build this at Cal Hacks?** Yes, it was started at the event. The GitHub commit history shows it.
- **How does it connect to Canvas?** Canvas's official OAuth2 sign-in through the school's SSO, the same way approved apps connect. Each school approves Cuss once, and then any student can log in.
- **What's real and what's simulated?** The AI, the agent loop, the Canvas API integration and the sign-in are real. "Demo University" is a mock Canvas with sample classes, so we can demo without exposing a real student's data; it speaks the same API as real Canvas.
- **What's next?** An SF State pilot, App Store and Google Play apps with push notifications, and calendar sync.
