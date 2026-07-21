/**
 * Plain-language "how long ago" text for casual site visitors — no units
 * more precise than a minute, no jargon. Returns null for a null/undefined
 * date so each call site can pick its own honest "hasn't happened yet"
 * wording instead of this function baking in one answer.
 */
export function formatRelativeTime(date) {
  if (!date) return null;
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
