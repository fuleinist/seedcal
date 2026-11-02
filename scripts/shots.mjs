// Capture README screenshots from a running local server with headless Chrome.
// Usage: node scripts/shots.mjs http://127.0.0.1:8099/ docs/screenshots
// Requires Chrome started with --remote-debugging-port=9222.

const baseUrl = process.argv[2] ?? "http://127.0.0.1:8099/";
const outDir = process.argv[3] ?? "docs/screenshots";
const endpoint = "http://127.0.0.1:9222";

const { mkdir, writeFile } = await import("node:fs/promises");
const { join } = await import("node:path");

async function waitForTarget() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const res = await fetch(`${endpoint}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("CDP endpoint did not start");
}

const ws = new WebSocket(await waitForTarget());
let id = 0;
const pending = new Map();
const errors = [];

function send(method, params = {}) {
  id += 1;
  const msgId = id;
  ws.send(JSON.stringify({ id: msgId, method, params }));
  return new Promise((resolve) => pending.set(msgId, resolve));
}

ws.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg.result ?? {});
    pending.delete(msg.id);
    return;
  }
  if (msg.method === "Runtime.exceptionThrown") {
    errors.push(msg.params.exceptionDetails.text ?? "exception");
  }
  if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
    errors.push((msg.params.args ?? []).map((a) => a.value ?? a.description).join(" "));
  }
});

await new Promise((resolve, reject) => {
  ws.addEventListener("open", resolve, { once: true });
  ws.addEventListener("error", reject, { once: true });
});

await send("Runtime.enable");
await send("Page.enable");
await mkdir(outDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function evaluate(expression) {
  const res = await send("Runtime.evaluate", { expression, returnByValue: true });
  return res.result?.value;
}

async function setViewport(width, height, mobile) {
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile,
  });
}

async function load(width, height, mobile) {
  await setViewport(width, height, mobile);
  await send("Page.navigate", { url: baseUrl });
  await sleep(2500);
}

async function fullPage(file, qualityWidth) {
  const metrics = await send("Page.getLayoutMetrics");
  const size = metrics.cssContentSize ?? metrics.contentSize;
  const shot = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    clip: {
      x: 0,
      y: 0,
      width: qualityWidth ?? size.width,
      height: size.height,
      scale: 1,
    },
  });
  await writeFile(join(outDir, file), Buffer.from(shot.data, "base64"));
  console.log(`SAVED ${file} ${Math.round(size.height)}px tall`);
}

async function section(selector, file) {
  const rect = await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height };
  })()`);
  if (!rect) {
    console.log(`SKIP ${file}: no ${selector}`);
    return;
  }
  const shot = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    clip: { x: Math.max(0, rect.x - 24), y: Math.max(0, rect.y - 24), width: rect.width + 48, height: rect.height + 48, scale: 1 },
  });
  await writeFile(join(outDir, file), Buffer.from(shot.data, "base64"));
  console.log(`SAVED ${file} ${Math.round(rect.width)}x${Math.round(rect.height)}`);
}

// Desktop
await load(1440, 900, false);
console.log("title:", await evaluate("document.querySelector('h1')?.textContent"));
await fullPage("plan-desktop.png", 1440);
await section("#timeline", "timeline-desktop.png");
await section("#this-week", "week-desktop.png");

// Gap demo: a narrow crop set that leaves an autumn gap.
await send("Page.navigate", { url: new URL("?plan=plan-gaps", baseUrl).href });
await sleep(2500);
await section("#gaps", "gaps-desktop.png");

// Mobile
await load(390, 844, true);
await fullPage("plan-mobile.png", 390);

if (errors.length > 0) {
  console.error("CONSOLE ERRORS:", JSON.stringify(errors, null, 2));
}
ws.close();
process.exit(errors.length > 0 ? 1 : 0);