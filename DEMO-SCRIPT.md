# Cuss: hackathon demo script (about 3 minutes)

## Before you go on stage (10-minute checklist)
- [ ] Laptop plugged in, **Do Not Disturb** on, other tabs and apps closed.
- [ ] Internet works (bring a phone hotspot as a backup; the AI needs the internet).
- [ ] In `.env`, set `AI_EFFORT=low` for snappy answers, then run `npm start`.
- [ ] Open **Chrome** at `http://localhost:3000`, then press **⌘ + Shift + F** for full screen and **⌘ +** once so the room can read it.
- [ ] Click **Try the live demo** and sign in with your name. In Settings, **Start the demo over** gives you a clean slate.
- [ ] Click the mic once and allow microphone access, so the permission pop-up doesn't appear mid-demo.
- [ ] Do one practice run of every step below, then **Start the demo over** again.
- [ ] Record a backup screen video of a good run (⌘ + Shift + 5) in case the Wi-Fi dies.

---

## 1. The hook (20 seconds)
> "Quick show of hands: who has ever missed an assignment that was sitting in Canvas the whole time?
> Canvas has everything: deadlines, lecture notes, your professors. But it's a filing cabinet, not an assistant.
> We built **Cuss**, an AI that actually reads your Canvas and handles your semester for you. Let me show you."

## 2. Log in (15 seconds)
- Show the landing page, then click **Try the live demo** and sign in.
> "Students log in with their normal school login, the same one they use for Canvas. No passwords, no setup.
> For today, this is a sample student at Demo University."

- Point at the **Today** panel: things due this week, missing work, grades.
> "The second I log in, it already knows what's due and what's missing."

## 3. "What's due?" and the live agent steps (30 seconds)
- Click **What's due?**
- While it works, point at the step bubbles: *Checked deadlines… Read 2 announcements…*
> "You can watch it work. It's pulling my deadlines and reading my professors' announcements, and it noticed
> the quiz got moved. That's from an announcement I never read."

## 4. Study from real course notes (40 seconds)
- Type: **"Quiz me for Quiz 5"**
- Point at *Opened the course… Read "Week 8: The Cell Membrane & Transport"*.
> "It isn't making things up from the internet. It opened my actual biology notes from Canvas and wrote a quiz from them."
- Answer a question wrong on purpose to show the explanation, then answer one right.
- Optional: "Make flashcards for the chain rule", then flip a card with the **Space** key.

## 5. Email your professor (30 seconds)
- Type: **"Email Dr. Chen asking if I can come to office hours Wednesday about my lab report"**
> "Every student has stared at a blank email to a professor. Cuss finds the right professor and writes a polite,
> specific email. I can edit it, and nothing sends until I press Send. It goes through Canvas Inbox."
- Press **Send via Canvas**. (In the demo it goes nowhere.)

## 5b. Your inbox, handled (30 seconds)
- In the Today panel under **Messages**, click **Prof. Daniel Ortiz – Gilded Age reading quiz**.
> "Cuss reads my Canvas inbox too. My history professor offered to reopen a quiz I missed. Cuss summarized it
> and already drafted a reply saying yes."
- Press **Send reply**. About 15 seconds later a pop-up appears: **New message from Prof. Daniel Ortiz**.
> "And here's the professor writing back. Cuss alerts me the moment a professor replies, so nothing gets buried."
- Tip: send the Dr. Chen email from step 5 first. Her reply arrives while you show the quiz, which feels like magic.

## 6. The wow moment: voice mode (35 seconds)
- Click the **sound-wave button** in the message bar.
- Say: **"What should I work on tonight?"**
- Let it answer out loud, then ask a follow-up: **"Remind me tomorrow at 6 to start my lab report."**
> "It's like a friend who actually read the syllabus. You can do all of this while walking to class."

## 7. Independent mode and the close (20 seconds)
- Open **Settings** and show **Independent mode**, then the **What Cuss remembers** list.
> "Turn on independent mode and Cuss checks Canvas every morning on its own, writes your daily plan, and makes study
> sets before exams. It remembers you across every chat.
> It works with any school on Canvas. We're starting at SF State, where we've already asked for official access.
> **Cuss: your semester, handled.**"

---

## Likely judge questions
- **How does it connect to Canvas?** Through Canvas's official sign-in (OAuth2), the same way approved apps connect. Each school's Canvas admins approve the app once, and then students just log in.
- **Can it really send and read messages?** Yes, through Canvas Inbox (Canvas also emails the professor). In the demo, the professors are simulated and messages stay inside the demo. With a real school account, they go to real people, and only after the student presses Send.
- **Is student data safe?** Each student only sees their own data, nothing is shared between students, and students can delete their data and disconnect anytime. Emails never send without the student's approval unless they turn on auto-send.
- **What about cheating?** Cuss is built to help students learn. It won't do graded work or answer live quizzes; it explains concepts, quizzes you on your notes, and helps you plan.
- **What's the tech?** Node.js + Express, the Canvas REST API, and Claude (Anthropic) with tool use, so it decides which Canvas data to look up and shows each step live. Voice uses the browser's built-in speech recognition and text-to-speech.
- **How does it make money / scale?** Free for students with a daily limit; paid for heavier use, or licensed by schools to improve retention. It works at any Canvas school with one approval per school.
- **What's next?** Official approval at SF State, a mobile app with push notifications, Google Calendar sync, and study groups.
