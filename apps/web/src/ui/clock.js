import { $ } from "../state.js";

const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function updateClock(date) {
  const p = (n) => String(n).padStart(2, "0");
  const h24 = date.getUTCHours(),
    m = date.getUTCMinutes();
  const h12 = h24 % 12 || 12;
  $("#utc").innerHTML =
    `<span class="utc-full">${p(h24)}:${p(m)}:${p(date.getUTCSeconds())}<small>UTC</small></span>` +
    `<span class="utc-compact">${h12}:${p(m)}<small>UTC</small></span>`;
  $("#datestr").textContent =
    `${WD[date.getUTCDay()]} ${p(date.getUTCDate())} ${MON[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}
