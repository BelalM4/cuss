// Shared building blocks: icons, toasts, modal dialogs and the app context.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

// Same Lucide-style strokes as public/icons.js (it exposes window.iconPaths).
export function Icon({ name, size = 18 }) {
  return (
    <svg className="ic" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={window.iconPaths?.[name] || ""} />
    </svg>
  );
}

// Everything components need from the app: the student's status, sending a
// message, opening chats and classes, toasts and dashboard refreshes.
export const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

// --- Toasts

export function useToasts() {
  const [toasts, setToasts] = useState([]);
  const dismiss = useCallback((id) => {
    setToasts((all) => all.map((t) => (t.id === id ? { ...t, out: true } : t)));
    setTimeout(() => setToasts((all) => all.filter((t) => t.id !== id)), 300);
  }, []);
  const toast = useCallback(
    (title, body, { iconName = "sparkles", onclick } = {}) => {
      const id = crypto.randomUUID();
      setToasts((all) => [...all, { id, title, body, iconName, onclick }]);
      setTimeout(() => dismiss(id), 7000);
    },
    [dismiss],
  );
  return { toasts, toast, dismiss };
}

export function Toasts({ toasts, dismiss }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast${t.out ? " out" : ""}`} onClick={t.onclick} style={t.onclick ? { cursor: "pointer" } : undefined}>
          <div className="ti">
            <Icon name={t.iconName} size={16} />
          </div>
          <div className="toast-text">
            <b>{t.title}</b>
            <span>{t.body || ""}</span>
          </div>
          <button
            type="button"
            className="toast-close"
            aria-label="Dismiss notification"
            onClick={(e) => {
              e.stopPropagation();
              dismiss(t.id);
            }}
          >
            <Icon name="x" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

// --- A native <dialog> opened as a modal while `open` is true.

export function Modal({ open, onClose, children, closeOnBackdrop = false, ...props }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      {...props}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClose={() => open && onClose()}
      onClick={closeOnBackdrop ? (e) => e.target === ref.current && onClose() : undefined}
    >
      {children}
    </dialog>
  );
}

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const m = matchMedia(query);
    const on = () => setMatches(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [query]);
  return matches;
}

// A progress bar that grows in after it appears.
export function GrowBar({ percent }) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setWidth(Math.min(100, percent ?? 0)), 60);
    return () => clearTimeout(t);
  }, [percent]);
  return <div style={{ width: `${width}%` }} />;
}

// A list that shows a skeleton while loading and a retry link on errors.
export function Loadable({ as: Tag = "ul", className, state, error, retry, skeletons = 1, short = false, children, ...props }) {
  return (
    <Tag className={className} aria-busy={state === "loading" ? "true" : "false"} {...props}>
      {state === "error" ? (
        <li className="load-error">
          <span>{error}</span>
          <button type="button" className="link-btn" onClick={retry}>
            Try again
          </button>
        </li>
      ) : state === "loading" && !children ? (
        Array.from({ length: skeletons }, (_, i) => (
          <li key={i} className={`skeleton${short ? " short" : ""}`} aria-hidden="true">
            <span className="skeleton-line" />
            <span className="skeleton-line narrow" />
          </li>
        ))
      ) : (
        children
      )}
    </Tag>
  );
}
