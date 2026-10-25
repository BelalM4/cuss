# Cuss: Cal Hacks 13.0 table pitch (2 minutes, live demo)

**Official judging info (Cal Hacks announcement):** submit on Devpost by **9:00 AM Sunday** with every prize track selected. Arrive at the **Palace of Fine Arts by 9:30 AM**, find your assigned table (up to 3 teams share one), and be ready by **10:30 AM**. Stay for the **whole 10:30 AM–12:30 PM** window. At least three judges, each with up to 5 minutes: prepare a **three-minute pitch** with a **live demo**, and have a **locally stored demo video**. **Personal hotspots are banned** (spectrum analyzers; violators are disqualified), so if the venue Wi-Fi fails, play the local video.

## Saturday night / Sunday morning checklist
- [ ] **Devpost submitted before 9:00 AM Sunday.** Submit a draft tonight and keep editing (see `DEVPOST.md`). Add your teammates.
- [ ] Hosted link works (Render). Open it at **10:15 AM** so the free server is awake.
- [ ] Laptop charged. Chrome open at the app, full screen (⌘ + Shift + F), zoomed in once (⌘ +).
- [ ] Phone with the **QR code** (`cuss.onrender.com/share`) ready to hand to judges, or a second laptop tab with it.
- [ ] **Settings → Start the demo over** right before each judge arrives, signed in as yourself.
- [ ] Microphone already allowed (click the mic once beforehand).
- [ ] Optional: on your phone, **Settings → Add to iPhone Calendar** once, so you can show deadlines and readings in your real iPhone Calendar if a judge asks.
- [ ] Demo classes already know when they meet (BIOL 230 Mon/Wed, HIST 120 Tue/Thu, MATH 226 Mon/Wed/Fri), so "next class" works right after **Start the demo over**.
- [ ] **Required:** `cuss-demo-voiceover.mp4` saved locally on the laptop (and phone), not just on YouTube. Test that it plays with Wi-Fi off. No personal hotspots.

---

## The 3-minute pitch (with the slides)

**Before each judge:** student demo signed in on localhost (Settings → **Start the demo over**), auto-send **off**, deck open in another tab on slide 1. Also keep a **private/incognito window signed in to the Professor demo** so you can switch instantly. Switch tabs with **Ctrl+Tab**.

| Time | Slide | Do | Say |
|---|---|---|---|
| 0:00–0:05 | **1 · Cover** | — | "Hi, I'm Belal. This is Cuss." |
| 0:05–0:20 | **2 · The problem** | — | "I built Cuss because I have ADHD. Canvas holds my assignments, messages and lecture files, but keeping track of everything across classes is still work. Cuss turns that information into a clear next step, for every student. Let me show you." |
| 0:20 | **3 · Live demo** | Switch to the app | — |
| 0:20–0:50 | *app* | Type **"What should I work on tonight? Anything missing?"** Point at one assignment, like the missing one. | "This is a practice Canvas account with sample classes, and the AI is real. You can see every step it takes: it's checking my deadlines and missing work, then telling me where to start." |
| 0:50–1:20 | *app* | Type **"Make a two-question practice quiz from the BIOL 230 lecture slides."** Answer one question and show the explanation. | "It reads my actual course files, like PDFs, PowerPoints and Word docs, and turns them into practice questions." |
| 1:20–1:40 | *app* | Type **"Draft an email to Dr. Chen asking about Wednesday office hours."** Leave it unsent. | "When I need help, Cuss finds the right instructor and drafts the message. Nothing sends until I review it." |
| 1:40–2:00 | *app* | Type **"The Wilson speech reading is due next class, remind me tomorrow night."** Point at the card's Add to Calendar / Add to Reminders, then **Open class**. | "Professors mention readings that never show up in Canvas. I just say it, and Cuss files it under that class for next class, with a reminder." |
| 2:00–2:30 | *app (professor window)* | Switch to the private window. Type **"Who's falling behind?"** | "Professors use the same login. Cuss switches to professor mode and shows who needs a check-in, so a student like me gets reached before midterms, not after. Nothing reaches students until the professor approves it." |
| 2:30–2:45 | **4 · Impact** | Switch back to the slides | "On safety: every step is shown, messages are drafts by default, and it's instructed to refuse graded work. We already count missing work over time, emails actually sent and quiz scores, and the next step is a pilot at SF State once Canvas access is approved." |
| 2:45–3:00 | **5 · Try it** | Leave the QR code up | "Canvas stores the information. Cuss helps students act on it. Scan this to try it yourself." |

**While the AI is thinking** (real answers can take 10–20 seconds), keep talking: point at the step bubbles ("now it's reading the lecture PDF").
**If the quiz picks the wrong file,** ask again with "from the Lecture 15 membrane transport slides."
**If anything breaks or the Wi-Fi drops,** say "let me show you the recording" and play `cuss-demo-voiceover.mp4` from the laptop. (Its AI replies are scripted; say so.) Never turn on a hotspot.
**If a judge has less time,** skip the reading (1:40) and professor (2:00) steps; that is the 2-minute version.

### Backup slides (after the QR slide) for judges' questions

| Slide | Open it when a judge asks… |
|---|---|
| 6 · Meet Cuss | "What else does it do?" |
| 7 · Every class, organized | "Can it handle readings that aren't in Canvas?" Live: "The Wilson speech reading is due next class, remind me tomorrow night." |
| 8 · How it works | "How does it work?" / "How does it connect to Canvas?" |
| 9 · Trust | "Where could Claude go wrong?" (Anthropic track) |
| 10 · Professors | "What about teachers?" Live: Settings → Log out → **Professor demo** → "Who's falling behind?" |
| 11 · On your phone | "Does it work on iPhone?" |
| 12 · What's next | "What's next?" |

Every slide's speaker notes contain exactly what to say.

---

## For the Anthropic "Claude for Public Benefit" track
Judges look for: (1) a **named community**: for this track say: "Cuss is for every student, and the community I'm starting with is students with ADHD and other disabilities, because I'm one of them"; (2) a **real problem you've lived**: tell your story; (3) a **working product and how you measure impact**: show `/impact`; (4) **thoughtful use of Claude**: the live steps, plus the fact that it was built with Claude Code.

### Know where Claude can go wrong
Judges will ask. Have these answers ready:
- **Wrong or made-up deadlines:** Cuss is instructed to fetch Canvas data and shows its tool steps. The model can still miss a change or misinterpret a date, so students should verify important deadlines in Canvas and announcements.
- **Sending the wrong email to a professor:** drafts by default. Sending right away needs both the auto-send opt-in and an explicit request to send.
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
