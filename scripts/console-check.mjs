// Headless console check: navigate to a URL, collect console errors and page errors.
// Usage: node scripts/console-check.mjs http://127.0.0.1:8099/ [outfile]

const url = process.argv[2] ?? "http://127.0.0.1:8099/";
const outFile = process.argv[3] ?? "";

const endpoint = "http://127.0.0.1:9222";

async function waitForTarget() {
  for (let i = 0; i < 60; i += 1) {
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

const wsUrl = await waitForTarget();
const ws = new WebSocket(wsUrl);

let id = 0;
const pending = new Map();
const errors = [];
const warnings = [];
const logs = [];

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
  if (msg.method === "Runtime.consoleAPICalled") {
    const text = (msg.params.args ?? [])
      .map((a) => a.value ?? a.description ?? a.type)
      .join(" ");
    if (msg.params.type === "error") errors.push(text);
    else if (msg.params.type === "warning") warnings.push(text);
    else logs.push(`${msg.params.type}: ${text}`);
  }
  if (msg.method === "Runtime.exceptionThrown") {
    const d = msg.params.exceptionDetails;
    errors.push(d.exception?.description ?? d.text ?? "unknown exception");
  }
  if (msg.method === "Log.entryAdded") {
    const e = msg.params.entry;
    if (e.level === "error") errors.push(`${e.source}: ${e.text}`);
  }
});

await new Promise((resolve, reject) => {
  ws.addEventListener("open", resolve, { once: true });
  ws.addEventListener("error", reject, { once: true });
});

await send("Runtime.enable");
await send("Log.enable");
await send("Page.enable");
await send("Page.navigate", { url });
await new Promise((r) => setTimeout(r, 3500));

const titleResult = await send("Runtime.evaluate", {
  expression: "document.querySelector('h1')?.textContent ?? ''",
  returnByValue: true,
});
const countsResult = await send("Runtime.evaluate", {
  expression:
    "JSON.stringify({rows:document.querySelectorAll('#timeline .tl-row').length, stats:document.querySelectorAll('#stats .stat').length, gaps:document.querySelectorAll('#gap-list .gap-card').length, week:document.querySelectorAll('#week-actions .week-col').length, chips:document.querySelectorAll('#crop-filter .chip').length})",
  returnByValue: true,
});

const report = {
  url,
  title: titleResult.result?.value ?? "",
  counts: JSON.parse(countsResult.result?.value ?? "{}"),
  errors,
  warnings,
  logs: logs.slice(0, 10),
};
const text = JSON.stringify(report, null, 2);
if (outFile) {
  const { writeFile } = await import("node:fs/promises");
  await writeFile(outFile, text, "utf8");
}
console.log(text);
ws.close();
process.exit(errors.length > 0 ? 1 : 0);