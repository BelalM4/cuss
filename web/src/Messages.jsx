// The conversation: welcome screen, messages, live steps and cards. It follows
// new content only while the student is at the bottom (not reading back).
import { useEffect, useLayoutEffect, useRef } from "react";
import { Icon, useApp } from "./ui.jsx";
import { markdown, plainText } from "./lib/util.js";
import { speak } from "./lib/speech.js";
import DraftCard from "./cards/DraftCard.jsx";
import LibraryCard from "./cards/LibraryCard.jsx";
import { FlashcardCard, QuizCard } from "./cards/StudyCards.jsx";

const STUDENT_IDEAS = [
  ["clock", "What's due?", "What's due this week? Anything missing?"],
  ["mail", "Email a professor", "Help me write an email to one of my professors."],
  ["help", "Quiz me", "Quiz me on the topic for my next upcoming quiz or exam."],
  ["layers", "Flashcards", "Make me flashcards from the most recent module in one of my courses."],
  ["chart", "Plan my week", "Make me a realistic study plan for the next 7 days based on my deadlines."],
  ["message", "Check my messages", "Check my Canvas inbox. Any messages from my professors I need to deal with?"],
];
const TEACHER_IDEAS = [
  ["alert", "Who's behind?", "Missing work and low scores", "Which students in my courses are falling behind? Show missing work and scores, and suggest who to reach out to first."],
  ["check", "What to grade", "Submissions waiting", "What needs grading in my courses?"],
  ["message", "Student messages", "Summaries and reply drafts", "Check my Canvas inbox and help me answer my students' messages."],
  ["mail", "Nudge students", "Kind check-ins about missing work", "Draft kind, private check-in messages to students who have missing work."],
  ["megaphone", "Announcement", "Reminders, changes, encouragement", "Draft a course announcement reminding students about the next quiz and how to prepare."],
  ["help", "Practice quiz", "From your lecture files", "Make a practice quiz for my students from my latest lecture slides."],
];

export default function Messages({ items, scrollSignal, summary }) {
  const ref = useRef(null);
  const stick = useRef(true);
  const nearBottom = () => {
    const m = ref.current;
    return m.scrollHeight - m.scrollTop - m.clientHeight < 160;
  };

  // Opening a chat or sending a message jumps to the bottom (or top).
  useLayoutEffect(() => {
    if (!scrollSignal) return;
    const m = ref.current;
    m.scrollTop = scrollSignal.to === "top" ? 0 : m.scrollHeight;
    stick.current = scrollSignal.to !== "top" || nearBottom();
  }, [scrollSignal]);

  // New text, steps and cards keep the view at the bottom if it was there.
  useEffect(() => {
    const m = ref.current;
    const follow = new MutationObserver(() => {
      if (stick.current) m.scrollTop = m.scrollHeight;
    });
    follow.observe(m, { childList: true, subtree: true, characterData: true });
    return () => follow.disconnect();
  }, []);

  return (
    <div className="messages" ref={ref} role="log" aria-live="polite" aria-label="Conversation" onScroll={() => (stick.current = nearBottom())}>
      <Welcome hidden={items.length > 0} summary={summary} />
      {items.map((item) => (
        <Item key={item.key} item={item} />
      ))}
    </div>
  );
}

function Welcome({ hidden, summary }) {
  const { status, isTeacher, send } = useApp();
  const name = status?.studentName || "there";
  const parts = name.split(" ");
  const first = isTeacher && /^(dr|prof)\.?$/i.test(parts[0]) && parts.length > 1 ? `${parts[0]} ${parts.at(-1)}` : parts[0];
  const h = new Date().getHours();
  const hello = h < 5 ? "Up late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  const ideas = isTeacher ? TEACHER_IDEAS : STUDENT_IDEAS.map(([ic, title, prompt]) => [ic, title, undefined, prompt]);
  return (
    <section className={`welcome${hidden ? " hidden" : ""}`}>
      <div className="orb small-orb">
        <span />
      </div>
      <h1>
        {status ? (
          <>
            {hello}, <span className="grad-text">{first}</span>
          </>
        ) : (
          "Hey there 👋"
        )}
      </h1>
      <p className="welcome-sub">
        <WelcomeLine summary={summary} isTeacher={isTeacher} />
      </p>
      <div className="suggestions">
        {ideas.map(([ic, title, sub, prompt]) => (
          <button key={title} className="suggestion" title={sub} onClick={() => send(prompt)}>
            <Icon name={ic} size={isTeacher ? 22 : 18} />
            <b>{title}</b>
          </button>
        ))}
      </div>
    </section>
  );
}

function WelcomeLine({ summary, isTeacher }) {
  if (!summary) return "Choose a task to get started.";
  const s = (n) => (n === 1 ? "" : "s");
  if (isTeacher)
    return summary.needs || summary.grading ? (
      <>
        <b>{`${summary.needs} student${s(summary.needs)}`}</b> could use a check-in and <b>{summary.grading}</b> to grade.
      </>
    ) : (
      "Everyone's on track and nothing is waiting to be graded."
    );
  return summary.soon || summary.missing ? (
    <>
      You have <b>{`${summary.soon} thing${s(summary.soon)} due in the next 48 hours`}</b>
      {summary.missing ? (
        <>
          {" and "}
          <b>{`${summary.missing} missing`}</b>
        </>
      ) : null}
      .
    </>
  ) : (
    "Nothing due in the next two days."
  );
}

function BotRow({ children }) {
  return (
    <div className="msg bot">
      <div className="orb av">
        <span />
      </div>
      <div className="bubble">{children}</div>
    </div>
  );
}

function Item({ item }) {
  switch (item.kind) {
    case "user":
      return (
        <div className="msg user">
          <div className="bubble">{item.text}</div>
        </div>
      );
    case "bot":
      return <BotMessage text={item.text} streaming={item.streaming} />;
    case "typing":
      return (
        <BotRow>
          <div className="typing">
            <i />
            <i />
            <i />
          </div>
        </BotRow>
      );
    case "steps":
      return (
        <BotRow>
          <div className="steps">
            {item.steps.map((st) => (
              <div key={st.id} className={`step ${st.state}`}>
                <span className="dot">{st.state === "done" ? <Icon name="check" size={12} /> : st.state === "error" ? <Icon name="x" size={12} /> : null}</span>
                <span className="label">{st.state === "running" ? `${st.text}…` : st.text}</span>
              </div>
            ))}
          </div>
        </BotRow>
      );
    case "error":
      return (
        <BotRow>
          <div className={item.bubble ? "bubble error-text" : "error-text"}>{item.text}</div>
        </BotRow>
      );
    case "card":
      return <Card card={item.card} />;
    default:
      return null;
  }
}

function Card({ card }) {
  if (card.kind === "draft" || card.kind === "reply" || card.kind === "announcement") return <DraftCard draft={card} />;
  if (card.kind === "flashcards") return <FlashcardCard {...card} />;
  if (card.kind === "quiz") return <QuizCard {...card} />;
  if (card.kind === "library") return <LibraryCard {...card} />;
  return null;
}

function BotMessage({ text, streaming }) {
  const { toast } = useApp();
  return (
    <div className="msg bot">
      <div className="orb av">
        <span />
      </div>
      <div className={`bubble${streaming ? " cursor" : ""}`}>
        <div className="md" dangerouslySetInnerHTML={{ __html: markdown(text) }} />
        <div className="msg-tools">
          {!streaming && (
            <>
              <button onClick={() => speak(plainText(text))}>
                <Icon name="volume" size={14} /> Listen
              </button>
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(text);
                  toast("Copied", "Reply copied to clipboard.", { iconName: "copy" });
                }}
              >
                <Icon name="copy" size={14} /> Copy
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
