"use strict";
let cityMapLens = "count",
  cityDiscoveryIndex = -1;
const renderCityMapBase = renderMap;
renderMap = function (s, rows) {
  renderCityMapBase(s, rows);
  const gradient = document.querySelector("#map-gradient"),
    labels = document.querySelector("#map-scale-labels"),
    note = document.querySelector("#map-lens-note");
  if (cityMapLens === "count") {
    gradient.style.background =
      "linear-gradient(90deg,#d7e9f5,#75b2d7,#165a91)";
    labels.textContent = "Fewer reports";
    const span = document.createElement("span");
    span.textContent = "More reports";
    labels.append(span);
    note.textContent =
      "Click any community to connect the map, charts and filters.";
  } else {
    const scope = { ...s, year: "all" },
      prior = new Map(),
      current = new Map();
    DATA.filter((r) => matches(r, scope, true)).forEach((r) => {
      const dest = r.y === 2024 ? prior : current;
      dest.set(r.c, (dest.get(r.c) || 0) + r.n);
    });
    document.querySelectorAll("#map path").forEach((path) => {
      const id = +path.dataset.id,
        a = prior.get(id) || 0,
        b = current.get(id) || 0;
      const change = a ? (b - a) / a : null;
      const amount =
        change === null ? (b ? 1 : 0) : Math.min(Math.abs(change), 0.5) / 0.5;
      path.setAttribute(
        "fill",
        s.area === String(id)
          ? "#132f4b"
          : (!a && !b) || change === 0
            ? "#e4ebf0"
            : change !== null && change < 0
            ? `rgba(29,126,184,${0.15 + 0.8 * amount})`
            : `rgba(225,101,79,${0.15 + 0.8 * amount})`,
      );
      const description =
        change === null
          ? b
            ? "No 2024 baseline"
            : "No reports in either year"
          : `${change >= 0 ? "+" : ""}${(change * 100).toFixed(1)}%`;
      path.dataset.tip = `${areaName(id)}: ${description}; ${fmt(a)} in 2024 → ${fmt(b)} in 2025`;
      path.setAttribute("aria-label", path.dataset.tip);
    });
    gradient.style.background =
      "linear-gradient(90deg,#1d7eb8,#eef2f4,#e1654f)";
    labels.textContent = "Decrease";
    const span = document.createElement("span");
    span.textContent = "Increase";
    labels.append(span);
    note.textContent =
      "2025 vs. 2024 · same selected months, offense and flags. Shading saturates at ±50%; hover for exact counts. Areas without a 2024 baseline have no percentage change.";
  }
};
document.querySelectorAll("[data-map-lens]").forEach(
  (button) =>
    (button.onclick = () => {
      cityMapLens = button.dataset.mapLens;
      document.querySelectorAll("[data-map-lens]").forEach((b) => {
        b.classList.toggle("active", b === button);
        b.setAttribute("aria-pressed", String(b === button));
      });
      render();
    }),
);
document
  .querySelectorAll("[data-city-jump]")
  .forEach(
    (button) => (button.onclick = () => showView(button.dataset.cityJump)),
  );
document.querySelector("#discover-area").onclick = () => {
  const picks = [1, 22, 32, 41, 60, 25, 3, 15, 28, 77];
  cityDiscoveryIndex = (cityDiscoveryIndex + 1) % picks.length;
  document.querySelector("#area").value = String(picks[cityDiscoveryIndex]);
  render();
};
document.querySelector("#citywide-view").onclick = () => {
  document.querySelector("#area").value = "all";
  render();
};
