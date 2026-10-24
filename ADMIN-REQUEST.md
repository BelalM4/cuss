# Request to SFSU Canvas administrators

Send this to SFSU's Canvas support team (Academic Technology). You can reach them
through **Help** (the ? icon) in Canvas's left menu. Fill in the parts in [brackets].

---

**Subject:** Request for a Canvas API Developer Key for a student study-assistant app

Hello,

I'm [your name], a student at SFSU ([your major], SF State ID [your ID]). I've built
**Cuss for Canvas**, a study assistant that helps students keep up with Canvas:

- reminders before assignments are due, and a calendar export of deadlines
- help writing clear, polite messages to instructors, sent through Canvas Inbox
  only when the student presses Send
- study help (explanations, flashcards, practice quizzes) based on the student's
  own course pages and files

I'd like students to sign in with the normal SFSU Canvas login (OAuth2) instead
of personal access tokens, which I understand are restricted. Could you create an
**API Developer Key** for it?

- **Key name:** Cuss for Canvas
- **Redirect URI:** [your PUBLIC_URL]/auth/callback (for example `http://localhost:3000/auth/callback` for a pilot on my own computer)
- **Owner email:** [your SFSU email]
- **Access:** read-only for everything except sending Inbox messages the student approves.
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
  - `POST /api/v1/conversations` (send an Inbox message, only after the student approves it)

**How student data is handled**
- Each student signs in themselves and only sees their own Canvas data.
- Tokens, chats and settings are stored on the app's server and are never shared
  between students. Students can delete their data and revoke access at any time.
- To generate answers, the course content a student asks about is sent to Anthropic's
  Claude API. Anthropic does not train on API data by default.
- The app never submits assignments or takes quizzes, and it never sends messages
  without the student's approval unless the student explicitly turns that on.

If a full Developer Key isn't possible right now, could you generate a **personal
access token** for my own account so I can pilot the app myself? (Canvas says
administrators can do this on a student's behalf.)

I'm happy to demo the app or answer any security or privacy questions.

Thank you,
[your name]
[your SFSU email]
