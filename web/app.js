"use strict";

const state = {
  plan: null,
  selected: new Set(),
  crops: new Map(),
  plantingsByCrop: new Map(),
};

const dayMs = 86_400_000;

const parseISO = (iso) => new Date(`${iso}T00:00:00Z`);
const pad = (value) => String(value).padStart(2, "0");

function todayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function addDays(iso, days) {
  const date = parseISO(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function diffDays(from, to) {
  return Math.round((parseISO(to).getTime() - parseISO(from).getTime()) / dayMs);
}

function weekIndex(iso) {
  return Math.floor(diffDays(state.plan.settings.startDate, iso) / 7);
}

function formatDay(iso) {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(parseISO(iso));
}

function formatFull(iso) {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(parseISO(iso));
}

function formatWeekday(iso) {
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "short",
    timeZone: "UTC",
  }).format(parseISO(iso));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
  });
}

function unique(values) {
  return [...new Set(values)];
}

/**
 * Plan file for this page load. The default is data/plan.json.
 * A demo variant may pass ?plan=plan-gaps.
 * Only simple file names are accepted, so the page cannot read other paths.
 */
function planPath() {
  const requested = new URLSearchParams(location.search).get("plan");
  if (!requested) return "data/plan.json";
  const name = requested.replace(/\.json$/i, "");
  if (!/^[a-z0-9-]+$/i.test(name)) return "data/plan.json";
  return `data/${name}.json`;
}

async function init() {
  try {
    const response = await fetch(planPath(), { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const plan = await response.json();

    state.plan = plan;
    state.selected = new Set(plan.settings.selectedCropIds);
    state.crops = new Map(plan.crops.map((crop) => [crop.id, crop]));
    state.plantingsByCrop = new Map();
    for (const planting of plan.plantings) {
      const list = state.plantingsByCrop.get(planting.cropId) ?? [];
      list.push(planting);
      state.plantingsByCrop.set(planting.cropId, list);
    }

    renderAll();
    registerServiceWorker();
  } catch (error) {
    document.getElementById("site-name").textContent = "The plan did not load";
    document.getElementById("site-sub").textContent =
      `${error.message}. Run npm run demo to build web/data/plan.json.`;
    document.getElementById("timeline").innerHTML =
      '<p class="empty">No plan data. Build the plan first.</p>';
  }
}

function renderAll() {
  renderHeader();
  renderWarnings();
  renderStats();
  renderFilter();
  renderTimeline();
  renderWeek();
  renderGaps();
}

function selectedPlantings() {
  return state.plan.plantings.filter((planting) => state.selected.has(planting.cropId));
}

function activeCrops() {
  return state.plan.crops.filter(
    (crop) => state.selected.has(crop.id) && state.plantingsByCrop.has(crop.id),
  );
}

function renderHeader() {
  const { plan } = state;
  const site = plan.site;
  const start = plan.settings.startDate;
  const end = addDays(start, plan.settings.weeks * 7 - 1);
  const latitude = `${Math.abs(site.latitude).toFixed(2)}°${site.latitude >= 0 ? "N" : "S"}`;
  const longitude = `${Math.abs(site.longitude).toFixed(2)}°${site.longitude >= 0 ? "E" : "W"}`;
  const place = [site.name, site.region, site.country].filter(Boolean).join(" · ");

  document.getElementById("site-name").textContent = site.name;
  document.getElementById("site-sub").textContent =
    `${place} · ${latitude}, ${longitude} · ${formatFull(start)} to ${formatFull(end)}`;
  document.title = `${site.name} - seedcal`;
}

function renderWarnings() {
  const box = document.getElementById("warnings");
  const warnings = state.plan.warnings ?? [];
  if (warnings.length === 0) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  box.hidden = false;
  box.innerHTML = warnings
    .map((warning) => `<div class="warning">${escapeHtml(warning.message)}</div>`)
    .join("");
}

function renderStats() {
  const { plan } = state;
  const frost = plan.climate.frost;
  const soil = plan.climate.soil;
  const plantings = selectedPlantings();
  const crops = activeCrops();
  const firstHarvest = plantings.map((planting) => planting.harvestStart).sort()[0];
  const bias = soil.biasC > 0 ? `+${soil.biasC}` : String(soil.biasC);

  const cards = [
    {
      label: "Last frost",
      value: frost.lastFrost.medianLabel ?? "No frost",
      note: `90% safe ${frost.lastFrost.safeLabel ?? "—"}`,
    },
    {
      label: "First frost",
      value: frost.firstFrost.medianLabel ?? "No frost",
      note: `Early ${frost.firstFrost.safeLabel ?? "—"}`,
    },
    {
      label: "Soil at 6 cm",
      value: soil.latestC === null ? "—" : `${soil.latestC} °C`,
      note: `${soil.latestDate ? formatDay(soil.latestDate) : "No reading"} · model bias ${bias} °C`,
      spark: sparkline((soil.recent ?? []).map((row) => row.value)),
    },
    {
      label: "First harvest",
      value: firstHarvest ? formatDay(firstHarvest) : "—",
      note: `${crops.length} crops · ${plantings.length} plantings`,
    },
  ];

  document.getElementById("stats").innerHTML = cards
    .map(
      (card) => `<article class="stat">
        <span class="label">${card.label}</span>
        <span class="value">${escapeHtml(card.value)}</span>
        <span class="note">${escapeHtml(card.note)}</span>
        ${card.spark ?? ""}
      </article>`,
    )
    .join("");
}

function sparkline(values) {
  if (values.length < 2) return "";
  const width = 200;
  const height = 30;
  const pad = 3;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((value, index) => {
    const x = pad + (index / (values.length - 1)) * (width - pad * 2);
    const y = height - pad - ((value - min) / span) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const last = points[points.length - 1].split(",");
  return `<svg class="spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
    <polyline points="${points.join(" ")}"/>
    <circle cx="${last[0]}" cy="${last[1]}" r="2.2"/>
  </svg>`;
}

function renderFilter() {
  const container = document.getElementById("crop-filter");
  const crops = state.plan.crops
    .filter((crop) => state.plantingsByCrop.has(crop.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  container.innerHTML =
    crops
      .map((crop) => {
        const count = state.plantingsByCrop.get(crop.id).length;
        return `<button class="chip" type="button" data-crop="${escapeHtml(crop.id)}" aria-pressed="false">${escapeHtml(crop.name)}<span>${count}</span></button>`;
      })
      .join("") +
    `<div class="filter-actions">
      <button type="button" id="select-all">All</button>
      <button type="button" id="select-none">None</button>
      <span class="count" id="filter-count"></span>
    </div>`;

  container.addEventListener("click", (event) => {
    const chip = event.target.closest("button[data-crop]");
    if (chip) {
      const id = chip.dataset.crop;
      if (state.selected.has(id)) state.selected.delete(id);
      else state.selected.add(id);
      updateFilterState();
      renderStats();
      renderTimeline();
      renderWeek();
      renderGaps();
      return;
    }
    if (event.target.id === "select-all") {
      for (const crop of crops) state.selected.add(crop.id);
      updateFilterState();
      renderStats();
      renderTimeline();
      renderWeek();
      renderGaps();
    }
    if (event.target.id === "select-none") {
      state.selected.clear();
      updateFilterState();
      renderStats();
      renderTimeline();
      renderWeek();
      renderGaps();
    }
  });

  updateFilterState();
}

function updateFilterState() {
  const container = document.getElementById("crop-filter");
  container.querySelectorAll("button[data-crop]").forEach((button) => {
    button.setAttribute("aria-pressed", String(state.selected.has(button.dataset.crop)));
  });
  const total = container.querySelectorAll("button[data-crop]").length;
  const active = activeCrops().length;
  const count = document.getElementById("filter-count");
  if (count) count.textContent = `${active} of ${total} crops on`;
}

function renderTimeline() {
  const { plan } = state;
  const totalWeeks = plan.settings.weeks;
  const crops = activeCrops().sort((a, b) => {
    const aFirst = firstSow(a.id);
    const bFirst = firstSow(b.id);
    return aFirst.localeCompare(bFirst) || a.name.localeCompare(b.name);
  });

  const timeline = document.getElementById("timeline");
  const note = document.getElementById("timeline-note");

  if (crops.length === 0) {
    timeline.innerHTML =
      '<p class="empty">No crops are on. Choose a crop above, or press All.</p>';
    note.textContent = "Each selected crop adds a row.";
    return;
  }

  const segments = [];
  for (let index = 0; index < totalWeeks; index += 1) {
    const label = plan.weeks[index]?.monthLabel ?? "";
    const last = segments[segments.length - 1];
    if (last && last.label === label) {
      last.span += 1;
    } else {
      segments.push({ label, start: index, span: 1 });
    }
  }

  const monthCells = segments
    .map((segment) => {
      const [month, year] = segment.label.split(" ");
      const text = segment.start === 0 || month === "Jan" ? `${month} ${year.slice(2)}` : month;
      const left = (segment.start / totalWeeks) * 100;
      const width = (segment.span / totalWeeks) * 100;
      return `<span style="left:${left}%;width:${width}%">${text}</span>`;
    })
    .join("");

  const rows = crops
    .map((crop) => {
      const plantings = state.plantingsByCrop.get(crop.id) ?? [];
      const bed = plantings[0]?.bed ?? 1;
      const bars = plantings.map((planting) => harvestBar(planting, totalWeeks)).join("");
      const sowWeeks = unique(
        plantings
          .map((planting) => weekIndex(planting.sowDate))
          .filter((week) => week >= 0 && week < totalWeeks),
      );
      const transplantWeeks = unique(
        plantings
          .map((planting) =>
            planting.transplantDate === null ? -1 : weekIndex(planting.transplantDate),
          )
          .filter((week) => week >= 0 && week < totalWeeks),
      );

      const sowMarkers = sowWeeks
        .map((week) => {
          const date = addDays(plan.settings.startDate, week * 7);
          return `<span class="marker sow" style="left:${((week + 0.5) / totalWeeks) * 100}%" title="Sow week of ${formatDay(date)}"></span>`;
        })
        .join("");

      const transplantMarkers = transplantWeeks
        .map((week) => {
          const date = addDays(plan.settings.startDate, week * 7);
          return `<span class="marker transplant" style="left:${((week + 0.5) / totalWeeks) * 100}%" title="Transplant week of ${formatDay(date)}"></span>`;
        })
        .join("");

      return `<div class="tl-row">
        <div class="tl-label">
          <span>${escapeHtml(crop.name)}</span>
          <small>Bed ${bed} · ${plantings.length} sowing${plantings.length === 1 ? "" : "s"}</small>
        </div>
        <div class="tl-track" style="--weeks:${totalWeeks}">
          ${bars}${sowMarkers}${transplantMarkers}
        </div>
      </div>`;
    })
    .join("");

  timeline.innerHTML = `<div class="tl-head">
      <div class="tl-label">Crop</div>
      <div class="tl-months" style="--weeks:${totalWeeks}">${monthCells}</div>
    </div>${rows}`;

  note.textContent = `${crops.length} crops · ${selectedPlantings().length} plantings · hover a bar for exact dates.`;
}

function harvestBar(planting, totalWeeks) {
  let start = weekIndex(planting.harvestStart);
  let end = weekIndex(planting.harvestEnd);
  if (end < 0 || start >= totalWeeks) return "";
  start = Math.max(0, start);
  end = Math.min(totalWeeks - 1, end);
  if (end < start) return "";

  const left = (start / totalWeeks) * 100;
  const width = ((end - start + 1) / totalWeeks) * 100;
  const lane = planting.successionIndex % 2 === 0 ? 7 : 18;
  const title = `${planting.cropName}: harvest ${formatDay(planting.harvestStart)} to ${formatDay(planting.harvestEnd)} · bed ${planting.bed}`;

  return `<div class="bar" style="left:${left}%;width:${width}%;top:${lane}px" title="${escapeHtml(title)}"></div>`;
}

function renderWeek() {
  const { plan } = state;
  const range = document.getElementById("week-range");
  const container = document.getElementById("week-actions");
  const start = plan.settings.startDate;
  const end = addDays(start, plan.settings.weeks * 7 - 1);
  const index = weekIndex(todayISO());

  if (index < 0 || index >= plan.settings.weeks) {
    range.textContent = `The plan runs ${formatFull(start)} to ${formatFull(end)}.`;
    container.innerHTML =
      '<p class="empty">Today is outside the plan window. Use the timeline to find the right week.</p>';
    return;
  }

  const week = plan.weeks[index];
  const plantings = selectedPlantings();
  const sow = unique(
    plantings.filter((planting) => weekIndex(planting.sowDate) === index).map((p) => p.cropName),
  );
  const transplant = unique(
    plantings
      .filter(
        (planting) =>
          planting.transplantDate !== null && weekIndex(planting.transplantDate) === index,
      )
      .map((planting) => planting.cropName),
  );
  const harvest = unique(
    plantings
      .filter(
        (planting) =>
          planting.harvestStart <= week.end && planting.harvestEnd >= week.start,
      )
      .map((planting) => planting.cropName),
  );

  range.textContent = `Week of ${formatFull(week.start)}. ${index + 1} of ${plan.settings.weeks}.`;

  const columns = [
    { title: "Sow", items: sow },
    { title: "Transplant", items: transplant },
    { title: "Harvest", items: harvest },
  ];

  container.innerHTML = columns
    .map(
      (column) => `<div class="week-col">
        <h3>${column.title}</h3>
        ${
          column.items.length === 0
            ? '<p class="none">Nothing this week.</p>'
            : `<ul>${column.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
        }
      </div>`,
    )
    .join("");
}

function computeGaps(plantings) {
  const totalWeeks = state.plan.settings.weeks;
  const covered = new Array(totalWeeks).fill(false);

  for (const planting of plantings) {
    const start = Math.max(0, weekIndex(planting.harvestStart));
    const end = Math.min(totalWeeks - 1, weekIndex(planting.harvestEnd));
    for (let week = start; week <= end; week += 1) covered[week] = true;
  }

  const first = covered.indexOf(true);
  if (first === -1) return [];

  const gaps = [];
  let current = null;
  const flush = () => {
    if (!current) return;
    const startWeek = state.plan.weeks[current.startWeek];
    const endWeek = state.plan.weeks[current.endWeek];
    gaps.push({
      ...current,
      startDate: startWeek.start,
      endDate: endWeek.end,
      weeks: current.endWeek - current.startWeek + 1,
    });
    current = null;
  };

  for (let week = first; week < totalWeeks; week += 1) {
    if (!covered[week]) {
      if (!current) current = { startWeek: week, endWeek: week };
      else current.endWeek = week;
    } else {
      flush();
    }
  }
  flush();
  return gaps;
}

function gapSuggestions(gap) {
  const candidates = state.plan.plantings
    .filter((planting) => !state.selected.has(planting.cropId))
    .filter(
      (planting) =>
        planting.harvestStart <= gap.endDate && planting.harvestEnd >= gap.startDate,
    )
    .map((planting) => {
      const crop = state.crops.get(planting.cropId);
      if (!crop) return null;
      const overlapStart =
        planting.harvestStart > gap.startDate ? planting.harvestStart : gap.startDate;
      const overlapEnd = planting.harvestEnd < gap.endDate ? planting.harvestEnd : gap.endDate;
      const overlapWeeks = Math.floor(diffDays(overlapStart, overlapEnd) / 7) + 1;
      return {
        planting,
        crop,
        score: crop.gapValue * 10 + overlapWeeks * 2 - crop.daysToHarvest[0] / 30,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  const used = new Set();
  const result = [];
  for (const row of candidates) {
    if (used.has(row.crop.id)) continue;
    used.add(row.crop.id);
    result.push(row);
    if (result.length >= 3) break;
  }
  return result;
}

function renderGaps() {
  const container = document.getElementById("gap-list");
  const plantings = selectedPlantings();

  if (plantings.length === 0) {
    container.innerHTML =
      '<p class="empty">No crops are on. Choose a crop above to see the harvest gaps.</p>';
    return;
  }

  const gaps = computeGaps(plantings);
  const harvestWeeks = [];
  for (let week = 0; week < state.plan.settings.weeks; week += 1) {
    if (
      plantings.some(
        (planting) =>
          planting.harvestStart <= state.plan.weeks[week].end &&
          planting.harvestEnd >= state.plan.weeks[week].start,
      )
    ) {
      harvestWeeks.push(week);
    }
  }

  if (harvestWeeks.length === 0) {
    container.innerHTML =
      '<p class="empty">No selected crop harvests in this plan. Move the start date or add crops.</p>';
    return;
  }

  if (gaps.length === 0) {
    const first = plantings.map((planting) => planting.harvestStart).sort()[0];
    const last = plantings.map((planting) => planting.harvestEnd).sort().slice(-1)[0];
    container.innerHTML = `<div class="good">
      <strong>No hungry gap.</strong>
      Something harvests every week from ${formatFull(first)} to ${formatFull(last)}.
    </div>`;
    return;
  }

  container.innerHTML = gaps
    .map((gap) => {
      const suggestions = gapSuggestions(gap);
      return `<div class="gap-card">
        <div class="gap-head">
          <strong>${formatFull(gap.startDate)} to ${formatFull(gap.endDate)}</strong>
          <span class="pill">${gap.weeks} week${gap.weeks === 1 ? "" : "s"}</span>
        </div>
        <p>No selected crop harvests in this window.</p>
        <div class="suggestions">
          <p class="hint">Fill it with</p>
          ${
            suggestions.length === 0
              ? '<p class="hint">No catalog crop covers this gap. Try a quick salad crop.</p>'
              : `<ul>${suggestions
                  .map(
                    (row) =>
                      `<li><strong>${escapeHtml(row.crop.name)}</strong>: sow by ${formatFull(row.planting.sowDate)}, harvest from ${formatFull(row.planting.harvestStart)}. <span>${escapeHtml(row.crop.notes)}</span></li>`,
                  )
                  .join("")}</ul>`
          }
        </div>
      </div>`;
    })
    .join("");
}

function firstSow(cropId) {
  const plantings = state.plantingsByCrop.get(cropId) ?? [];
  return plantings.map((planting) => planting.sowDate).sort()[0] ?? "9999-12-31";
}

function downloadCsv() {
  const selected = state.selected;
  const rows = [["week", "date", "weekday", "action", "crop", "bed", "detail"]];

  for (const planting of state.plan.plantings) {
    if (!selected.has(planting.cropId)) continue;
    const week = weekIndex(planting.sowDate) + 1;
    rows.push([
      String(week),
      planting.sowDate,
      formatWeekday(planting.sowDate),
      "sow",
      planting.cropName,
      String(planting.bed),
      `${planting.window} window. Soil ${planting.soilAtSowC === null ? "unknown" : `${planting.soilAtSowC} °C`}.`,
    ]);
    if (planting.transplantDate !== null) {
      rows.push([
        String(weekIndex(planting.transplantDate) + 1),
        planting.transplantDate,
        formatWeekday(planting.transplantDate),
        "transplant",
        planting.cropName,
        String(planting.bed),
        "Harden off before planting out.",
      ]);
    }
    rows.push([
      String(weekIndex(planting.harvestStart) + 1),
      planting.harvestStart,
      formatWeekday(planting.harvestStart),
      "harvest start",
      planting.cropName,
      String(planting.bed),
      `Harvest from ${formatFull(planting.harvestStart)}.`,
    ]);
    rows.push([
      String(weekIndex(planting.harvestEnd) + 1),
      planting.harvestEnd,
      formatWeekday(planting.harvestEnd),
      "harvest end",
      planting.cropName,
      String(planting.bed),
      `Last harvest around ${formatFull(planting.harvestEnd)}.`,
    ]);
  }

  const csv = rows
    .map((row) => row.map(csvCell).join(","))
    .join("\n");

  const blob = new Blob([`\ufeff${csv}\n`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "seedcal-plan.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

document.getElementById("print").addEventListener("click", () => window.print());
document.getElementById("csv").addEventListener("click", downloadCsv);

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (location.protocol !== "http:" && location.protocol !== "https:") return;
  navigator.serviceWorker.register("sw.js").catch(() => {
    // Offline support is optional.
  });
}

init();