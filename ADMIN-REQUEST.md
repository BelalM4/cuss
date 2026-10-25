# Request to SFSU Canvas administrators

Send this to SFSU's Canvas support team (Academic Technology). You can reach them
through **Help** (the ? icon) in Canvas's left menu, or through the ITS service desk.
Fill in the parts in [brackets].

---

**Subject:** Request for a Canvas API Developer Key for a student study-assistant app

Hello,

I'm Belal Elboheisy, an economics student at SFSU. I built **Cuss for Canvas** at
Cal Hacks 13.0 (UC Berkeley's hackathon, October 2026): an AI study assistant, powered by
Anthropic's Claude, that helps students keep up with Canvas. I have ADHD, and keeping
track of several fast-moving courses at once is hard for me, so I built the tool I wanted.

It does three main things:

- reminders before assignments are due, and a calendar export of deadlines
- help writing clear, polite messages to instructors and replying to their Inbox
  messages, sent through Canvas Inbox only when the student presses Send
- study help (explanations, flashcards, practice quizzes) based on the student's
  own course pages and files

There is also an optional professor mode: an instructor can see which students have
missing work, what needs grading, and draft check-ins and announcements that are only
posted after the instructor approves them.

You can try a working demo with sample data (no Canvas account involved) at
https://cuss.onrender.com, watch a short video at https://youtu.be/iZonoqqxo8Q,
and read the code at https://github.com/BelalM4/cuss.

I'd like students to sign in with the normal SFSU Canvas login (OAuth2) instead
of personal access tokens, which I understand are restricted. Could you create an
**API Developer Key** for it?

- **Key name:** Cuss for Canvas
- **Redirect URI:** `https://cuss.onrender.com/auth/callback`
- **Owner email:** belboheisy@sfsu.edu
- **Access:** read-only for everything except sending Inbox messages and replies the student approves.
  If you enforce scopes, these are the endpoints the app uses:
  - `GET /api/v1/users/:user_id/profile`
  - `GET /api/v1/courses` and `GET /api/v1/courses/:id`
  - `GET /api/v1/courses/:course_id/users` (to find instructors and TAs)
  - `GET /api/v1/planner/items`
  - `GET /api/v1/users/:user_id/missing_submissions`
  - `GET /api/v1/announcements`
  - `GET /api/v1/courses/:course_id/modules`
  - `GET /api/v1/courses/:course_id/pages/:url_or_id`
  - `GET /api/v1/courses/:course_id/assignments/:id`
  - `GET /api/v1/courses/:course_id/discussion_topics/:topic_id`
  - `GET /api/v1/courses/:course_id/quizzes/:id`
  - `GET /api/v1/courses/:course_id/files` and `GET /api/v1/courses/:course_id/files/:id`
  - `GET /api/v1/conversations` and `GET /api/v1/conversations/:id` (read the student's Canvas Inbox)
  - `POST /api/v1/conversations` and `POST /api/v1/conversations/:id/add_message` (send a new message or a reply, only after the student approves it)
  - Professor mode only, for instructors of the course: `GET /api/v1/courses/:course_id/enrollments`,
    `GET /api/v1/courses/:course_id/students/submissions`, `GET /api/v1/courses/:course_id/assignments`,
    and `POST /api/v1/courses/:course_id/discussion_topics` (posting an announcement the instructor approved)

**How student data is handled**
- Each student signs in themselves and only sees their own Canvas data.
- Canvas tokens are encrypted at rest. Tokens, chats and settings are stored on the
  app's server and are never shared between students. Students can delete their data
  and revoke access at any time, which also revokes the token in Canvas.
- In professor mode, student information is shown only to that course's instructor.
- To generate answers, the course content a student asks about is sent to Anthropic's
  Claude API. Anthropic does not train on API data by default.
- The app never submits assignments or takes quizzes, and it never sends messages
  without the student's approval unless the student explicitly turns that on.

If a full Developer Key isn't possible right now, could you generate a **personal
access token** for my own account so I can pilot the app myself? (Canvas says
administrators can do this on a student's behalf.)

To start small, I'd propose a pilot with a handful of students who opt in, and I'm glad
to follow any review process, privacy requirements (including FERPA) or limits you need.
I'm happy to demo the app in person or answer any security or privacy questions.

Thank you,
Belal Elboheisy
belboheisy@sfsu.edu
