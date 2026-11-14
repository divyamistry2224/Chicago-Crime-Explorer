"use strict";
// Enhancements use the same canonical DATA and shared filter state as the explorer.
let QUALITY = null,
  MODELS = null,
  sqlWorker = null,
  sqlReady = false,
  sqlTimer = null,
  sqlResult = null,
  cleanedPreview = [];
const chartLayout = {
  font: { family: "Public Sans, Arial", size: 11, color: "#5e7186" },
  paper_bgcolor: "transparent",
  plot_bgcolor: "transparent",
  margin: { l: 45, r: 14, t: 10, b: 35 },
  xaxis: { gridcolor: "#e5ebf0", zeroline: false },
  yaxis: { gridcolor: "#e5ebf0", zeroline: false },
  legend: { orientation: "h", x: 0, y: -0.2 },
  hovermode: "x unified",
};
const plotConfig = {
  responsive: true,
  displaylogo: false,
  modeBarButtonsToRemove: ["lasso2d", "select2d"],
  toImageButtonOptions: { format: "png", scale: 2 },
};
window.plotlyTrend = function (s) {
  let both = DATA.filter((r) => matches(r, s, false, true)),
    xx = months.slice(s.from - 1, s.to),
    factor = metric === "rate" ? 100000 / 2746388 : 1;
  let traces = [2024, 2025].map((y) => ({
    x: xx,
    y: series(both, y)
      .slice(s.from - 1, s.to)
      .map((x) => x * factor),
    name: String(y),
    type: "scatter",
    mode: "lines+markers",
    line: {
      color: y === 2025 ? "#1775ac" : "#a7bdcf",
      width: s.year === String(y) || s.year === "all" ? 2.8 : 1.5,
      dash: y === 2024 ? "dash" : "solid",
    },
    marker: { size: 5 },
    fill: y === 2025 ? "tozeroy" : "none",
    fillcolor: "rgba(29,133,102,.055)",
    hovertemplate: `%{x} ${y}: %{y:,.1f}${metric === "rate" ? " per 100k" : " reports"}<extra></extra>`,
  }));
  Plotly.react(
    "trend",
    traces,
    {
      ...chartLayout,
      height: 245,
      margin: { l: 43, r: 10, t: 12, b: 45 },
      showlegend: false,
      xaxis: { ...chartLayout.xaxis, fixedrange: false },
      yaxis: {
        ...chartLayout.yaxis,
        title: {
          text: metric === "rate" ? "Per 100,000" : "Incidents",
          font: { size: 9 },
        },
        rangemode: "tozero",
      },
    },
    plotConfig,
  );
  $("#rate-note").textContent =
    metric === "rate"
      ? "* Fixed 2020 city population: 2,746,388."
      : "Hover, drag to zoom, or download chart as PNG.";
};
function exportJSON(name, obj) {
  download(name, JSON.stringify(obj, null, 2), "application/json");
}
function tableHTML(cols, rows) {
  return (
    "<table><thead><tr>" +
    cols.map((c) => "<th>" + esc(c) + "</th>").join("") +
    "</tr></thead><tbody>" +
    rows
      .map(
        (row) =>
          "<tr>" +
          row
            .map((v) => "<td>" + esc(v == null ? "NULL" : v) + "</td>")
            .join("") +
          "</tr>",
      )
      .join("") +
    "</tbody></table>"
  );
}
async function loadQuality() {
  if (QUALITY) return;
  QUALITY = { loading: true };
  try {
    let response = await fetch("quality.json");
    if (!response.ok) throw Error("Quality report unavailable");
    QUALITY = await response.json();
    let full = QUALITY.aggregate_audit || {},
      checks = QUALITY.checks || {};
    $("#quality-cards").innerHTML = [
      [fmt(full.incidents || sum(DATA)), "full-city records"],
      [fmt(QUALITY.input_records), "sample rows checked"],
      [fmt(QUALITY.quarantined_records), "sample quarantines"],
      [fmt(checks.missing_coordinates || 0), "sample missing locations"],
    ]
      .map(([n, l]) => `<div><strong>${n}</strong><small>${l}</small></div>`)
      .join("");
    $("#quality-checks").innerHTML = tableHTML(
      ["Validation", "Result", "Scope"],
      [
        [
          "Incident / temporal totals",
          full.totals_reconcile ? "PASS · reconciled" : "Review audit",
          "Full snapshot",
        ],
        [
          "Unique aggregate dimension keys",
          full.unique_keys ? "PASS" : "Review audit",
          "Full snapshot",
        ],
        [
          "Count and dimension schema",
          full.schema_valid ? "PASS" : "Review audit",
          "Full snapshot",
        ],
        [
          "Sample input = accepted + quarantined",
          QUALITY.reconciled ? "PASS" : "FAIL",
          "10,000-row sample",
        ],
        [
          "Sample unknown community",
          fmt(checks.unknown_community || 0) + " rows",
          "Retained as Unknown",
        ],
        [
          "Sample missing coordinates",
          fmt(checks.missing_coordinates || 0) + " rows",
          "Retained, coordinates null",
        ],
        [
          "Sample duplicate IDs",
          fmt(checks.duplicate_id || 0) + " rows",
          "First valid record retained",
        ],
      ],
    );
    $("#sample-scope").textContent = QUALITY.sample_scope;
    $("#quality-export").onclick = () =>
      exportJSON("chicago-data-quality.json", QUALITY);
  } catch (e) {
    QUALITY = { error: true };
    $("#sample-scope").textContent = e.message;
  }
}
async function loadModels() {
  if (MODELS) {
    if (!MODELS.loading && !MODELS.error) renderModels();
    return;
  }
  MODELS = { loading: true };
  try {
    let r = await fetch("models.json");
    if (!r.ok) throw Error("Model artifact unavailable");
    MODELS = await r.json();
    $("#feature-tags").innerHTML = MODELS.features
      .map((f) => "<span>" + esc(f.replaceAll("_", " ")) + "</span>")
      .join("");
    $("#model-export").onclick = () =>
      exportJSON("chicago-model-experiment.json", MODELS);
    renderModels();
  } catch (e) {
    MODELS = { error: true };
    $("#model-summary").textContent = e.message;
  }
}
function renderModels() {
  if (!MODELS || MODELS.loading || MODELS.error) return;
  let key = $("#model-metric").value,
    entries = Object.entries(MODELS.overall).sort(
      (a, b) => a[1][key] - b[1][key],
    ),
    max = Math.max(...entries.map((e) => e[1][key])),
    f = (v) => (key === "wape" ? pct(v) : v.toFixed(2));
  $("#model-bars").innerHTML = entries
    .map(
      ([name, m]) =>
        `<div class="benchmark-row"><div><b>${esc(name)}</b><span>${f(m[key])}</span></div><div class="bar-track"><div class="bar-fill" style="width:${(100 * m[key]) / max}%"></div></div></div>`,
    )
    .join("");
  let winner = entries[0],
    base = MODELS.overall["Weekly naive"][key],
    improve = (base - winner[1][key]) / base;
  $("#model-summary").textContent =
    `${winner[0]} has the lowest observed ${key.toUpperCase()} across the fixed 2025 evaluation windows (${pct(improve)} lower than the weekly naive baseline). This is a descriptive benchmark result, not evidence of future superiority. Hyperparameters were fixed, not tuned on these test windows.`;
  $("#fold-table").innerHTML = tableHTML(
    [
      "Quarter",
      "Train through",
      "Test days",
      ...entries.map((e) => e[0] + " " + key.toUpperCase()),
    ],
    MODELS.folds.map((fold, i) => [
      "Q" + (i + 1) + " 2025",
      fold.train_end,
      fold.test_days,
      ...entries.map(([n]) => f(fold.scores[n][key])),
    ]),
  );
  let name = $("#model-select").value,
    fold = $("#fold-select").value,
    rows = MODELS.predictions.filter(
      (r) => r.model === name && (fold === "all" || r.fold_start === fold),
    );
  if (window.Plotly) {
    Plotly.react(
      "prediction-chart",
      [
        {
          x: rows.map((r) => r.date),
          y: rows.map((r) => r.actual),
          name: "Observed",
          mode: "lines",
          line: { color: "#183b59", width: 1.5 },
        },
        {
          x: rows.map((r) => r.date),
          y: rows.map((r) => r.prediction),
          name: name,
          mode: "lines",
          line: { color: "#ed725f", width: 1.5 },
        },
      ],
      {
        ...chartLayout,
        height: 320,
        yaxis: { ...chartLayout.yaxis, title: "Daily incidents" },
        xaxis: { ...chartLayout.xaxis, type: "date" },
      },
      plotConfig,
    );
    Plotly.react(
      "residual-chart",
      [
        {
          x: rows.map((r) => r.date),
          y: rows.map((r) => r.actual - r.prediction),
          type: "bar",
          name: "Observed − predicted",
          marker: {
            color: rows.map((r) =>
              r.actual - r.prediction >= 0 ? "#3a8fbd" : "#d0a276",
            ),
          },
        },
      ],
      {
        ...chartLayout,
        height: 180,
        showlegend: false,
        yaxis: { ...chartLayout.yaxis, title: "Residual" },
        xaxis: { ...chartLayout.xaxis, type: "date" },
      },
      plotConfig,
    );
  }
  let threshold = +$("#anomaly-threshold").value,
    flags = MODELS.anomalies
      .filter((r) => Math.abs(r.z) >= threshold)
      .sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
  $("#anomaly-results").innerHTML =
    '<p class="small-note">' +
    flags.length +
    " days flagged across 2024–2025. Showing up to 30, ordered by absolute deviation.</p>" +
    tableHTML(
      [
        "Date",
        "Reported incidents",
        "Prior 28-day mean",
        "Standardized deviation",
      ],
      flags
        .slice(0, 30)
        .map((r) => [
          r.date,
          fmt(r.count),
          r.expected.toFixed(1),
          r.z.toFixed(2),
        ]),
    );
}
window.refreshAdvanced = function (v) {
  if (v === "data") loadQuality();
  if (v === "models") loadModels();
  if (v === "project") renderRole(currentRole);
};
const SQL_PRESETS = {
  offenses:
    "SELECT primary_type, SUM(n) AS incidents\nFROM incidents\nGROUP BY primary_type\nORDER BY incidents DESC\nLIMIT 10",
  arrests:
    "SELECT primary_type, SUM(n) AS incidents,\n ROUND(100.0*SUM(CASE WHEN arrest=1 THEN n ELSE 0 END)/SUM(n),2) AS arrest_pct\nFROM incidents WHERE year=2025\nGROUP BY primary_type ORDER BY incidents DESC",
  months:
    "SELECT year, month, SUM(n) AS incidents\nFROM incidents\nGROUP BY year, month ORDER BY year, month",
  community:
    "SELECT community_area, SUM(n) AS incidents\nFROM incidents WHERE year=2025\nGROUP BY community_area ORDER BY incidents DESC LIMIT 20",
};
function sqlFailure(message) {
  clearTimeout(sqlTimer);
  $("#run-sql").disabled = false;
  $("#sql-status").textContent = message;
  if (sqlWorker) sqlWorker.terminate();
  sqlWorker = null;
  sqlReady = false;
}
function runSQL() {
  let sql = $("#sql-editor").value.trim().replace(/;\s*$/, "");
  if (!/^(select|with)\b/i.test(sql) || sql.includes(";")) {
    $("#sql-status").textContent = "Enter one read-only SELECT or WITH query.";
    return;
  }
  $("#run-sql").disabled = true;
  $("#sql-status").textContent = sqlReady
    ? "Running query…"
    : "Preparing SQLite database…";
  let start = performance.now();
  sqlTimer = setTimeout(
    () =>
      sqlFailure(
        "Query exceeded 10 seconds. Simplify the query and try again.",
      ),
    10000,
  );
  function send() {
    sqlWorker.postMessage({ type: "query", sql });
  }
  if (!sqlWorker) {
    sqlWorker = new Worker("sql-worker.js");
    sqlWorker.onmessage = (e) => {
      if (e.data.type === "ready") {
        sqlReady = true;
        send();
        return;
      }
      clearTimeout(sqlTimer);
      $("#run-sql").disabled = false;
      if (e.data.error) {
        $("#sql-status").textContent = "Query error: " + e.data.error;
        return;
      }
      sqlResult = e.data.result;
      $("#sql-results").innerHTML = tableHTML(
        sqlResult.columns,
        sqlResult.values,
      );
      $("#sql-status").textContent =
        `${sqlResult.values.length} rows · ${((performance.now() - start) / 1000).toFixed(2)}s · capped at 1,000`;
      $("#sql-export").disabled = false;
    };
    sqlWorker.onerror = (e) => sqlFailure("SQLite could not run: " + e.message);
    sqlWorker.postMessage({
      type: "init",
      rows: DATA.map((r) => [r.y, r.m, r.t, r.c, +r.a, +r.d, r.n]),
    });
  } else send();
}
function csvRows(text) {
  let rows = [],
    row = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    let c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (!cell || quoted) quoted = !quoted;
      else cell += c;
    } else if (c === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted) throw Error("CSV has an unclosed quoted field.");
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
function parseIncidentDate(value) {
  let iso =
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/.exec(
      value.trim(),
    );
  let us =
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i.exec(
      value.trim(),
    );
  let y,
    m,
    d,
    h = 0,
    mi = 0,
    se = 0;
  if (iso) {
    [, y, m, d, h = 0, mi = 0, se = 0] = iso;
    [y, m, d, h, mi, se] = [y, m, d, h, mi, se].map(Number);
  } else if (us) {
    m = +us[1];
    d = +us[2];
    y = +us[3];
    h = +(us[4] || 0);
    mi = +(us[5] || 0);
    se = +(us[6] || 0);
    if (us[7]) {
      if (h < 1 || h > 12) return null;
      h = (h % 12) + (us[7].toUpperCase() === "PM" ? 12 : 0);
    }
  } else return null;
  let date = new Date(Date.UTC(y, m - 1, d, h, mi, se));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d ||
    h > 23 ||
    mi > 59 ||
    se > 59
  )
    return null;
  return date.toISOString().slice(0, 19);
}
function boolValue(s) {
  if (/^(true|1|yes|y)$/i.test(String(s).trim())) return true;
  if (/^(false|0|no|n)$/i.test(String(s).trim())) return false;
  return null;
}
async function inspectCSV(file) {
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) {
    $("#upload-report").textContent =
      "File exceeds 20 MB. Split it locally or use the Python pipeline.";
    return;
  }
  $("#upload-report").textContent = "Parsing and validating locally…";
  $("#cleaned-download").hidden = true;
  cleanedPreview = [];
  try {
    let rows = csvRows((await file.text()).replace(/^\uFEFF/, "")),
      headers = (rows.shift() || []).map((x) =>
        x.trim().toLowerCase().replaceAll(" ", "_"),
      );
    if (!headers.includes("date") || !headers.includes("primary_type"))
      throw Error("Required columns Date and Primary Type are missing.");
    let counts = {
        inspected: Math.min(rows.length, 50000),
        invalid_date: 0,
        duplicate_id: 0,
        unknown_area: 0,
        missing_or_invalid_location: 0,
        missing_category: 0,
        unknown_flags: 0,
      },
      seen = new Set();
    for (let i = 0; i < counts.inspected; i++) {
      let r = Object.fromEntries(headers.map((h, j) => [h, rows[i][j] || ""])),
        date = parseIncidentDate(r.date);
      if (!date) {
        counts.invalid_date++;
        continue;
      }
      let id = (r.id || "").trim();
      if (id && seen.has(id)) {
        counts.duplicate_id++;
        continue;
      }
      if (id) seen.add(id);
      let type = r.primary_type.trim().toUpperCase().replace(/\s+/g, " ");
      if (!type) {
        type = "UNKNOWN";
        counts.missing_category++;
      }
      let area = Number(r.community_area);
      if (!Number.isInteger(area) || area < 1 || area > 77) {
        area = 0;
        counts.unknown_area++;
      }
      let lat = r.latitude?.trim() ? Number(r.latitude) : NaN,
        lon = r.longitude?.trim() ? Number(r.longitude) : NaN;
      if (!(lat >= 41.6 && lat <= 42.1 && lon >= -87.95 && lon <= -87.5)) {
        lat = lon = null;
        counts.missing_or_invalid_location++;
      }
      let a = boolValue(r.arrest),
        d = boolValue(r.domestic);
      if (a === null || d === null) counts.unknown_flags++;
      cleanedPreview.push([date, type, area, a, d, lat, lon]);
    }
    $("#upload-report").innerHTML =
      "<h3>" +
      fmt(cleanedPreview.length) +
      " rows accepted for preview</h3>" +
      tableHTML(
        ["Check", "Rows"],
        [
          ["Inspected", fmt(counts.inspected)],
          ["Invalid dates quarantined", fmt(counts.invalid_date)],
          ["Duplicate nonempty IDs quarantined", fmt(counts.duplicate_id)],
          ["Unknown community retained as 0", fmt(counts.unknown_area)],
          ["Coordinates nulled", fmt(counts.missing_or_invalid_location)],
          ["Missing category → UNKNOWN", fmt(counts.missing_category)],
          ["Rows with unknown flags", fmt(counts.unknown_flags)],
        ],
      ) +
      `<p class="small-note">${rows.length > 50000 ? "Only the first 50,000 rows were inspected. " : ""}Duplicate detection is possible only when IDs are provided. No file was uploaded to a server. The main dashboard remains the official snapshot.</p>`;
    $("#cleaned-download").hidden = cleanedPreview.length === 0;
  } catch (e) {
    $("#upload-report").textContent = e.message;
  }
}
function csvDownload(name, cols, rows) {
  let q = (v) => '"' + String(v ?? "").replaceAll('"', '""') + '"';
  download(
    name,
    "\ufeff" + [cols, ...rows].map((r) => r.map(q).join(",")).join("\r\n"),
    "text/csv;charset=utf-8",
  );
}
function analyzeQuestion(question) {
  if (
    /\b(?:19|20)\d{2}\b/.test(question) &&
    [...question.matchAll(/\b(?:19|20)\d{2}\b/g)].some(
      (m) => !["2024", "2025"].includes(m[0]),
    )
  )
    return {
      heading: "That year is outside this snapshot",
      answer:
        "This project includes only 2024 and 2025. Ask about a supported year to get a grounded answer.",
      formula: "No query executed",
      scope: "2024–2025 snapshot only",
      state: state(),
      target: "methods",
    };
  let q = question.toLowerCase(),
    years = [...q.matchAll(/\b(202[45])\b/g)].map((m) => m[1]),
    s = { ...state() },
    typeCandidates = [...new Set(DATA.map((r) => r.t))].sort(
      (a, b) => b.length - a.length,
    );
  let crime = typeCandidates.find((t) => q.includes(t.toLowerCase()));
  if (!crime && /\btheft\b/.test(q)) crime = "THEFT";
  if (crime) s.type = crime;
  if (/all offenses|all offense|all records/.test(q)) s.type = "all";
  if (years.length === 1) s.year = years[0];
  let mentioned = NAMES.findIndex(
    (n) => n !== "Unknown" && q.includes(n.toLowerCase()),
  );
  if (mentioned > 0) s.area = String(mentioned);
  let rows = DATA.filter((r) => matches(r, s)),
    n = sum(rows),
    scope = `${s.year === "all" ? "2024–2025" : s.year}, ${months[s.from - 1]}–${months[s.to - 1]}, ${s.type === "all" ? "all offenses" : title(s.type)}, ${s.area === "all" ? "citywide" : areaName(s.area)}, arrest=${s.arrest}, domestic=${s.domestic}`;
  let heading,
    answer,
    formula,
    target = "overview";
  if (/chang|trend|compar|increas|decreas/.test(q)) {
    let a = sum(DATA.filter((r) => matches(r, { ...s, year: "2024" }))),
      b = sum(DATA.filter((r) => matches(r, { ...s, year: "2025" })));
    heading = "Calendar-aligned change";
    answer = `There were ${fmt(a)} reports in 2024 and ${fmt(b)} in 2025 for this month window and filter selection. ${a ? "The descriptive change was " + (((b - a) / a) * 100).toFixed(1) + "%." : "No 2024 baseline exists for a percentage change."} Source revisions and reporting differences limit interpretation.`;
    formula = "100 × (2025 count − 2024 count) / 2024 count";
    scope = scope.replace(/2024–2025|2024|2025/, "2024 versus 2025");
  } else if (/communit|geograph|area|where/.test(q)) {
    rows = DATA.filter((r) => matches(r, s, true));
    let top = aggregate(rows, (r) => r.c)
      .filter(([c]) => c > 0)
      .slice(0, 3);
    heading = "Leading communities by count";
    answer =
      top
        .map(([c, count]) => areaName(c) + ": " + fmt(count) + " reports")
        .join("; ") +
      ". These are counts, not population-adjusted crime rates or a safety ranking.";
    formula =
      "SUM(incident_count) grouped by community; community filter ignored for comparison";
    target = "communities";
  } else if (/arrest/.test(q)) {
    let a = sum(rows.filter((r) => r.a)),
      ci = wilson(a, n);
    heading = "Recorded arrest proportion";
    answer = n
      ? `${fmt(a)} of ${fmt(n)} selected reports (${pct(a / n)}) have arrest=true. The 95% Wilson interval is ${pct(ci[0])}–${pct(ci[1])}. This is not a conviction or case-clearance rate.`
      : "No records match the selected filters.";
    formula =
      "SUM(count WHERE arrest=true) / SUM(count); Wilson interval z=1.96";
  } else if (/leading|offense|categor|most|top/.test(q)) {
    heading = "Leading offense categories";
    answer =
      aggregate(rows, (r) => r.t)
        .slice(0, 3)
        .map(
          ([t, count]) =>
            title(t) + ": " + fmt(count) + " (" + pct(count / n) + ")",
        )
        .join("; ") + ".";
    formula = "SUM(incident_count) grouped by primary_type, descending";
  } else {
    heading = "Choose a supported analysis";
    answer =
      "Try a question about changes over time, leading offenses, community counts or arrest proportions. Years 2024/2025, exact offense labels and community names are recognized. This interface does not generate arbitrary answers.";
    formula = "No query executed";
  }
  return { heading, answer, formula, scope, state: s, target };
}
function answerQuestion(q) {
  let result = analyzeQuestion(q);
  $("#assistant-answer").innerHTML =
    `<div class="answer-card"><div class="eyebrow">REPRODUCIBLE ANSWER</div><h2>${esc(result.heading)}</h2><p>${esc(result.answer)}</p><div class="answer-scope"><b>Scope</b> ${esc(result.scope)}</div><details><summary>Show calculation</summary><code>${esc(result.formula)}</code><p>Source: City of Chicago ijzp-q8t2 · snapshot retrieved November 12, 2026. Dashboard filters are retained unless the question explicitly names a year, offense, or community.</p></details><button class="primary-button" id="open-evidence">Open supporting view →</button><button class="text-button" id="download-answer">↓ Download answer</button></div>`;
  $("#open-evidence").onclick = () => {
    let s = result.state;
    $("#year").value = s.year;
    $("#type").value = s.type;
    $("#area").value = s.area;
    showView(result.target, true);
    render();
  };
  $("#download-answer").onclick = () =>
    exportJSON("chicago-analysis-answer.json", {
      question: q,
      ...result,
      source: "City of Chicago ijzp-q8t2",
      retrieved: "2026-11-12",
      engine: "Deterministic rules; no language model",
    });
}
let currentRole = "engineering";
const ROLE_STORIES = {
  engineering: {
    title: "Make the path from source to metric inspectable.",
    skills:
      "Python · SQL · data contracts · idempotent extraction · dimensional aggregates",
    text: "The pipeline extracts public incident records and independent citywide aggregates. Normalization parses dates, canonicalizes categories, validates coordinates and community codes, preserves unknown flags and quarantines invalid records. SQLite stores deduplicated silver records and exposes a monthly gold view. Audits reconcile counts across aggregate representations.",
    files: "pipeline/extract.py · pipeline/prepare.py · tests/test_pipeline.py",
    evidence: "Explore Data & SQL lab",
    view: "data",
  },
  analytics: {
    title: "Turn shared definitions into linked reporting.",
    skills:
      "Plotly · Dash · KPI design · geospatial reporting · accessible interaction",
    text: "One shared filter state drives city totals, monthly series, offense composition, community comparison and exports. A 77-area map and category bars act as filters. Month windows, arrest and domestic flags help users inspect well-defined subsets; scope labels explicitly mark aggregates that use only some filters.",
    files: "dist/app.js · dist/advanced.js · dash_app/app.py",
    evidence: "Explore the dashboard",
    view: "overview",
  },
  science: {
    title: "Evaluate aggregate forecasts with a temporal boundary.",
    skills:
      "Feature engineering · scikit-learn · time series · baseline comparison · error analysis",
    text: "The fixed experiment compares weekly naive, standardized ridge regression and gradient boosting on daily citywide incident counts. Four chronological evaluation folds expand the training window. Features use only lagged counts, shifted rolling summaries and calendar information. MAE, RMSE, WAPE, residuals and a model card expose assumptions and failure modes.",
    files: "pipeline/models.py · tests/test_models.py · dist/models.json",
    evidence: "Inspect ML evaluation",
    view: "models",
  },
  ai: {
    title: "Design a grounded question-to-analysis experience.",
    skills:
      "Intent routing · structured analytics · provenance · transparent responses · human review",
    text: "The insight assistant routes supported questions to deterministic calculations on the same snapshot. It returns the scope, a calculation trace, source attribution and a link to the supporting view. It demonstrates grounded analytics interface design; it is not an LLM, RAG system, agent or trained language model.",
    files: "dist/advanced.js / analyzeQuestion · answerQuestion",
    evidence: "Ask a supported question",
    view: "assistant",
  },
};
function renderRole(role) {
  let story = ROLE_STORIES[role];
  if (!story) return;
  $("#role-story").innerHTML =
    `<div class="eyebrow">${esc(story.skills)}</div><h2>${esc(story.title)}</h2><p class="role-description">${esc(story.text)}</p><div class="schema-note">Implementation: <code>${esc(story.files)}</code></div><button id="role-evidence" class="primary-button">${esc(story.evidence)} →</button>`;
  $("#role-evidence").onclick = () => showView(story.view);
}
let bootAttempts = 0;
function bootAdvanced() {
  if (!window.dashboardReady) {
    if (bootAttempts++ < 300) setTimeout(bootAdvanced, 100);
    return;
  }
  let params = new URLSearchParams(location.search);
  for (const [k, sel] of Object.entries({
    year: "#year",
    type: "#type",
    area: "#area",
    arrest: "#arrest",
    domestic: "#domestic-filter",
    from: "#month-from",
    to: "#month-to",
  })) {
    let value = params.get(k);
    if (value !== null && [...$(sel).options].some((o) => o.value === value))
      $(sel).value = value;
  }
  $("#month-from").onchange = render;
  $("#month-to").onchange = render;
  $("#domestic-filter").onchange = render;
  $("#share-view").onclick = async () => {
    let s = state(),
      u = new URL(location.href);
    u.search = new URLSearchParams(s).toString();
    u.hash = view;
    try {
      await navigator.clipboard.writeText(u.href);
      $("#filter-message").textContent = "Filtered link copied.";
    } catch (e) {
      $("#filter-message").textContent = "Copy this filtered link: " + u.href;
    }
  };
  $("#print-report").onclick = () => window.print();
  $("#sql-editor").value = SQL_PRESETS.offenses;
  $("#sql-example").onchange = () =>
    ($("#sql-editor").value = SQL_PRESETS[$("#sql-example").value]);
  $("#run-sql").onclick = runSQL;
  $("#sql-export").onclick = () => {
    if (sqlResult)
      csvDownload(
        "chicago-sql-result.csv",
        sqlResult.columns,
        sqlResult.values,
      );
  };
  $("#csv-upload").onchange = (e) => inspectCSV(e.target.files[0]);
  $("#cleaned-download").onclick = () =>
    csvDownload(
      "chicago-cleaned-preview.csv",
      [
        "date",
        "primary_type",
        "community_area",
        "arrest",
        "domestic",
        "latitude",
        "longitude",
      ],
      cleanedPreview,
    );
  [
    "#model-metric",
    "#model-select",
    "#fold-select",
    "#anomaly-threshold",
  ].forEach((sel) => ($(sel).onchange = renderModels));
  $("#ask-form").onsubmit = (e) => {
    e.preventDefault();
    answerQuestion($("#ask-input").value);
  };
  $$(".prompt-chips button").forEach(
    (b) =>
      (b.onclick = () => {
        $("#ask-input").value = b.textContent;
        answerQuestion(b.textContent);
      }),
  );
  $$(".role-tabs button").forEach(
    (b) =>
      (b.onclick = () => {
        currentRole = b.dataset.role;
        $$(".role-tabs button").forEach((x) =>
          x.classList.toggle("active", x === b),
        );
        renderRole(currentRole);
      }),
  );
  renderRole(currentRole);
  render();
  window.advancedReady = true;
}
// Month controls must exist before the initial async source fetch resolves.
$("#month-from").innerHTML = months
  .map((m, i) => `<option value="${i + 1}">${m}</option>`)
  .join("");
$("#month-to").innerHTML = $("#month-from").innerHTML;
$("#month-from").value = "1";
$("#month-to").value = "12";
bootAdvanced();
