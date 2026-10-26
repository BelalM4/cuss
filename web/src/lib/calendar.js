// iPhone Calendar and Reminders: native in the iPhone app (Capacitor), and
// .ics files, share sheets and calendar subscriptions on the web.
import { api, dayLabel, shortCourse } from "./util.js";

const isApple = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);
const nativeCal = () => window.Capacitor?.Plugins?.CapacitorCalendar;
const isLocal = (url) => /localhost|127\.0\.0\.1/.test(url);

function itemWhen(item) {
  if (item.remindAt) return new Date(item.remindAt);
  if (item.readBy) return new Date(item.readBy + "T09:00:00");
  return null;
}

export async function addToCalendar(toast, item, courseName = "") {
  if (!item.readBy && !item.remindAt) return toast("Pick a date first", "Set “Read by” or a reminder, then add it to your calendar.", { iconName: "calendar" });
  const native = nativeCal();
  if (native?.createEvent) {
    try {
      await native.requestFullCalendarAccess?.();
      const start = item.readBy ? new Date(item.readBy + "T00:00:00") : new Date(item.remindAt);
      await native.createEvent({
        title: item.kind === "task" ? item.title : `Read: ${item.title}`,
        startDate: start.getTime(),
        endDate: item.readBy ? start.getTime() + 864e5 : start.getTime() + 15 * 6e4,
        isAllDay: !!item.readBy,
        notes: courseName,
        alerts: item.readBy ? [-360] : [0],
      });
      return toast("Added to Calendar", item.title, { iconName: "calendar" });
    } catch {}
  }
  // iPhone Safari opens this as an event with an "Add to Calendar" button;
  // computers download it for Calendar, Outlook or Google Calendar.
  location.href = `/api/library/item/${item.id}/ics`;
}

export async function addToReminders(toast, item, courseName = "") {
  const when = itemWhen(item);
  const title = item.kind === "task" ? item.title : `Read: ${item.title}`;
  const native = nativeCal();
  if (native?.createReminder) {
    try {
      await native.requestFullRemindersAccess?.();
      await native.createReminder({ title, notes: courseName, dueDate: when?.getTime() });
      return toast("Added to Reminders", title, { iconName: "bell" });
    } catch {}
  }
  const text = `${title}${courseName ? ` (${shortCourse(courseName)})` : ""}${when ? `, ${item.readBy ? `by ${dayLabel(item.readBy)}` : when.toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}` : ""}`;
  if (navigator.share) {
    try {
      await navigator.share({ title, text });
      return;
    } catch (err) {
      if (err.name === "AbortError") return;
    }
  }
  await navigator.clipboard?.writeText(text).catch(() => {});
  toast("Copied", "Paste it into Reminders. In the iPhone app, Cuss adds it directly.", { iconName: "bell" });
}

// A private calendar link that keeps deadlines, readings and reminders in sync.
export async function subscribeCalendar(toast, { copyOnly = false, reset = false } = {}) {
  try {
    const { https, webcal } = await api("/api/calendar-link", { method: "POST", body: { reset } });
    if (reset) return toast("Old calendar link turned off", "Tap Add to iPhone Calendar again to subscribe with the new one.", { iconName: "calendar" });
    if (!copyOnly && isApple && !isLocal(https)) {
      location.href = webcal;
      toast("Opening Calendar", "Tap Subscribe. Deadlines, readings and reminders stay in sync.", { iconName: "calendar" });
    } else {
      await navigator.clipboard?.writeText(https).catch(() => {});
      toast("Calendar link copied", isLocal(https) ? "This link works once Cuss is online (not on localhost)." : "Google Calendar: Other calendars → From URL. Outlook: Add calendar → Subscribe from web.", { iconName: "calendar" });
    }
  } catch (err) {
    toast("Couldn't make a calendar link", err.message, { iconName: "alert" });
  }
}
