// The assistant: Claude with tools that read the student's Canvas account.
import Anthropic from "@anthropic-ai/sdk";
import crypto from "node:crypto";
import * as canvas from "./canvas.js";
import { getConfig, getState, saveState } from "./store.js";
import * as chats from "./chats.js";

const MODEL = "claude-opus-5-5";

const SYSTEM_PROMPT = `You are Cuss for Canvas, a friendly personal assistant for a college student. You are connected to the student's Canvas LMS account through tools, so look things up yourself instead of asking the student for information Canvas already has (course IDs, due dates, instructor names, course materials).

What you help with:
- Deadlines: what's due, what's overdue or missing, and how to plan the week. Lead with the most urgent items and give due dates in the student's local time with the weekday.
- Emails to professors and TAs: find the right instructor with get_instructors, then write the message with draft_email. Write in the student's voice: polite, specific, brief, with a clear ask and the course name. Sign with the student's name. Never claim something about the student you don't know (illnesses, reasons, grades) - if the reason for the email is unclear, ask first or leave a short [bracketed placeholder] for them to fill in. You can only draft; the student reviews and presses Send (or says "send it"). Never say a message was sent.
- Studying: read the actual course materials (get_course_overview, then read_course_item on the relevant pages, files and assignments) and teach from them. Explain clearly, check understanding, and when useful build make_flashcards or make_quiz sets grounded in what you read. Say which course material you used.
- Reminders: add_reminder for anything the student asks to be reminded about. Assignment due-date reminders are already automatic.
- Memory: you keep long-term notes about the student that carry across all chats (shown at the top of each message). When you learn something durable and useful - their major, goals, how they like to study, which professor they prefer to email, upcoming exams they mentioned, preferences about tone - save it with remember. Don't save secrets, passwords, or sensitive health details. Use forget when a note is wrong or the student asks.
- Canvas Inbox: check_inbox lists messages (unread first when asked "any messages?"), read_conversation opens one, and draft_reply writes a reply in that same conversation. When summarizing messages, say who it's from, the course, and what they need from the student. If a message asks the student to do something, offer to draft a reply or set a reminder.
- Emails: if the student has turned on auto-send, draft_email and draft_reply send right away; the tool result tells you whether the message was sent or is waiting for review, and you report exactly that.

Academic integrity: help the student learn and plan. Don't write graded work for them to submit as their own or give answers to an active graded quiz or exam; offer to explain the concepts, outline an approach, or review their draft instead.

When a message is marked as an independent check-in, nobody is chatting live: do the work yourself (check deadlines, missing work, announcements and grades), then write a short briefing: what's urgent today, a realistic plan for the day, and anything new. Build flashcards or a quiz for the nearest exam or the topic being covered if that would help. Don't send emails during a check-in; draft them only if something clearly needs the student's attention and say so.

Style: warm, encouraging, concise. Use short paragraphs and bullet lists; avoid tables. When a message is marked as a voice conversation, answer in 1-4 short spoken-style sentences with no markdown, lists or URLs, and offer to show more detail on screen.`;

const tools = [
  {
    name: "list_courses",
    description: "List the student's active Canvas courses with IDs, current grades and instructors.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_deadlines",
    description:
      "Get assignments, quizzes, discussions and events due across all courses from the Canvas planner, with submitted/missing status. Also returns missing (overdue, unsubmitted) work.",
    input_schema: {
      type: "object",
      properties: {
        days_ahead: { type: "integer", description: "How many days ahead to look. Default 14." },
        course_id: { type: "integer", description: "Only this course (optional)." },
      },
    },
  },
  {
    name: "get_announcements",
    description: "Get recent course announcements.",
    input_schema: {
      type: "object",
      properties: {
        course_id: { type: "integer", description: "One course; omit for all courses." },
        days: { type: "integer", description: "How many days back. Default 14." },
      },
    },
  },
  {
    name: "get_course_overview",
    description:
      "Get a course's syllabus and its modules with every item (pages, files, assignments, quizzes, discussions). Use the returned itemId and type with read_course_item.",
    input_schema: {
      type: "object",
      properties: { course_id: { type: "integer" } },
      required: ["course_id"],
    },
  },
  {
    name: "list_course_files",
    description: "List files uploaded to a course (lecture slides, notes, readings), newest first.",
    input_schema: {
      type: "object",
      properties: { course_id: { type: "integer" } },
      required: ["course_id"],
    },
  },
  {
    name: "read_course_item",
    description: "Read the full content of a course page, assignment, discussion, quiz description, or file (PDFs included).",
    input_schema: {
      type: "object",
      properties: {
        course_id: { type: "integer" },
        item_type: { type: "string", enum: ["page", "assignment", "discussion", "quiz", "file"] },
        item_id: { type: "string", description: "The page url slug for pages, otherwise the numeric id." },
      },
      required: ["course_id", "item_type", "item_id"],
    },
  },
  {
    name: "get_instructors",
    description: "Get the instructors and TAs for a course, with their Canvas user IDs (needed for draft_email).",
    input_schema: {
      type: "object",
      properties: { course_id: { type: "integer" } },
      required: ["course_id"],
    },
  },
  {
    name: "draft_email",
    description:
      "Write a message to an instructor/TA, delivered through Canvas Inbox (which also emails the recipient). Normally it is shown to the student as a draft and only sent when they press Send; if they turned on auto-send it is sent immediately. Use this every time you write a message for the student; do not paste email text into chat.",
    input_schema: {
      type: "object",
      properties: {
        course_id: { type: "integer" },
        recipients: {
          type: "array",
          items: {
            type: "object",
            properties: { id: { type: "integer" }, name: { type: "string" } },
            required: ["id", "name"],
          },
        },
        subject: { type: "string" },
        body: { type: "string" },
      },
      required: ["course_id", "recipients", "subject", "body"],
    },
  },
  {
    name: "check_inbox",
    description: "List the student's Canvas Inbox conversations (messages from instructors, TAs and classmates), newest first.",
    input_schema: {
      type: "object",
      properties: {
        unread_only: { type: "boolean", description: "Only unread conversations." },
        sent: { type: "boolean", description: "Show messages the student sent instead." },
      },
    },
  },
  {
    name: "read_conversation",
    description: "Open one Canvas Inbox conversation and read every message in it (this marks it as read).",
    input_schema: {
      type: "object",
      properties: { conversation_id: { type: "integer" } },
      required: ["conversation_id"],
    },
  },
  {
    name: "draft_reply",
    description:
      "Write a reply in an existing Canvas Inbox conversation. Like draft_email, it is shown to the student to review and only sent when they press Send (unless auto-send is on). Read the conversation first.",
    input_schema: {
      type: "object",
      properties: {
        conversation_id: { type: "integer" },
        body: { type: "string" },
      },
      required: ["conversation_id", "body"],
    },
  },
  {
    name: "make_flashcards",
    description: "Show an interactive flashcard deck to the student. Ground cards in course material you have read.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        cards: {
          type: "array",
          items: {
            type: "object",
            properties: { front: { type: "string" }, back: { type: "string" } },
            required: ["front", "back"],
          },
        },
      },
      required: ["title", "cards"],
    },
  },
  {
    name: "make_quiz",
    description: "Show an interactive multiple-choice practice quiz. Ground questions in course material you have read.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        questions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              question: { type: "string" },
              choices: { type: "array", items: { type: "string" } },
              answer_index: { type: "integer", description: "0-based index of the correct choice." },
              explanation: { type: "string" },
            },
            required: ["question", "choices", "answer_index", "explanation"],
          },
        },
      },
      required: ["title", "questions"],
    },
  },
  {
    name: "remember",
    description: "Save a long-term note about the student that will be available in every future chat.",
    input_schema: {
      type: "object",
      properties: { note: { type: "string", description: "One short, self-contained fact." } },
      required: ["note"],
    },
  },
  {
    name: "forget",
    description: "Delete a long-term note by its id.",
    input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "add_reminder",
    description: "Schedule a custom reminder notification for the student.",
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string" },
        remind_at: { type: "string", description: "ISO 8601 date-time with timezone offset." },
      },
      required: ["text", "remind_at"],
    },
  },
];

// Labels for the live "what Cuss is doing" steps shown in the chat.
const STATUS = {
  list_courses: "Checking your courses",
  get_deadlines: "Looking up your deadlines",
  get_announcements: "Reading announcements",
  get_course_overview: "Opening the course",
  list_course_files: "Browsing course files",
  read_course_item: "Reading course material",
  get_instructors: "Finding your instructor",
  draft_email: "Writing your email",
  check_inbox: "Checking your inbox",
  read_conversation: "Opening the message",
  draft_reply: "Writing your reply",
  make_flashcards: "Making flashcards",
  make_quiz: "Building a practice quiz",
  add_reminder: "Setting a reminder",
  remember: "Saving to memory",
  forget: "Updating memory",
};

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function doneLabel(name, input, result) {
  try {
    switch (name) {
      case "list_courses":
        return `Found ${plural(result.length, "course")}`;
      case "get_deadlines":
        return `Checked deadlines · ${result.upcoming.length} upcoming, ${result.missing.length} missing`;
      case "get_announcements":
        return `Read ${plural(result.length, "announcement")}`;
      case "get_course_overview":
        return `Opened ${result.name}`;
      case "list_course_files":
        return `Found ${plural(result.length, "file")}`;
      case "read_course_item": {
        if (Array.isArray(result)) return `Read “${result[0].title}”`;
        const title = String(result).match(/^# (.+)/)?.[1];
        return title ? `Read “${title}”` : "Read course material";
      }
      case "get_instructors":
        return `Found ${result.map((i) => i.name).join(", ") || "no instructors"}`;
      case "draft_email":
        return /SENT/.test(result) ? "Sent your email" : "Drafted your email";
      case "check_inbox": {
        const unread = result.filter((c) => c.unread).length;
        return `Checked inbox · ${plural(result.length, "conversation")}${unread ? `, ${unread} unread` : ""}`;
      }
      case "read_conversation":
        return `Read “${result.subject}” from ${result.messages.findLast((m) => m.fromId !== result.studentId)?.from || result.participants[0] || "Canvas"}`;
      case "draft_reply":
        return /SENT/.test(result) ? "Sent your reply" : "Drafted your reply";
      case "make_flashcards":
        return `Made ${plural(input.cards.length, "flashcard")}`;
      case "make_quiz":
        return `Built a ${input.questions.length}-question quiz`;
      case "add_reminder":
        return "Reminder set";
      case "remember":
        return "Saved to memory";
      default:
        return STATUS[name] || "Done";
    }
  } catch {
    return STATUS[name] || "Done";
  }
}

// --- Tool execution ---------------------------------------------------------

function need(input, ...keys) {
  for (const k of keys) {
    if (input[k] === undefined || input[k] === null || input[k] === "") throw new Error(`Missing required field "${k}".`);
  }
}

async function runTool(name, input, emit, { allowSend = true } = {}) {
  switch (name) {
    case "list_courses":
      return canvas.listCourses();
    case "get_deadlines": {
      const days = Math.min(Math.max(input.days_ahead || 14, 1), 120);
      const [upcoming, missing] = await Promise.all([
        canvas.getDeadlines({ daysAhead: days }),
        canvas.getMissing().catch(() => []),
      ]);
      const byCourse = (x) => !input.course_id || x.courseId === input.course_id;
      return { upcoming: upcoming.filter(byCourse), missing: missing.filter(byCourse) };
    }
    case "get_announcements": {
      const ids = input.course_id ? [input.course_id] : (await canvas.listCourses()).map((c) => c.id);
      return canvas.getAnnouncements(ids, input.days || 14);
    }
    case "get_course_overview":
      need(input, "course_id");
      return canvas.getCourseOverview(input.course_id);
    case "list_course_files":
      need(input, "course_id");
      return canvas.listFiles(input.course_id);
    case "read_course_item": {
      need(input, "course_id", "item_type", "item_id");
      const item = await canvas.readCourseItem(input.course_id, input.item_type, input.item_id);
      if (item.pdf) {
        return [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: item.pdf }, title: item.name },
          { type: "text", text: `Above is the course file "${item.name}".` },
        ];
      }
      return item.text;
    }
    case "get_instructors":
      need(input, "course_id");
      return canvas.getInstructors(input.course_id);
    case "draft_email": {
      need(input, "course_id", "recipients", "subject", "body");
      if (!Array.isArray(input.recipients) || !input.recipients.length) throw new Error("recipients must be a non-empty list.");
      const instructors = await canvas.getInstructors(input.course_id).catch(() => []);
      const id = crypto.randomUUID();
      const draft = {
        id,
        createdAt: new Date().toISOString(),
        courseId: input.course_id,
        recipients: input.recipients.map((r) => ({
          ...r,
          email: instructors.find((i) => i.id === r.id)?.email || null,
        })),
        subject: input.subject,
        body: input.body,
        status: "draft",
      };
      if (allowSend && getConfig().autoSendEmails) {
        await canvas.sendMessage({ ...draft, recipientIds: draft.recipients.map((r) => r.id) });
        draft.status = "sent";
      }
      chats.saveDraft(draft);
      emit({ type: "card", card: { kind: "draft", ...draft } });
      return draft.status === "sent"
        ? `Auto-send is on, so the message was SENT to ${draft.recipients.map((r) => r.name).join(", ")} via Canvas Inbox.`
        : `Draft ${id} is now on the student's screen for review. It has NOT been sent; the student can edit it and press Send, or say "send it".`;
    }
    case "check_inbox":
      return canvas.listConversations({ scope: input.sent ? "sent" : input.unread_only ? "unread" : "inbox" });
    case "read_conversation": {
      need(input, "conversation_id");
      const c = await canvas.getConversation(input.conversation_id);
      const me = await canvas.getProfile().catch(() => ({}));
      return { ...c, studentId: me.id };
    }
    case "draft_reply": {
      need(input, "conversation_id", "body");
      const c = await canvas.getConversation(input.conversation_id);
      const me = await canvas.getProfile().catch(() => ({}));
      const theirs = c.messages.filter((m) => m.fromId !== me.id);
      const last = theirs[theirs.length - 1] || c.messages[c.messages.length - 1];
      const id = crypto.randomUUID();
      const draft = {
        id,
        kind: "reply",
        createdAt: new Date().toISOString(),
        conversationId: c.id,
        subject: c.subject,
        course: c.course,
        recipients: [...new Set(theirs.map((m) => m.from))].map((name) => ({ name })),
        quote: last ? { from: last.from, at: last.at, body: last.body.slice(0, 600) } : null,
        body: input.body,
        status: "draft",
      };
      if (allowSend && getConfig().autoSendEmails) {
        await canvas.replyToConversation(c.id, draft.body);
        draft.status = "sent";
      }
      chats.saveDraft(draft);
      emit({ type: "card", card: { kind: "reply", ...draft } });
      return draft.status === "sent"
        ? `Auto-send is on, so the reply was SENT in "${c.subject}".`
        : `Reply draft ${id} is now on the student's screen. It has NOT been sent; the student can edit it and press Send, or say "send it".`;
    }
    case "make_flashcards":
      need(input, "title", "cards");
      emit({ type: "card", card: { kind: "flashcards", title: input.title, cards: input.cards } });
      return `Showing ${input.cards.length} flashcards to the student.`;
    case "make_quiz":
      need(input, "title", "questions");
      emit({ type: "card", card: { kind: "quiz", title: input.title, questions: input.questions } });
      return `Showing a ${input.questions.length}-question quiz to the student. Don't reveal answers in chat.`;
    case "remember": {
      need(input, "note");
      const m = chats.addMemory(input.note);
      return `Saved note ${m.id}.`;
    }
    case "forget":
      need(input, "id");
      return chats.removeMemory(input.id) ? "Note deleted." : "No note with that id.";
    case "add_reminder": {
      need(input, "text", "remind_at");
      const at = new Date(input.remind_at);
      if (isNaN(at)) throw new Error("remind_at is not a valid date.");
      const state = getState();
      state.customReminders.push({ id: crypto.randomUUID(), text: input.text, remindAt: at.toISOString(), sent: false });
      saveState(state);
      return `Reminder saved for ${at.toISOString()}.`;
    }
    default:
      throw new Error(`Unknown tool ${name}`);
  }
}

function toToolContent(result) {
  if (Array.isArray(result) && result[0]?.type === "document") return result;
  return typeof result === "string" ? result : JSON.stringify(result);
}

// --- Main loop ----------------------------------------------------------------

export class SetupError extends Error {}

function contextLine({ timeZone, studentName, voice, independent }) {
  const now = new Date().toLocaleString("en-US", { timeZone: timeZone || undefined, dateStyle: "full", timeStyle: "short" });
  const memories = chats.getMemories();
  return (
    `[Now: ${now} (${timeZone || "server time"})` +
    (studentName ? ` | Student: ${studentName}` : "") +
    (voice ? " | Voice conversation: reply briefly in plain spoken sentences" : "") +
    (independent ? " | Independent check-in: no one is chatting live" : "") +
    "]\n" +
    (memories.length
      ? `[Your notes about the student:\n${memories.map((m) => `- (${m.id}) ${m.text}`).join("\n")}]\n`
      : "[Your notes about the student: none yet]\n")
  );
}

// Runs one exchange in a saved chat. `emit` streams events to the browser;
// the same events are recorded so the chat can be redrawn later.
export async function chat({ conversationId, text, voice, timeZone, independent = false, title }, emit = () => {}) {
  const { anthropicKey, studentName } = getConfig();
  if (!anthropicKey) throw new SetupError("The AI isn't set up on this server yet (the app owner needs to add ANTHROPIC_API_KEY).");
  const client = new Anthropic({ apiKey: anthropicKey });
  const convo = chats.loadChat(conversationId);
  if (!convo.display.length) {
    convo.title = title || text.replace(/\s+/g, " ").slice(0, 60);
    convo.kind = independent ? "briefing" : "chat";
  }

  const startMessages = convo.messages.length;
  const startDisplay = convo.display.length;
  if (!independent) convo.display.push({ role: "user", text });
  const record = (event) => {
    if (event.type === "text") {
      const last = convo.display[convo.display.length - 1];
      if (last?.role === "bot") last.text += event.delta;
      else convo.display.push({ role: "bot", text: event.delta });
    } else if (event.type === "card") {
      convo.display.push({ card: event.card });
    } else if (event.type === "step") {
      // A step finishing after a card was shown updates its original group.
      const owner = convo.display.findLast((d) => d.steps?.some((s) => s.id === event.id));
      if (owner) Object.assign(owner.steps.find((s) => s.id === event.id), { text: event.text, state: event.state });
      else {
        let group = convo.display[convo.display.length - 1];
        if (!group?.steps) convo.display.push((group = { steps: [] }));
        group.steps.push({ id: event.id, text: event.text, state: event.state });
      }
    }
    emit(event);
  };

  convo.messages.push({
    role: "user",
    content: `${contextLine({ timeZone: timeZone || getConfig().timeZone, studentName, voice, independent })}\n${text}`,
  });
  try {
    // Voice gets quicker, shorter answers; typed chats get a bit more depth.
    await runLoop(client, convo, record, { allowSend: !independent, effort: voice ? "low" : process.env.AI_EFFORT || "medium" });
    convo.display = convo.display.filter((d) => !(d.role === "bot" && !d.text.trim()));
    chats.saveChat(convo);
  } catch (err) {
    // Drop the half-finished exchange so the next message starts clean.
    convo.messages.length = startMessages;
    convo.display.length = startDisplay;
    if (convo.display.length) chats.saveChat(convo);
    throw err;
  }
  return convo;
}

async function runLoop(client, convo, emit, toolOptions) {
  for (let turn = 0; turn < 20; turn++) {
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 32000,
      system: SYSTEM_PROMPT,
      tools,
      messages: convo.messages,
      thinking: { type: "adaptive" },
      output_config: { effort: toolOptions.effort || "medium" },
      cache_control: { type: "ephemeral" },
      // If a safety classifier declines, retry automatically on a suitable model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    stream.on("text", (delta) => emit({ type: "text", delta }));
    const message = await stream.finalMessage();
    convo.messages.push({ role: "assistant", content: message.content });

    if (message.stop_reason === "refusal") {
      emit({ type: "text", delta: "\n\nSorry, I can't help with that one." });
      return;
    }
    if (message.stop_reason === "pause_turn") continue;
    if (message.stop_reason !== "tool_use") return;

    const toolUses = message.content.filter((b) => b.type === "tool_use");
    const results = await Promise.all(
      toolUses.map(async (tu) => {
        emit({ type: "step", id: tu.id, state: "running", text: STATUS[tu.name] || "Working" });
        try {
          const result = await runTool(tu.name, tu.input || {}, emit, toolOptions);
          emit({ type: "step", id: tu.id, state: "done", text: doneLabel(tu.name, tu.input || {}, result) });
          return { type: "tool_result", tool_use_id: tu.id, content: toToolContent(result) };
        } catch (err) {
          emit({ type: "step", id: tu.id, state: "error", text: `${STATUS[tu.name] || "Step"} failed` });
          return { type: "tool_result", tool_use_id: tu.id, content: `Error: ${err.message}`, is_error: true };
        }
      }),
    );
    convo.messages.push({ role: "user", content: results });
  }
  emit({ type: "text", delta: "\n\n(I stopped after many steps - ask me to keep going if needed.)" });
}

export function describeError(err) {
  if (err instanceof SetupError) return err.message;
  if (err instanceof Anthropic.AuthenticationError) return "The AI key on this server was rejected. Tell the app owner to check ANTHROPIC_API_KEY.";
  if (err instanceof Anthropic.RateLimitError) return "The AI is busy right now (rate limit). Try again in a minute.";
  if (err instanceof Anthropic.APIConnectionError) return "Couldn't reach the AI service. Check your internet connection.";
  if (err instanceof Anthropic.APIError) return `AI service error: ${err.message}`;
  if (err instanceof canvas.CanvasError) return err.message;
  return `Something went wrong: ${err.message}`;
}
