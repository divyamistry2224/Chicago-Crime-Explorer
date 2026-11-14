"use strict";
const WORKSPACES = {
  overview: [
    "EXPLORE / ASK A BETTER QUESTION",
    "A closer look at Chicago.",
    "A linked view of reported incidents. Pick a starting point, then drill into the evidence.",
  ],
  temporal: [
    "TIME STUDIO / SCRUB · PLAY · DISCOVER",
    "Every month tells a story.",
    "Move through the year and inspect how the offense mix changes month by month.",
  ],
  communities: [
    "SPATIAL LAB / COMPARE · CONTEXTUALIZE",
    "Same city. Different patterns.",
    "Build a side-by-side comparison and investigate differences without confusing counts with risk.",
  ],
  data: [
    "DATA ENGINEERING / BREAK IT · FIX IT · QUERY IT",
    "The data pipeline, hands-on.",
    "Transform editable messy records, inspect the real quality audit, and test your SQL.",
  ],
  models: [
    "MODEL LAB / FIT · COMPARE · EXPLAIN",
    "A model is only the beginning.",
    "Choose a training boundary and regularization strength, then inspect actual out-of-time predictions.",
  ],
  assistant: [
    "GUIDED ANALYSIS / QUESTION · EVIDENCE · NEXT STEP",
    "What are you curious about?",
    "Build a scoped analytical question and follow the calculation back to the evidence.",
  ],
  project: [
    "PROJECT STUDIO / FOLLOW THE IMPLEMENTATION",
    "Take the project for a spin.",
    "Choose a professional lens, try a guided walkthrough, and download the code behind the work.",
  ],
  methods: [
    "RESEARCH DESK / UNDERSTAND THE ASSUMPTIONS",
    "Look under the numbers.",
    "Experiment with uncertainty, trace the data lineage, and understand what the measures can support.",
  ],
};
let lastWorkspace = null,
  pageScopes = {},
  timeTimer = null,
  experienceDaily = null,
  lastExperiment = null,
  fixtureOutput = [],
  briefings = [],
  tourIndex = -1,
  questionHistory = [];
const ANALYTICAL = ["overview", "temporal", "communities"];
const BASE_SCOPE = {
  year: "2025",
  type: "all",
  area: "all",
  arrest: "all",
  domestic: "all",
  from: 1,
  to: 12,
};
function applyScope(s) {
  for (let [k, sel] of Object.entries({
    year: "#year",
    type: "#type",
    area: "#area",
    arrest: "#arrest",
    domestic: "#domestic-filter",
    from: "#month-from",
    to: "#month-to",
  }))
    $(sel).value = String(s[k]);
}
window.routeWorkspace = function (next, preserve = false) {
  if (!WORKSPACES[next]) next = "overview";
  let changed = lastWorkspace !== next;
  if (window.advancedReady && changed) {
    if (lastWorkspace && ANALYTICAL.includes(lastWorkspace))
      pageScopes[lastWorkspace] = { ...state() };
    if (ANALYTICAL.includes(next) && !preserve) {
      applyScope(pageScopes[next] || BASE_SCOPE);
    }
    if (next === "assistant") applyScope(BASE_SCOPE);
    if (next === "temporal") {
      $("#area").value = "all";
      $("#arrest").value = "all";
      $("#domestic-filter").value = "all";
    }
  }
  document.body.dataset.view = next;
  let [eyebrow, name, description] = WORKSPACES[next];
  $("#workspace-eyebrow").textContent = eyebrow;
  $("#workspace-name").textContent = name;
  $("#workspace-description").textContent = description;
  $(".breadcrumb").innerHTML =
    "CHICAGO EXPLORER <span>/</span> " +
    esc(
      next === "overview"
        ? "CITY OVERVIEW"
        : name.replace(/[.]/g, "").toUpperCase(),
    );
  $("#workspace-actions").innerHTML =
    next === "project"
      ? '<a href="source.zip" download class="button">↓ Source project</a>'
      : next === "models"
        ? '<button class="button" id="workspace-download">↓ Benchmark JSON</button>'
        : next === "data"
          ? '<button class="button" id="workspace-download">↓ Quality report</button>'
          : '<span class="workspace-number">0' +
            ([
              "overview",
              "temporal",
              "communities",
              "data",
              "models",
              "assistant",
              "project",
              "methods",
            ].indexOf(next) +
              1) +
            " / 08</span>";
  let action = $("#workspace-download");
  if (action)
    action.onclick = () =>
      $(next === "models" ? "#model-export" : "#quality-export").click();
  if (changed) {
    stopTime();
    if (window.advancedReady) {
      window.scrollTo({ top: 0, behavior: "instant" });
      queueMicrotask(() => {
        render();
        refreshExperience(next);
      });
    }
  }
  lastWorkspace = next;
};
const priorRefresh = window.refreshAdvanced;
window.refreshAdvanced = function (v) {
  if (priorRefresh) priorRefresh(v);
  if (window.experienceReady) refreshExperience(v);
};
function refreshExperience(v) {
  if (v === "overview") renderOverviewTools();
  if (v === "temporal") renderTime();
  if (v === "communities") renderComparison();
  if (v === "methods") renderUncertainty();
}
function renderOverviewTools() {
  let s = state();
  $("#active-filter-chips").innerHTML = [
    s.year,
    s.type === "all" ? "All offenses" : title(s.type),
    s.area === "all" ? "Citywide" : areaName(s.area),
    months[s.from - 1] + "–" + months[s.to - 1],
  ]
    .map((x) => "<span>" + esc(x) + "</span>")
    .join("");
}
function stopTime() {
  if (timeTimer) clearInterval(timeTimer);
  timeTimer = null;
  $("#time-play").textContent = "▶ Play year";
  $("#time-play").setAttribute("aria-pressed", "false");
}
function renderTime() {
  let s = state(),
    m = +$("#time-slider").value,
    year = s.year === "all" ? "2024 + 2025" : s.year;
  let rows = DATA.filter(
      (r) =>
        (s.year === "all" || r.y === +s.year) &&
        (s.type === "all" || r.t === s.type),
    ),
    selected = rows.filter((r) => r.m === m),
    total = sum(selected),
    all = sum(rows),
    top = aggregate(selected, (r) => r.t).slice(0, 7);
  $("#time-year-label").textContent = year;
  $("#time-month-label").textContent = new Date(2025, m - 1, 1).toLocaleString(
    "en-US",
    { month: "long" },
  );
  $("#time-records").innerHTML =
    "<strong>" + fmt(total) + "</strong><span>reports this month</span>";
  $("#time-insight").textContent = top.length
    ? `${months[m - 1]} accounts for ${pct(total / all)} of this full-year selection. ${title(top[0][0])} leads with ${fmt(top[0][1])} reports. ${s.year === "all" ? "Both years are combined." : ""}`
    : "No reports match this month and offense.";
  $("#month-rail").innerHTML = months
    .map(
      (name, i) =>
        `<button class="${m === i + 1 ? "active" : ""}" data-month="${i + 1}" aria-pressed="${m === i + 1}">${name}</button>`,
    )
    .join("");
  $$("#month-rail button").forEach(
    (b) =>
      (b.onclick = () => {
        $("#time-slider").value = b.dataset.month;
        renderTime();
      }),
  );
  if (window.Plotly) {
    Plotly.react(
      "time-race",
      [
        {
          x: top.map((r) => r[1]).reverse(),
          y: top.map((r) => title(r[0])).reverse(),
          type: "bar",
          orientation: "h",
          marker: {
            color: top.map((_, i) =>
              i === top.length - 1 ? "#118c7a" : "#85b3a5",
            ),
          },
          hovertemplate: "%{y}: %{x:,} reports<extra></extra>",
        },
      ],
      {
        ...chartLayout,
        height: 270,
        margin: { l: 150, r: 15, t: 12, b: 35 },
        xaxis: { ...chartLayout.xaxis, title: "Incident reports" },
        yaxis: { ...chartLayout.yaxis, automargin: true },
        transition: { duration: 250 },
      },
      plotConfig,
    );
    let vals = months.map((_, i) => sum(rows.filter((r) => r.m === i + 1)));
    Plotly.react(
      "time-context",
      [
        {
          x: months,
          y: vals,
          type: "bar",
          marker: {
            color: months.map((_, i) => (i === m - 1 ? "#ef987b" : "#7ca6c5")),
          },
          hovertemplate: "%{x}: %{y:,} reports<extra></extra>",
        },
      ],
      {
        ...chartLayout,
        height: 270,
        margin: { l: 50, r: 15, t: 12, b: 35 },
        yaxis: { ...chartLayout.yaxis, rangemode: "tozero" },
      },
      plotConfig,
    );
    let plot = $("#time-context");
    if (plot.on) {
      plot.removeAllListeners("plotly_click");
      plot.on("plotly_click", (e) => {
        let i = months.indexOf(e.points[0].x);
        if (i >= 0) {
          $("#time-slider").value = String(i + 1);
          renderTime();
        }
      });
    }
  }
}
function renderComparison() {
  let s = state(),
    a = +$("#compare-a").value,
    b = +$("#compare-b").value;
  if (!a || !b) return;
  let all = DATA.filter((r) => matches(r, { ...s, area: "all" }, true)),
    ra = all.filter((r) => r.c === a),
    rb = all.filter((r) => r.c === b),
    total = sum(all),
    colors = ["#078c7b", "#9a6dd1"];
  $("#compare-cards").innerHTML = [
    [a, ra],
    [b, rb],
  ]
    .map(([id, rows], i) => {
      let n = sum(rows),
        ar = sum(rows.filter((r) => r.a)),
        dom = sum(rows.filter((r) => r.d)),
        ci = wilson(ar, n);
      return `<article class="comparison-card side-${i}"><div class="eyebrow">COMMUNITY ${i ? "B" : "A"} / ${id}</div><h3>${esc(areaName(id))}</h3><strong>${fmt(n)}</strong><span class="compare-unit">reported incidents</span><div class="comparison-details"><div><b>${n ? pct(ar / n) : "—"}</b><span>arrest recorded</span></div><div><b>${n ? pct(dom / n) : "—"}</b><span>domestic flag</span></div><div><b>${total ? pct(n / total) : "—"}</b><span>share of city selection</span></div></div><small>Arrest proportion 95% Wilson interval: ${n ? pct(ci[0]) + "–" + pct(ci[1]) : "no records"}</small></article>`;
    })
    .join("");
  if (window.Plotly) {
    let range = months.slice(s.from - 1, s.to);
    Plotly.react(
      "compare-trend",
      [
        [a, ra],
        [b, rb],
      ].map(([id, rows], i) => ({
        x: range,
        y: range.map((_, j) => sum(rows.filter((r) => r.m === s.from + j))),
        name: areaName(id),
        mode: "lines+markers",
        line: { color: colors[i], width: 3 },
      })),
      {
        ...chartLayout,
        height: 300,
        yaxis: { ...chartLayout.yaxis, title: "Monthly reports" },
        title: { text: "Same months, shared definitions", font: { size: 13 } },
      },
      plotConfig,
    );
    let categories = aggregate([...ra, ...rb], (r) => r.t)
      .slice(0, 6)
      .map((r) => r[0]);
    Plotly.react(
      "compare-profile",
      [
        [a, ra],
        [b, rb],
      ].map(([id, rows], i) => ({
        x: categories.map(title),
        y: categories.map((t) => sum(rows.filter((r) => r.t === t))),
        name: areaName(id),
        type: "bar",
        marker: { color: colors[i] },
      })),
      {
        ...chartLayout,
        height: 300,
        barmode: "group",
        margin: { l: 45, r: 10, t: 35, b: 95 },
        title: { text: "Offense composition · counts", font: { size: 13 } },
        xaxis: { ...chartLayout.xaxis, tickangle: -25, tickfont: { size: 8 } },
      },
      plotConfig,
    );
  }
}
const FIXTURE_COLUMNS = ["id", "date", "primary_type", "latitude", "longitude"];
const FIXTURE_DEFAULTS = [
  ["101", "01/15/2025 08:30:00 AM", "  theft  ", "41.88", "-87.63"],
  ["102", "2025-02-30T10:00:00", "BATTERY", "41.78", "-87.64"],
  ["101", "2025-01-15T08:30:00", "THEFT", "41.88", "-87.63"],
  ["103", "2025-03-08T15:20:00", "motor   vehicle theft", "0", "0"],
  ["104", "03/09/2025 06:10:00 PM", "  burglary", "41.92", "-87.71"],
  ["105", "not a date", "ASSAULT", "41.81", "-87.62"],
  ["106", "2025-04-02T12:00:00", "criminal damage", "", ""],
];
function resetFixtures() {
  $("#fixture-grid").innerHTML =
    "<table><thead><tr>" +
    FIXTURE_COLUMNS.map((c) => "<th>" + c.replaceAll("_", " ") + "</th>").join(
      "",
    ) +
    "</tr></thead><tbody>" +
    FIXTURE_DEFAULTS.map(
      (row, i) =>
        "<tr>" +
        row
          .map(
            (v, j) =>
              `<td><input value="${esc(v)}" data-fixture-row="${i}" data-fixture-col="${j}" aria-label="Row ${i + 1} ${FIXTURE_COLUMNS[j]}"></td>`,
          )
          .join("") +
        "</tr>",
    ).join("") +
    "</tbody></table>";
  $("#cleaning-result").innerHTML =
    '<div class="empty-state">Edit a record or choose a rule, then run the transformation.</div>';
  $("#fixture-export").disabled = true;
}
function runFixtures() {
  let flags = {
      date: $("#rule-date").checked,
      category: $("#rule-category").checked,
      duplicate: $("#rule-duplicate").checked,
      geo: $("#rule-geo").checked,
    },
    seen = new Set(),
    quarantined = 0,
    changes = 0;
  fixtureOutput = [];
  let results = FIXTURE_DEFAULTS.map((_, i) => {
    let row = FIXTURE_COLUMNS.map(
        (_, j) => $(`[data-fixture-row="${i}"][data-fixture-col="${j}"]`).value,
      ),
      notes = [],
      status = "Accepted";
    if (flags.date) {
      let date = parseIncidentDate(row[1]);
      if (date) {
        if (date !== row[1]) {
          changes++;
          notes.push("Date standardized");
        }
        row[1] = date;
      } else {
        status = "Quarantined";
        notes.push("Invalid date");
      }
    }
    if (flags.duplicate && status === "Accepted") {
      if (seen.has(row[0])) {
        status = "Quarantined";
        notes.push("Duplicate ID");
      } else seen.add(row[0]);
    }
    if (flags.category) {
      let t = row[2].trim().toUpperCase().replace(/\s+/g, " ") || "UNKNOWN";
      if (t !== row[2]) {
        changes++;
        notes.push("Category standardized");
      }
      row[2] = t;
    }
    if (flags.geo) {
      let lat = row[3].trim() ? Number(row[3]) : NaN,
        lon = row[4].trim() ? Number(row[4]) : NaN;
      if (!(lat >= 41.6 && lat <= 42.1 && lon >= -87.95 && lon <= -87.5)) {
        row[3] = row[4] = "";
        changes++;
        notes.push("Coordinates nulled");
      }
    }
    if (status === "Quarantined") quarantined++;
    else fixtureOutput.push([...row]);
    if (!flags.date) notes.push("Date validation OFF");
    if (!flags.duplicate) notes.push("Deduplication OFF");
    return [...row, status, notes.join(" · ") || "Unchanged"];
  });
  $("#cleaning-result").innerHTML =
    `<div class="transformation-summary"><span><b>${fixtureOutput.length}</b> accepted</span><span><b>${quarantined}</b> quarantined</span><span><b>${changes}</b> field transformations</span><span class="tag">${Object.values(flags).filter(Boolean).length}/4 rules enabled</span></div>` +
    tableHTML([...FIXTURE_COLUMNS, "status", "audit trail"], results) +
    '<p class="small-note">Accepted means it passed the enabled rules. Turning validation off can retain invalid dates or duplicates; it does not make the data valid. Coordinate bounding-box checks do not verify precise locations.</p>';
  $("#fixture-export").disabled = fixtureOutput.length === 0;
  $("#run-cleaning").textContent = "✓ Transformation complete";
  setTimeout(
    () => ($("#run-cleaning").textContent = "▶ Run transformation"),
    1400,
  );
}
const CHALLENGES = {
  total: {
    question: "Write a query that returns the total number of reports in 2025.",
    answer: 238222,
  },
  months: {
    question:
      "Return the number of distinct year/month combinations in the snapshot.",
    answer: 24,
  },
  theft: {
    question: "Return the total number of THEFT reports in 2025.",
    answer: null,
  },
};
function checkChallenge() {
  let task = CHALLENGES[$("#sql-challenge").value],
    expected =
      task.answer ?? sum(DATA.filter((r) => r.y === 2025 && r.t === "THEFT"));
  let ok =
    sqlResult &&
    sqlResult.values.length === 1 &&
    sqlResult.values[0].length === 1 &&
    Number(sqlResult.values[0][0]) === expected;
  $("#challenge-status").textContent = ok
    ? "✓ Verified against the source snapshot."
    : "Not verified yet. Run SQL below, then return here to check one numeric result.";
  $("#challenge-status").className = ok ? "verified" : "pending";
}
async function dailySeries() {
  if (experienceDaily) return experienceDaily;
  let response = await fetch("daily.json");
  if (!response.ok) throw Error("Daily source snapshot could not load.");
  let rows = await response.json(),
    map = new Map();
  rows.forEach((r) => {
    let day = r.day.slice(0, 10);
    map.set(day, (map.get(day) || 0) + Number(r.n));
  });
  experienceDaily = [...map]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, n]) => ({ date, n }));
  return experienceDaily;
}
function experimentFeatures(daily, i) {
  let weekday = (new Date(daily[i].date + "T00:00:00Z").getUTCDay() + 6) % 7,
    yearStart = Date.UTC(+daily[i].date.slice(0, 4), 0, 1),
    doy = (Date.parse(daily[i].date) - yearStart) / 86400000 + 1;
  return [
    ...[1, 7, 14, 28].map((k) => daily[i - k].n),
    daily.slice(i - 7, i).reduce((a, r) => a + r.n, 0) / 7,
    daily.slice(i - 28, i).reduce((a, r) => a + r.n, 0) / 28,
    Math.sin((2 * Math.PI * weekday) / 7),
    Math.cos((2 * Math.PI * weekday) / 7),
    Math.sin((2 * Math.PI * doy) / 365.25),
    Math.cos((2 * Math.PI * doy) / 365.25),
    i,
  ];
}
function solveSystem(a, b) {
  let n = b.length,
    rows = a.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let pivot = c;
    for (let r = c + 1; r < n; r++)
      if (Math.abs(rows[r][c]) > Math.abs(rows[pivot][c])) pivot = r;
    [rows[c], rows[pivot]] = [rows[pivot], rows[c]];
    if (Math.abs(rows[c][c]) < 1e-10)
      throw Error("Singular model matrix; increase regularization.");
    let v = rows[c][c];
    for (let j = c; j <= n; j++) rows[c][j] /= v;
    for (let r = 0; r < n; r++)
      if (r !== c) {
        let f = rows[r][c];
        for (let j = c; j <= n; j++) rows[r][j] -= f * rows[c][j];
      }
  }
  return rows.map((row) => row[n]);
}
function fitRidgeExperiment(daily, cutoff, alpha, horizon) {
  let train = [],
    test = [];
  for (let i = 28; i < daily.length; i++) {
    let row = {
      ...daily[i],
      x: experimentFeatures(daily, i),
      baseline: daily[i - 7].n,
    };
    if (row.date <= cutoff) train.push(row);
    else if (test.length < horizon) test.push(row);
  }
  if (train.length < 60 || !test.length)
    throw Error("This cutoff has too little training or evaluation data.");
  let p = train[0].x.length,
    means = Array.from(
      { length: p },
      (_, j) => train.reduce((a, r) => a + r.x[j], 0) / train.length,
    ),
    std = means.map(
      (m, j) =>
        Math.sqrt(
          train.reduce((a, r) => a + (r.x[j] - m) ** 2, 0) / train.length,
        ) || 1,
    ),
    ymean = train.reduce((a, r) => a + r.n, 0) / train.length,
    A = Array.from({ length: p }, () => Array(p).fill(0)),
    B = Array(p).fill(0);
  train.forEach((row) => {
    let x = row.x.map((v, j) => (v - means[j]) / std[j]);
    for (let j = 0; j < p; j++) {
      B[j] += x[j] * (row.n - ymean);
      for (let k = 0; k < p; k++) A[j][k] += x[j] * x[k];
    }
  });
  for (let j = 0; j < p; j++) A[j][j] += alpha;
  let coef = solveSystem(A, B),
    predictions = test.map((row) => ({
      ...row,
      prediction: Math.max(
        0,
        ymean +
          row.x.reduce((a, v, j) => a + ((v - means[j]) / std[j]) * coef[j], 0),
      ),
    }));
  let mae =
      predictions.reduce((a, r) => a + Math.abs(r.n - r.prediction), 0) /
      test.length,
    baseline =
      predictions.reduce((a, r) => a + Math.abs(r.n - r.baseline), 0) /
      test.length,
    rmse = Math.sqrt(
      predictions.reduce((a, r) => a + (r.n - r.prediction) ** 2, 0) /
        test.length,
    );
  return {
    cutoff,
    alpha,
    horizon: test.length,
    train_days: train.length,
    features: [
      "Lag 1",
      "Lag 7",
      "Lag 14",
      "Lag 28",
      "Prior mean 7",
      "Prior mean 28",
      "Weekday sin",
      "Weekday cos",
      "Annual sin",
      "Annual cos",
      "Elapsed days",
    ],
    coefficients: coef,
    predictions,
    mae,
    baseline_mae: baseline,
    rmse,
  };
}
async function runExperiment() {
  let button = $("#experiment-run");
  button.disabled = true;
  $("#experiment-status").textContent =
    "Loading the snapshot and fitting the training window…";
  try {
    await new Promise((r) => setTimeout(r, 20));
    let daily = await dailySeries(),
      cutoff = $("#experiment-cutoff").value,
      alpha = 10 ** Number($("#experiment-alpha").value),
      horizon = +$("#experiment-horizon").value;
    lastExperiment = fitRidgeExperiment(daily, cutoff, alpha, horizon);
    let r = lastExperiment,
      improvement = 100 * (1 - r.mae / r.baseline_mae);
    $("#experiment-result").innerHTML =
      `<div class="experiment-metrics"><div><span>MODEL MAE</span><strong>${r.mae.toFixed(2)}</strong><small>reports per day</small></div><div><span>WEEKLY BASELINE MAE</span><strong>${r.baseline_mae.toFixed(2)}</strong><small>reports per day</small></div><div><span>RELATIVE DIFFERENCE</span><strong>${Math.abs(improvement).toFixed(1)}%</strong><small>${improvement >= 0 ? "lower" : "higher"} error than baseline</small></div><div><span>TRAIN / EVALUATE</span><strong>${r.train_days} / ${r.horizon}</strong><small>days, chronological split</small></div></div><div class="experiment-plots"><div id="live-predictions" class="plot-medium"></div><div id="live-coefficients" class="plot-medium"></div></div><button id="experiment-export" class="text-button">↓ Download this experiment</button>`;
    if (window.Plotly) {
      Plotly.react(
        "live-predictions",
        [
          {
            x: r.predictions.map((x) => x.date),
            y: r.predictions.map((x) => x.n),
            name: "Observed",
            line: { color: "#3f526c", width: 2 },
          },
          {
            x: r.predictions.map((x) => x.date),
            y: r.predictions.map((x) => x.prediction),
            name: "Ridge prediction",
            line: { color: "#297bad", width: 2 },
          },
          {
            x: r.predictions.map((x) => x.date),
            y: r.predictions.map((x) => x.baseline),
            name: "Weekly naive",
            line: { color: "#bac5cf", width: 1, dash: "dot" },
          },
        ],
        {
          ...chartLayout,
          height: 290,
          title: { text: "Held-out daily observations", font: { size: 12 } },
          margin: { l: 45, r: 10, t: 35, b: 55 },
        },
        plotConfig,
      );
      let cc = r.coefficients
        .map((v, i) => ({ v, name: r.features[i] }))
        .sort((a, b) => Math.abs(b.v) - Math.abs(a.v))
        .slice(0, 7)
        .reverse();
      Plotly.react(
        "live-coefficients",
        [
          {
            x: cc.map((x) => x.v),
            y: cc.map((x) => x.name),
            type: "bar",
            orientation: "h",
            marker: { color: cc.map((x) => (x.v < 0 ? "#e99275" : "#6ba4cb")) },
          },
        ],
        {
          ...chartLayout,
          height: 290,
          title: {
            text: "Standardized coefficients · not causal effects",
            font: { size: 12 },
          },
          margin: { l: 105, r: 10, t: 35, b: 55 },
        },
        plotConfig,
      );
    }
    $("#experiment-export").onclick = () =>
      exportJSON("chicago-live-ridge-experiment.json", {
        ...r,
        note: "Exploratory retrospective tuning sandbox; observed prior-day incident counts; no untouched test-set claim.",
      });
    $("#experiment-status").textContent =
      `✓ Model fitted · α=${alpha} · training through ${cutoff} · evaluation ${r.predictions[0].date}–${r.predictions.at(-1).date} · training-only standardization`;
  } catch (e) {
    $("#experiment-status").textContent = e.message;
  } finally {
    button.disabled = false;
  }
}
function renderUncertainty() {
  let n = +$("#uncertainty-n").value,
    p = +$("#uncertainty-p").value,
    k = Math.round((n * p) / 100),
    ci = wilson(k, n);
  $("#uncertainty-n-label").textContent = fmt(n);
  $("#uncertainty-p-label").textContent = p + "%";
  $("#uncertainty-result").innerHTML =
    `<div class="uncertainty-number"><strong>${pct(ci[0])}–${pct(ci[1])}</strong><span>95% Wilson interval · ${fmt(k)} / ${fmt(n)} synthetic records</span></div><div class="interval-scale"><div class="interval-track" style="left:${100 * ci[0]}%;width:${100 * (ci[1] - ci[0])}%"></div><i style="left:${(100 * k) / n}%"></i></div><div class="interval-labels"><span>0%</span><span>50%</span><span>100%</span></div>`;
}
function saveBriefing() {
  let s = state(),
    n = sum(DATA.filter((r) => matches(r, s)));
  briefings.push({
    saved: new Date().toISOString(),
    scope: { ...s },
    reports: n,
    arrest_share: $("#arrest-rate").textContent,
    summary: $("#scope").textContent,
  });
  try {
    localStorage.setItem("chicago-briefings-v3", JSON.stringify(briefings));
  } catch (e) {}
  renderBriefings();
  $("#briefing-panel").hidden = false;
}
function renderBriefings() {
  $("#briefing-count").textContent = String(briefings.length);
  $("#briefing-panel").innerHTML =
    '<div class="briefing-heading"><h3>Your saved investigation notes</h3><button id="briefing-export" class="text-button">↓ Export briefing</button></div>' +
    (briefings.length
      ? briefings
          .map(
            (b, i) =>
              `<div class="briefing-item"><span><b>${fmt(b.reports)} reports</b><small>${esc(b.summary)}</small></span><button data-restore="${i}" class="text-button">Reopen ↗</button><button data-delete="${i}" class="text-button" aria-label="Remove saved view">×</button></div>`,
          )
          .join("")
      : '<p class="small-note">Save a filtered view to build a small research briefing. Notes stay in this browser.</p>');
  $$("[data-restore]").forEach(
    (b) =>
      (b.onclick = () => {
        applyScope(briefings[+b.dataset.restore].scope);
        render();
      }),
  );
  $$("[data-delete]").forEach(
    (b) =>
      (b.onclick = () => {
        briefings.splice(+b.dataset.delete, 1);
        try {
          localStorage.setItem(
            "chicago-briefings-v3",
            JSON.stringify(briefings),
          );
        } catch (e) {}
        renderBriefings();
      }),
  );
  $("#briefing-export").onclick = () =>
    exportJSON("chicago-investigation-briefing.json", {
      source: "City of Chicago ijzp-q8t2",
      snapshot: "2026-11-12",
      views: briefings,
    });
}
const TOUR = [
  [
    "overview",
    "Start with a question",
    "Click a category bar or a community on the map. Watch the linked charts and totals respond.",
  ],
  [
    "communities",
    "Make a comparison",
    "Choose two different communities, inspect their monthly curves, and compare offense composition.",
  ],
  [
    "data",
    "Test the pipeline",
    "Edit an invalid fixture and run the cleaning transformation. Then try a SQL challenge.",
  ],
  [
    "models",
    "Run an experiment",
    "Change the training cutoff or regularization strength. Fit the model and inspect its held-out errors.",
  ],
  [
    "project",
    "Trace it back to the code",
    "Switch between the role lenses or download the source to inspect the Python, SQL, Dash and ML implementation.",
  ],
];
function advanceTour() {
  tourIndex++;
  if (tourIndex >= TOUR.length) {
    $("#tour-dock").hidden = true;
    tourIndex = -1;
    return;
  }
  let [v, title, description] = TOUR[tourIndex];
  showView(v);
  $("#tour-dock").hidden = false;
  $("#tour-step").textContent =
    `GUIDED WALKTHROUGH / ${tourIndex + 1} OF ${TOUR.length}`;
  $("#tour-title").textContent = title;
  $("#tour-description").textContent = description;
  $("#tour-next").textContent =
    tourIndex === TOUR.length - 1 ? "Finish walkthrough ✓" : "Next stop →";
}
let commandIndex = 0,
  commandActions = [];
function renderCommands() {
  let term = $("#command-search").value.toLowerCase();
  commandActions = Object.entries(WORKSPACES).filter(([key, parts]) =>
    (key + " " + parts.join(" ")).toLowerCase().includes(term),
  );
  commandIndex = 0;
  $("#command-results").innerHTML = commandActions
    .map(
      ([key, parts], i) =>
        `<button class="command-option ${i === 0 ? "selected" : ""}" data-command="${key}"><span>${esc(parts[1])}</span><small>${esc(parts[0])}</small><b>↗</b></button>`,
    )
    .join("");
  $$("[data-command]").forEach(
    (b) =>
      (b.onclick = () => {
        showView(b.dataset.command);
        $("#command-palette").close();
      }),
  );
}
function openCommands() {
  let dialog = $("#command-palette");
  dialog.showModal();
  $("#command-search").value = "";
  renderCommands();
  $("#command-search").focus();
}
let experienceBootAttempts = 0;
function bootExperience() {
  if (!window.advancedReady) {
    if (experienceBootAttempts++ < 300) setTimeout(bootExperience, 100);
    return;
  }
  $("#compare-a").innerHTML = NAMES.slice(1)
    .map((n, i) => `<option value="${i + 1}">${esc(n)}</option>`)
    .join("");
  $("#compare-b").innerHTML = $("#compare-a").innerHTML;
  $("#compare-a").value = "32";
  $("#compare-b").value = "25";
  $("#compare-a").onchange = renderComparison;
  $("#compare-b").onchange = renderComparison;
  $("#compare-swap").onclick = () => {
    let a = $("#compare-a").value;
    $("#compare-a").value = $("#compare-b").value;
    $("#compare-b").value = a;
    renderComparison();
  };
  $("#time-slider").oninput = renderTime;
  $("#time-play").onclick = () => {
    if (timeTimer) {
      stopTime();
      return;
    }
    if (+$("#time-slider").value === 12) $("#time-slider").value = "1";
    $("#time-play").textContent = "Ⅱ Pause";
    $("#time-play").setAttribute("aria-pressed", "true");
    renderTime();
    timeTimer = setInterval(() => {
      let m = +$("#time-slider").value;
      if (m >= 12) {
        stopTime();
        return;
      }
      $("#time-slider").value = String(m + 1);
      renderTime();
    }, 1100);
  };
  $("#fixture-reset").onclick = resetFixtures;
  resetFixtures();
  $("#run-cleaning").onclick = runFixtures;
  $("#fixture-export").onclick = () =>
    csvDownload(
      "transformed-synthetic-fixtures.csv",
      FIXTURE_COLUMNS,
      fixtureOutput,
    );
  $("#sql-challenge").onchange = () => {
    $("#challenge-question").textContent =
      CHALLENGES[$("#sql-challenge").value].question;
    $("#challenge-status").textContent = "";
  };
  $("#challenge-check").onclick = checkChallenge;
  $("#experiment-alpha").oninput = () =>
    ($("#alpha-label").textContent = (
      10 ** Number($("#experiment-alpha").value)
    ).toLocaleString("en-US", { maximumFractionDigits: 2 }));
  $("#experiment-run").onclick = runExperiment;
  $("#uncertainty-n").oninput = renderUncertainty;
  $("#uncertainty-p").oninput = renderUncertainty;
  try {
    briefings = JSON.parse(
      localStorage.getItem("chicago-briefings-v3") || "[]",
    );
    if (!Array.isArray(briefings)) briefings = [];
  } catch (e) {
    briefings = [];
  }
  renderBriefings();
  $("#pin-view").onclick = saveBriefing;
  $("#show-briefing").onclick = () =>
    ($("#briefing-panel").hidden = !$("#briefing-panel").hidden);
  $$("[data-mission]").forEach(
    (b) =>
      (b.onclick = () => {
        let mission = b.dataset.mission;
        if (mission === "theft") {
          showView("temporal");
          $("#type").value = "THEFT";
          render();
        } else if (mission === "compare") showView("communities");
        else showView("models");
      }),
  );
  $("#question-type").innerHTML = $("#type").innerHTML;
  $("#question-build").onclick = () => {
    let intent = $("#question-intent").value,
      type = $("#question-type").value,
      year = $("#question-year").value;
    let question =
      intent === "trend"
        ? `What changed in ${type === "all" ? "all offense" : type.toLowerCase()} reports in ${year}?`
        : intent === "community"
          ? `Which communities have the most ${type === "all" ? "" : type.toLowerCase()} reports in ${year}?`
          : intent === "arrest"
            ? `What proportion of ${type === "all" ? "" : type.toLowerCase()} reports have an arrest in ${year}?`
            : `What are the leading offenses in ${year}?`;
    applyScope({ ...BASE_SCOPE, year, type });
    $("#ask-input").value = question;
    answerQuestion(question);
  };
  let oldAnswer = answerQuestion;
  answerQuestion = function (question) {
    oldAnswer(question);
    questionHistory.unshift(question);
    questionHistory = questionHistory.slice(0, 6);
    $("#question-history").innerHTML = questionHistory
      .map((q, i) => `<button data-history="${i}">${esc(q)}</button>`)
      .join("");
    $$("[data-history]").forEach(
      (b) =>
        (b.onclick = () => {
          $("#ask-input").value = questionHistory[+b.dataset.history];
          oldAnswer($("#ask-input").value);
        }),
    );
  };
  $("#tour-start").onclick = () => {
    tourIndex = -1;
    advanceTour();
  };
  $("#tour-next").onclick = advanceTour;
  $("#tour-close").onclick = () => {
    $("#tour-dock").hidden = true;
    tourIndex = -1;
  };
  $("#command-open").onclick = openCommands;
  $("#command-close").onclick = () => $("#command-palette").close();
  $("#command-search").oninput = renderCommands;
  $("#command-search").onkeydown = (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      commandIndex =
        (commandIndex +
          (e.key === "ArrowDown" ? 1 : -1) +
          commandActions.length) %
        Math.max(1, commandActions.length);
      $$(".command-option").forEach((b, i) =>
        b.classList.toggle("selected", i === commandIndex),
      );
    }
    if (e.key === "Enter" && commandActions[commandIndex]) {
      showView(commandActions[commandIndex][0]);
      $("#command-palette").close();
    }
  };
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      openCommands();
    }
  });
  $(".brand").onclick = (e) => {
    e.preventDefault();
    showView("overview");
  };
  window.addEventListener("popstate", () => {
    let destination = location.hash.slice(1);
    showView(WORKSPACES[destination] ? destination : "overview");
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopTime();
  });
  const explanations = [
    "Source layer: an independently retrieved complete aggregate snapshot plus a separately labeled 10,000-row convenience sample. Raw IDs are never used to estimate city totals.",
    "Normalization layer: parse dates, canonicalize labels, deduplicate IDs, preserve unknown flags, null invalid geography, and quarantine invalid required fields. Try the editable fixture exercise above.",
    "Validation layer: full aggregate schema and key checks, cross-table reconciliation, sampled missingness, and unit tests. View the measured quality scorecard below.",
    "Serving layer: versioned browser artifacts, read-only SQLite queries, the local Plotly Dash companion and documented model evaluation. Source code is downloadable from Project studio.",
  ];
  let flow = $(".pipeline-flow");
  flow.insertAdjacentHTML(
    "afterend",
    '<div id="lineage-explanation" class="local-note" role="status">Click a pipeline stage to inspect its implementation.</div>',
  );
  [...flow.children]
    .filter((x) => x.tagName === "DIV")
    .forEach((el, i) => {
      el.tabIndex = 0;
      el.setAttribute("role", "button");
      el.setAttribute("aria-label", "Inspect pipeline stage " + (i + 1));
      const activate = () => {
        $("#lineage-explanation").textContent = explanations[i];
      };
      el.onclick = activate;
      el.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          activate();
        }
      };
    });
  window.experienceReady = true;
  routeWorkspace(view, true);
  refreshExperience(view);
}
bootExperience();
