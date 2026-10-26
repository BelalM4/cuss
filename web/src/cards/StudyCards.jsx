// Flashcards and practice quizzes Cuss makes in chat.
import { useId, useState } from "react";
import { Icon, useApp } from "../ui.jsx";
import { api, confetti } from "../lib/util.js";
import { speak } from "../lib/speech.js";
import { CardHead } from "./DraftCard.jsx";

export function FlashcardCard({ title, cards }) {
  const deckId = useId();
  const [order, setOrder] = useState(() => (cards || []).map((_, i) => i));
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  if (!cards?.length) return <div className="card">No flashcards returned. Try asking again.</div>;

  const go = (n) => {
    setI((n + cards.length) % cards.length);
    setFlipped(false);
  };
  const c = cards[order[i]];
  const front = `question-${deckId}`;
  const back = `answer-${deckId}`;

  return (
    <div
      className="card"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget && !e.target.classList.contains("flashcard")) return;
        if (e.key === "ArrowRight") e.preventDefault(), go(i + 1);
        else if (e.key === "ArrowLeft") e.preventDefault(), go(i - 1);
      }}
    >
      <CardHead icon="layers" title={title}>
        <span className="chip">{`${cards.length} cards`}</span>
      </CardHead>
      <div className="card-body fc-wrap">
        <button type="button" className={`flashcard${flipped ? " flipped" : ""}`} aria-label={flipped ? "Show question" : "Show answer"} aria-pressed={String(flipped)} aria-describedby={flipped ? back : front} onClick={() => setFlipped(!flipped)}>
          <span className="flashcard-inner">
            <span className="flashcard-face front" id={front} aria-hidden={flipped ? "true" : undefined}>
              <small>Question</small>
              {c.front}
            </span>
            <span className="flashcard-face back" id={back} aria-hidden={flipped ? undefined : "true"}>
              <small>Answer</small>
              {c.back}
            </span>
          </span>
        </button>
        <div className="fc-progress">
          {cards.map((_, k) => (
            <i key={k} className={k === i ? "on" : undefined} />
          ))}
        </div>
      </div>
      <div className="card-actions">
        <button className="btn ghost small" aria-label="Previous flashcard" onClick={() => go(i - 1)}>
          <Icon name="left" size={15} />
        </button>
        <button className="btn small" onClick={() => go(i + 1)}>
          Next <Icon name="right" size={15} />
        </button>
        <button className="btn ghost small" title="Read aloud" onClick={() => speak(flipped ? c.back : c.front)}>
          <Icon name="volume" size={15} />
        </button>
        <button
          className="btn ghost small"
          title="Shuffle"
          onClick={() => {
            setOrder(order.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map((x) => x[1]));
            go(0);
          }}
        >
          <Icon name="shuffle" size={15} />
        </button>
        <span className="counter">{`${i + 1} / ${cards.length}`}</span>
      </div>
    </div>
  );
}

export function QuizCard({ title, questions }) {
  const { dash } = useApp();
  const [i, setI] = useState(0);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState(null);
  const finished = i >= questions.length;

  const next = () => {
    const n = i + 1;
    setI(n);
    setPicked(null);
    if (n >= questions.length) {
      api("/api/impact/quiz", { method: "POST", body: { score, total: questions.length } }).then(dash.loadImpact).catch(() => {});
      if (score === questions.length) confetti();
    }
  };
  const restart = () => {
    setI(0);
    setScore(0);
    setPicked(null);
  };

  let body;
  if (finished) {
    const ratio = score / questions.length;
    body = (
      <div className="score">
        <div className="score-num grad-text">{`${score}/${questions.length}`}</div>
        <p className="muted">{score === questions.length ? "Perfect score! You're ready. 🎉" : ratio >= 0.7 ? "Nice work! Review the ones you missed." : "Good practice. Let's go over the tricky ones."}</p>
        <button className="btn small" onClick={restart}>
          <Icon name="refresh" size={15} /> Try again
        </button>
      </div>
    );
  } else {
    const q = questions[i];
    const right = picked === q.answer_index;
    body = (
      <>
        <div className="quiz-q">{q.question}</div>
        {q.choices.map((choice, idx) => (
          <button
            key={idx}
            className={`choice${picked !== null && idx === q.answer_index ? " correct" : ""}${picked === idx && !right ? " wrong" : ""}`}
            disabled={picked !== null}
            onClick={() => {
              setPicked(idx);
              if (idx === q.answer_index) setScore(score + 1);
            }}
          >
            <span className="letter">{"ABCDEFG"[idx]}</span>
            <span>{choice}</span>
          </button>
        ))}
        {picked !== null && (
          <>
            <div className="explain">{(right ? "✓ Correct. " : "✗ Not quite. ") + (q.explanation || "")}</div>
            <button className="btn small" onClick={next}>
              {i + 1 < questions.length ? (
                <>
                  Next question <Icon name="right" size={15} />
                </>
              ) : (
                "See my score"
              )}
            </button>
          </>
        )}
      </>
    );
  }

  return (
    <div className="card">
      <CardHead icon="help" title={title}>
        <span className="chip">{`${questions.length} questions`}</span>
      </CardHead>
      <div className="card-body">
        <div className="progress">
          <div style={{ width: `${(Math.min(i, questions.length) / questions.length) * 100}%` }} />
        </div>
        <div>{body}</div>
      </div>
    </div>
  );
}
