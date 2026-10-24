# Cuss for Canvas

## What it does

Cuss is an AI study assistant that works directly with Canvas LMS. Instead of asking students to copy deadlines, course pages, or professor details into a separate chatbot, Cuss can look them up in Canvas and turn them into useful next steps:

- deadline and missing-work reminders
- course-aware explanations from pages, assignments, files, and syllabi
- grounded flashcards and practice quizzes
- instructor email drafts sent through Canvas Inbox
- saved conversations and long-term study preferences
- voice input, voice replies, calendar export, and an optional daily briefing

Judges can try the full product through the built-in Demo University flow without a school account. Demo students get isolated sample courses, deadlines, professors, and course content; demo messages never leave the app.

## How it is built

- **Frontend:** vanilla HTML, CSS, and JavaScript for a fast, responsive app that works on desktop and mobile.
- **Backend:** Node.js and Express.
- **AI:** Anthropic Claude with tool use and streamed newline-delimited JSON responses.
- **Learning data:** Canvas REST API through OAuth 2.0, with automatic token refresh.
- **Storage:** per-student JSON files on the server, isolated by Canvas user ID.
- **Deployment:** Render-compatible Node service with a PWA manifest and service worker for installable mobile use.

The assistant uses explicit tools for Canvas lookups, course-material reading, memory, reminders, study sets, and email drafting. It does not invent course IDs or claim an email was sent when it is only a draft.

## Why we built it

Students already have the information they need, but it is scattered across Canvas announcements, modules, assignments, files, Inbox, and calendar views. Cuss makes the information conversational while keeping the student in control of consequential actions like sending an email.

## Challenges

The hardest parts were making the assistant useful without making it careless:

1. **Reliable grounding:** the model must read the actual course material before teaching from it.
2. **Safe actions:** emails are drafts by default and only send after a student review; independent check-ins never send email.
3. **Canvas complexity:** OAuth, token refresh, pagination, different item types, file downloads, and per-course permissions all need to work together.
4. **Privacy boundaries:** each student's chats, memory, settings, and Canvas token stay in that student's data directory.
5. **A judge-friendly demo:** the demo school mirrors the Canvas API so the entire product can be tested without real student credentials.

## What is next

- production hosting with a persistent encrypted database
- native iOS and Android wrappers with store-ready signing and push notifications
- school-admin onboarding and Canvas Developer Key templates
- richer assignment workflows and instructor-approved integrations
- accessibility review, analytics with consent, and expanded privacy controls

## Links

- Demo/share page: `https://YOUR-RENDER-URL.onrender.com/share`
- Source: `https://github.com/BelalM4/cuss`
