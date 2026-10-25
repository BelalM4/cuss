// Shared AI budget for live chats and scheduled/manual briefings.
import { getState, saveState, readAppJson, writeAppJson } from './store.js';

export function reserveAiUsage() {
  const today = new Date().toISOString().slice(0, 10);
  const state = getState();
  if (state.usageDay !== today) Object.assign(state, { usageDay: today, usageCount: 0 });
  const limit = Number(process.env.DAILY_MESSAGE_LIMIT) || 150;
  if (state.usageCount >= limit) {
    throw Object.assign(new Error(`You've reached today's limit of ${limit} AI requests, including briefings. It resets tomorrow.`), { status: 429 });
  }
  const totalLimit = Number(process.env.DAILY_TOTAL_LIMIT) || 0;
  const usage = readAppJson('usage.json', {});
  if (usage.day !== today) Object.assign(usage, { day: today, count: 0 });
  if (totalLimit && usage.count >= totalLimit) {
    throw Object.assign(new Error("Cuss has hit today's demo limit. Thanks for trying it! It resets tomorrow."), { status: 429 });
  }
  // These local JSON updates are synchronous, so another request cannot reserve
  // the same slot while this process is checking and incrementing the counters.
  usage.count++;
  state.usageCount++;
  writeAppJson('usage.json', usage);
  saveState(state);
}
