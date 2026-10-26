// Speech in and out: browser speech recognition and speech synthesis.
import { store } from "./util.js";

export const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

let recognizer = null;
let listening = false;
let finishListening = null; // ends the current listen early (the Done button)

export const isListening = () => listening;

// Listens until the student stops talking. Calls onText(transcript) while they
// speak and resolves with everything they said. Browsers (iPhone Safari above
// all) end recognition at the first pause and often never mark words "final",
// so Cuss keeps every word it hears, decides itself when the student is done
// (a short silence), and quietly restarts if the browser stops too early.
const SILENCE_MS = 1800; // pause that means "I'm done"
const NO_SPEECH_MS = 9000; // give up if nothing is said at all

export function listenOnce(onText = () => {}, toast) {
  return new Promise((resolve) => {
    if (!Recognition) {
      toast("Voice input isn't supported here", "Use Chrome, Edge or Safari to talk to Cuss. You can still type!", { iconName: "mic" });
      return resolve("");
    }
    stopSpeaking();
    let kept = ""; // words from earlier sessions, if the browser restarted
    let heard = ""; // words from the current session
    let done = false;
    let timer = null;
    let restarts = 0;
    const text = () => `${kept} ${heard}`.replace(/\s+/g, " ").trim();
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      finishListening = null;
      listening = false;
      try {
        recognizer?.stop();
      } catch {}
      resolve(text());
    };
    const wait = (ms) => {
      clearTimeout(timer);
      timer = setTimeout(finish, ms);
    };
    finishListening = finish;

    const startSession = () => {
      recognizer = new Recognition();
      recognizer.lang = navigator.language || "en-US";
      recognizer.interimResults = true;
      recognizer.continuous = true;
      recognizer.onresult = (e) => {
        let all = "";
        for (let i = 0; i < e.results.length; i++) all += e.results[i][0].transcript;
        heard = all;
        onText(text());
        wait(SILENCE_MS);
      };
      recognizer.onerror = (e) => {
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          toast("Microphone blocked", "Allow microphone access for this site in your browser settings, then tap to talk.", { iconName: "mic" });
          finish();
        } else if (e.error === "audio-capture") {
          toast("No microphone found", "Check that a microphone is connected and not in use by another app.", { iconName: "mic" });
          finish();
        }
      };
      recognizer.onend = () => {
        if (done) return;
        // The browser stopped on its own (a pause, or its time limit): keep what
        // was said and listen again until the student is actually finished.
        kept = text();
        heard = "";
        if (++restarts > 30) return finish();
        try {
          startSession();
        } catch {
          finish();
        }
      };
      recognizer.start();
    };

    try {
      startSession();
      listening = true;
      wait(NO_SPEECH_MS);
    } catch {
      finish();
    }
  });
}

export function stopListening() {
  if (finishListening) return finishListening();
  try {
    recognizer?.stop();
  } catch {}
}

export const getVoices = () => window.speechSynthesis?.getVoices() || [];

let speakToken = 0;
export function speak(text, onDone) {
  if (!("speechSynthesis" in window) || !text) return onDone?.();
  speechSynthesis.cancel();
  const token = ++speakToken;
  // Long replies are spoken in sentence-sized chunks (some browsers cut off long utterances).
  const chunks = text.match(/[^.!?\n]+[.!?]*\s*/g) || [text];
  const voice = getVoices().find((v) => v.name === store.get("voice", ""));
  let finished = false;
  const done = () => {
    if (finished || token !== speakToken) return;
    finished = true;
    onDone?.();
  };
  chunks.forEach((chunk, idx) => {
    const u = new SpeechSynthesisUtterance(chunk.trim());
    if (voice) u.voice = voice;
    u.rate = 1.04;
    if (idx === chunks.length - 1) u.onend = done;
    speechSynthesis.speak(u);
  });
  // Safety net: some browsers occasionally skip the "end" event.
  setTimeout(done, text.length * 75 + 2500);
}

export function stopSpeaking() {
  speakToken++;
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}
