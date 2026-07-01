const KEY = "ot_favs";

export const favs = (() => {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) || "[]"));
  } catch {
    return new Set();
  }
})();

export function saveFavs() {
  try {
    localStorage.setItem(KEY, JSON.stringify([...favs]));
  } catch {}
}

export function updateFavBtn(s) {
  const b = document.getElementById("fav-btn");
  if (!b || !s) return;
  const saved = favs.has(s.id);
  b.textContent = saved ? "★" : "☆";
  b.classList.toggle("saved", saved);
  b.title = saved ? "Remove from favourites" : "Save to favourites";
}
