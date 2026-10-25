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
> "I'm Belal. I built Cuss for first-gen, working, commuting and transfer students at SF State, people like me with the least time to dig through Canvas. Every semester I juggle five courses, and every one is set up differently. Last month I missed [a real example: a quiz, an announcement, a professor's email] that was sitting in Canvas the whole time. Canvas has everything, but it's a filing cabinet, not an assistant."

**0:15 – What Cuss is (10 s)**
> "Cuss is an AI assistant that signs in to your Canvas and handles your semester. Here it is, live."

**0:25 – What's due + live steps (15 s)**
Click **What's due?** and point at the step bubbles as they appear.
> "It's checking my deadlines and reading my professors' announcements right now. You can see every step. And it caught that my quiz was moved."

**0:40 – Inbox loop (25 s)**
Under **Messages**, click **Prof. Ortiz**.
> "My history professor offered to reopen a quiz I missed. Cuss summarized it and drafted a reply. Nothing sends until I approve it."

Press **Send reply**.
> "And Cuss alerts me the moment professors answer."
(The demo professor replies in about 15 seconds. Keep going; the pop-up lands during the next step.)

**1:05 – "Due next class" (20 s)**
Type: **"The Wilson speech reading is due next class, remind me tomorrow night"**.
> "Professors assign readings out loud that never show up in Canvas. I just say it, and Cuss files it in my history class for next class, with a reminder."
Point at the card's **Add to Calendar** and **Add to Reminders** buttons, then tap **Open class**.
> "Every class has its own files and notes: the Canvas lectures, my own uploads, and what's due next class. On my iPhone this all goes straight into Calendar."
Close the class page.

**1:25 – Study from real notes (20 s)**
Type: **"Quiz me on the Lecture 15 slides for Quiz 5"**.
> "It opened my professor's actual PDF slides from Canvas, diagrams and all, and made a quiz from them."
Answer one question.

**1:45 – Voice (10 s, skip if you're short on time)**
Tap **Talk** (or the sound-wave button) and ask: **"What should I work on tonight?"**

**1:55 – Impact + close (10 s)**
> "We measure impact inside the app: missing assignments over time, reminders delivered, emails actually sent, and quiz scores. It's ready for SF State as soon as the school approves it, and it works at any Canvas school. Scan this to try it yourself."
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

## If a judge asks "what about professors?"
Log out, click **Professor demo**, and show the Today panel: "Kevin has 2 missing assignments at 41%, and he messaged that he works nights." Ask **"Who's falling behind?"**, then **"Draft an announcement about Quiz 5"** → **Post to course**. One sentence: "Same Canvas login; Cuss switches to professor mode, so professors can reach struggling students sooner."

## Other likely questions
- **Does it work with my iPhone?** Yes: install it from Safari (Add to Home Screen), subscribe to the auto-updating calendar in Settings, and send any reading to Reminders. In the App Store version it adds events and reminders directly.
- **Where do my uploads go?** Into that class's private library. Only the student and Cuss (when they ask) can read them, and Delete my data erases them.
- **Did you build this at Cal Hacks?** Yes, it was started at the event. The GitHub commit history shows it.
- **How does it connect to Canvas?** Canvas's official OAuth2 sign-in through the school's SSO, the same way approved apps connect. Each school approves Cuss once, and then any student can log in.
- **What's real and what's simulated?** The AI, the agent loop, the Canvas API integration and the sign-in are real. "Demo University" is a mock Canvas with sample classes, so we can demo without exposing a real student's data; it speaks the same API as real Canvas.
- **What's next?** An SF State pilot, App Store and Google Play apps with push notifications, and calendar sync.
