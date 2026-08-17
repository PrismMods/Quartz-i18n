// ===== Configuration (edit these before deploying) =====
const CONFIG = {
  owner: "PrismMods", // GitHub org/user owning the repo
  repo: "quartz-i18n", // repo name
  branch: "main",

  // Client ID of your GitHub OAuth App (public, safe to embed).
  clientId: "Ov23liBao36hDxtZMxHN",

  // URL of the Cloudflare Worker that exchanges the code for a token
  // (see worker.js). Keeps the client secret out of the browser.
  tokenExchangeUrl: "https://quartz-i18n-oauth.quartzi18n.workers.dev/exchange",

  // Reference language — the left (read-only) source column.
  referenceLang: "en-US",

  // Keys that must NOT be edited by translators (repo rules).
  protectedKeys: ["0KTL"],

  // Each namespace is a directory of one-file-per-language, with its OWN
  // reference. They deliberately share key names: the April Fools overlay holds
  // the same keys as the normal translation with joke values, which is exactly
  // why it lives in its own folder and gets its own reference here. Never point
  // two namespaces at one directory.
  namespaces: [
    {
      id: "main",
      label: "Translation",
      dir: "Lang",
    },
    {
      id: "april",
      label: "April Fools",
      dir: "Lang/AprilFools",
      // Shown above the rows. This is the one instruction translators most need
      // and least expect, so it belongs in the editor and not only in the README.
      hint:
        "Joke strings, shown in-game on one day of the year. Optional — anything you leave alone " +
        "falls back to the English joke, then to your normal translation. Do not translate the " +
        "English literally; write a joke that lands in your language for the same UI element, at " +
        "roughly the same length.",
      // The files start as copies of the real translation, so "still identical to
      // the normal translation" is the real to-do list here — not "missing".
      comparesAgainst: "Lang",
    },
  ],
};

// ===== GitHub API client =====
const API = "https://api.github.com";

async function api(path, opts = {}) {
  const token = sessionStorage.getItem("gh-token");
  const headers = {
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
  };
  if (token) headers.Authorization = "Bearer " + token;
  const res = await fetch(API + path, {
    ...opts,
    headers: { ...headers, ...(opts.headers || {}) },
  });
  if (!res.ok) {
    let msg = "HTTP " + res.status;
    try {
      const j = await res.json();
      if (j.message) msg = j.message;
    } catch (_) {}
    throw new Error(msg);
  }
  return res.json();
}

async function getFile(path) {
  return api(
    `/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${path}?ref=${CONFIG.branch}`
  );
}

async function checkWriteAccess() {
  try {
    const repo = await api(`/repos/${CONFIG.owner}/${CONFIG.repo}`);
    return !!(repo.permissions && repo.permissions.push);
  } catch (e) {
    return false;
  }
}

async function loadJson(path) {
  const f = await getFile(path);
  const raw = atob(f.content.replace(/\s/g, ""));
  return JSON.parse(decodeURIComponent(escape(raw)));
}

async function commitFile(path, content, sha, message) {
  const body = btoa(unescape(encodeURIComponent(content)));
  return api(
    `/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${path}`,
    {
      method: "PUT",
      body: JSON.stringify({
        message,
        content: body,
        sha,
        branch: CONFIG.branch,
      }),
    }
  );
}

// ===== Auth =====
function signIn() {
  const state = crypto.randomUUID();
  sessionStorage.setItem("oauth-state", state);
  localStorage.setItem("oauth-worker-url", CONFIG.tokenExchangeUrl);
  const url =
    "https://github.com/login/oauth/authorize" +
    '?client_id=' + encodeURIComponent(CONFIG.clientId) +
    "&scope=repo" +
    "&state=" + encodeURIComponent(state) +
    "&redirect_uri=" + encodeURIComponent(
      window.location.origin + window.location.pathname.replace(/[^/]*$/, "") + "callback.html"
    );
  window.location.href = url;
}

async function whoami() {
  try {
    return await api("/user");
  } catch (_) {
    return null;
  }
}

// ===== State =====
let en = {}; // reference block of the ACTIVE namespace (values)
let target = {}; // { langCode, data, sha, path }
let dirty = {}; // key -> new value (only changed keys)
let addedKeys = new Set(); // keys added that don't exist in original target
let namespaces = []; // the CONFIG namespaces that actually exist in the repo
let ns = null; // active namespace
let baseline = {}; // for a comparing namespace: the file it is measured against
const refCache = {}; // namespace id -> reference block, so switching tabs is free

// ===== DOM helpers =====
const $ = (s) => document.querySelector(s);

function setUser(login) {
  $("#user").textContent = login || "";
}

// ===== Init =====
function bindAuthButton() {
  $("#authBtn").addEventListener("click", () => {
    if (sessionStorage.getItem("gh-token")) signOut();
    else signIn();
  });
  $("#welcomeBtn").addEventListener("click", signIn);
}

async function init() {
  bindAuthButton();
  const token = sessionStorage.getItem("gh-token");

  if (token) {
    const user = await whoami();
    if (!user) {
      signOut();
      return;
    }
    setUser(user.login);
    $("#authBtn").textContent = "Sign out";
    const canWrite = await checkWriteAccess();
    $("#access").textContent = canWrite ? "write access" : "read-only";
    if (canWrite) {
      await loadEditor();
    } else {
      $("#access").textContent += " — contact a maintainer to contribute";
    }
  } else {
    $("#authBtn").textContent = "Sign in";
    $("#welcome").hidden = false;
  }
}

function signOut() {
  sessionStorage.removeItem("gh-token");
  sessionStorage.removeItem("oauth-state");
  setUser("");
  $("#access").textContent = "";
  $("#authBtn").textContent = "Sign in";
  $("#app").hidden = true;
  $("#welcome").hidden = false;
}

// List the *.json language files in a namespace directory. A namespace whose
// directory does not exist yet is not an error — it just does not get a tab.
async function listLanguages(dir) {
  try {
    const entries = await api(
      `/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${dir}`
    );
    return entries
      .filter((e) => e.type === "file" && e.name.endsWith(".json"))
      .map((e) => e.name)
      .sort();
  } catch (_) {
    return [];
  }
}

async function referenceFor(space) {
  if (refCache[space.id]) return refCache[space.id];
  let block = await loadJson(`${space.dir}/${CONFIG.referenceLang}.json`);
  if (block[CONFIG.referenceLang]) block = block[CONFIG.referenceLang];
  refCache[space.id] = block;
  return block;
}

async function loadEditor() {
  try {
    const found = [];
    for (const space of CONFIG.namespaces) {
      const files = await listLanguages(space.dir);
      // A namespace is only usable if it has its reference AND something to edit.
      if (!files.includes(`${CONFIG.referenceLang}.json`)) continue;
      if (files.length < 2) continue;
      found.push({ ...space, files });
    }
    if (!found.length) throw new Error(`no language files under Lang/`);
    namespaces = found;

    renderTabs();
    $("#app").hidden = false;
    $("#welcome").hidden = true;
    await selectNamespace(namespaces[0].id);
  } catch (e) {
    alert("Failed to load: " + e.message);
  }
}

// ===== Namespace selection =====
function renderTabs() {
  const tabs = $("#tabs");
  tabs.innerHTML = "";
  // One namespace is the normal case — a lone tab is just noise.
  if (namespaces.length < 2) return;
  namespaces.forEach((space) => {
    const tab = document.createElement("button");
    tab.className = "tab";
    tab.type = "button";
    tab.textContent = space.label;
    tab.dataset.ns = space.id;
    tab.addEventListener("click", () => selectNamespace(space.id));
    tabs.appendChild(tab);
  });
}

function markActiveTab() {
  $("#tabs")
    .querySelectorAll(".tab")
    .forEach((t) => t.classList.toggle("active", t.dataset.ns === ns.id));
}

async function selectNamespace(id) {
  const next = namespaces.find((s) => s.id === id);
  if (!next) return;
  // Switching namespace throws away edits, so do not do it silently.
  if (ns && ns.id !== id && Object.keys(dirty).length) {
    const n = Object.keys(dirty).length;
    if (!confirm(`Discard ${n} uncommitted change${n > 1 ? "s" : ""} and switch to ${next.label}?`))
      return markActiveTab();
  }
  ns = next;
  markActiveTab();

  const hint = $("#nsHint");
  hint.textContent = ns.hint || "";
  hint.hidden = !ns.hint;
  $("#newLangsBtn").textContent = ns.comparesAgainst ? "Not written yet" : "Missing keys";

  en = await referenceFor(ns);

  const sel = $("#langSelect");
  sel.innerHTML = "";
  ns.files
    .filter((f) => f !== `${CONFIG.referenceLang}.json`)
    .forEach((f) => {
      const opt = document.createElement("option");
      opt.value = f;
      opt.textContent = f.replace(/\.json$/, "");
      sel.appendChild(opt);
    });

  await selectLanguage(sel.value);
}

// ===== Language selection =====
async function selectLanguage(file) {
  if (!file) return;
  const langCode = file.replace(/\.json$/, "");
  const path = `${ns.dir}/${file}`;
  const raw = await loadJson(path);
  const block = raw[langCode];
  target = {
    langCode,
    path,
    data: block || {},
    sha: (await getFile(path)).sha,
  };

  // For the overlay, the files start life as copies of the real translation, so
  // "still identical to that" is what un-written means — nothing is ever missing.
  baseline = {};
  if (ns.comparesAgainst) {
    try {
      const other = await loadJson(`${ns.comparesAgainst}/${file}`);
      baseline = other[langCode] || {};
    } catch (_) {
      baseline = {};
    }
  }

  dirty = {};
  addedKeys = new Set();
  missingMode = false;
  toggleBtn($("#newLangsBtn"), false);
  render();
}

// A key the translator has not actually done anything with yet.
function isUnwritten(key) {
  if (CONFIG.protectedKeys.includes(key)) return false;
  if (ns.comparesAgainst) {
    // The mod's overlay loader drops every 0-prefixed metadata key (0KTL,
    // 0NATIVELANG, 0TRANSLATORS), so a joke written there would never show.
    // Flagging them as to-do would send translators after inert rows.
    if (key.startsWith("0")) return false;
    return baseline[key] !== undefined && target.data[key] === baseline[key];
  }
  return target.data[key] === undefined;
}

function render() {
  const keys = Object.keys(en).sort();
  const list = $("#list");
  list.innerHTML = "";

  const showSrc = $("#sourceBtn").classList.contains("active");

  const frag = document.createDocumentFragment();
  keys.forEach((key) => {
    if (target.data[key] === undefined) return; // skip dead keys never in target
    frag.appendChild(buildRow(key, showSrc));
  });

  list.appendChild(frag);

  // In the overlay nothing is ever missing — the files ship as full copies — so
  // the tail row counts what is still untouched instead.
  const pending = keys.filter(isUnwritten).length;
  if (pending) list.appendChild(buildPendingRow(pending));

  updateStatus();
}

function buildRow(key, showSrc) {
  const row = document.createElement("div");
  row.className = "row-item";

  const keyCol = document.createElement("div");
  keyCol.className = "col key";
  const keyName = document.createElement("span");
  keyName.className = "kname";
  keyName.textContent = key;
  if (CONFIG.protectedKeys.includes(key)) keyName.textContent += " 🔒";
  keyCol.appendChild(keyName);
  if (isUnwritten(key)) {
    const badge = document.createElement("span");
    badge.className = "task-badge untouched";
    badge.textContent = ns.comparesAgainst ? "no joke yet" : "untranslated";
    keyCol.appendChild(badge);
  }
  row.appendChild(keyCol);

  const srcCol = document.createElement("div");
  srcCol.className = "col";
  if (showSrc) {
    const d = document.createElement("div");
    d.className = "src";
    d.textContent = en[key];
    srcCol.appendChild(d);
  }
  row.appendChild(srcCol);

  const tgtCol = document.createElement("div");
  tgtCol.className = "col";
  const ta = document.createElement("textarea");
  ta.value = target.data[key] ?? "";
  const protectedKey = CONFIG.protectedKeys.includes(key);
  ta.disabled = protectedKey;
  ta.placeholder = protectedKey ? "" : showSrc ? "" : en[key];
  ta.addEventListener("input", () => {
    const original = target.data[key] ?? "";
    if (ta.value === original) {
      delete dirty[key];
      ta.classList.remove("dirty");
    } else {
      dirty[key] = ta.value;
      ta.classList.add("dirty");
    }
    updateStatus();
  });
  tgtCol.appendChild(ta);
  row.appendChild(tgtCol);

  return row;
}

function buildPendingRow(count) {
  const row = document.createElement("div");
  row.className = "row-item";

  const keyCol = document.createElement("div");
  keyCol.className = "col key";
  keyCol.textContent = ns.comparesAgainst ? "Not written yet" : "Missing keys";
  row.appendChild(keyCol);

  const srcCol = document.createElement("div");
  srcCol.className = "col";
  const btn = document.createElement("button");
  btn.className = "btn";
  btn.textContent = ns.comparesAgainst
    ? `Show ${count} key${count > 1 ? "s" : ""} with no joke yet`
    : `Show ${count} missing key${count > 1 ? "s" : ""}`;
  btn.addEventListener("click", () => {
    missingMode = true;
    toggleBtn($("#newLangsBtn"), true);
    renderMissing();
  });
  srcCol.appendChild(btn);
  row.appendChild(srcCol);

  const tgtCol = document.createElement("div");
  tgtCol.className = "col";
  row.appendChild(tgtCol);

  return row;
}

function updateStatus() {
  const n = Object.keys(dirty).length;
  $("#status").textContent = n ? `${n} changed` : "";
  $("#saveBtn").disabled = n === 0;
}

// ===== Save / commit =====
async function save() {
  const newData = { ...target.data };
  for (const k of Object.keys(dirty)) newData[k] = dirty[k];

  const ordered = {};
  ordered[target.langCode] = {};
  // Preserve key order to match en-US where possible, then append new keys.
  const seen = new Set();
  Object.keys(en).forEach((k) => {
    if (newData[k] !== undefined) {
      ordered[target.langCode][k] = newData[k];
      seen.add(k);
    }
  });
  Object.keys(newData).forEach((k) => {
    if (!seen.has(k)) ordered[target.langCode][k] = newData[k];
  });

  const json = JSON.stringify(ordered, null, 2) + "\n";
  // Name the namespace: the overlay and the normal file have the same basename,
  // so without it the two are indistinguishable in the log and in the sync PR.
  const what = ns.id === "main" ? "translations" : `${ns.label} strings`;
  const msg = `Update ${target.langCode} ${what} via web editor`;

  try {
    $("#saveBtn").disabled = true;
    $("#status").textContent = "Committing…";

    // Re-fetch the latest SHA immediately before writing. The file can change
    // under us (another translator, or the manifest bot touching the tree), and
    // the Contents API requires the exact current blob SHA to overwrite it.
    const latest = await getFile(target.path);
    target.sha = latest.sha;

    await commitFile(target.path, json, target.sha, msg);
    dirty = {};
    addedKeys = new Set();
    $("#status").textContent = "Committed ✓";
    setUser(window._login || $("#user").textContent);
    target.sha = latest.sha;
  } catch (e) {
    $("#status").textContent = "Error: " + e.message;
    $("#saveBtn").disabled = false;
  }
}

// ===== Wiring =====
$("#langSelect").addEventListener("change", (e) => selectLanguage(e.target.value));
$("#saveBtn").addEventListener("click", save);

let missingMode = false;

function toggleBtn(el, active) {
  el.classList.toggle("active", active);
  el.setAttribute("aria-pressed", String(active));
}

$("#sourceBtn").addEventListener("click", (e) => {
  const showing = e.target.textContent === "Hide English";
  const next = !showing;
  e.target.textContent = next ? "Hide English" : "Show English";
  toggleBtn(e.target, next);
  render();
});

function renderMissing() {
  const pending = Object.keys(en).sort().filter(isUnwritten);
  const list = $("#list");
  if (!pending.length) {
    list.innerHTML = ns.comparesAgainst
      ? `<div class="empty muted">Every key has a joke of its own — nothing left here.</div>`
      : `<div class="empty muted">No missing keys — translation is up to date.</div>`;
    return;
  }
  list.innerHTML = "";
  pending.forEach((key) => {
    const row = document.createElement("div");
    row.className = "row-item";

    const keyCol = document.createElement("div");
    keyCol.className = "col key";
    keyCol.textContent = key;
    row.appendChild(keyCol);

    const srcCol = document.createElement("div");
    srcCol.className = "col";
    const d = document.createElement("div");
    d.className = "src";
    d.textContent = en[key];
    srcCol.appendChild(d);
    row.appendChild(srcCol);

    const tgtCol = document.createElement("div");
    tgtCol.className = "col";
    const ta = document.createElement("textarea");
    // In the overlay the value already exists (it is the real translation, copied)
    // so it is seeded for rewriting rather than left blank to fill in.
    const original = target.data[key] ?? "";
    ta.value = ns.comparesAgainst ? original : "";
    ta.placeholder = ns.comparesAgainst ? "" : "Translation…";
    ta.addEventListener("input", () => {
      if (ta.value === original) {
        delete dirty[key];
        ta.classList.remove("dirty");
      } else {
        dirty[key] = ta.value;
        ta.classList.add("dirty");
      }
      updateStatus();
    });
    tgtCol.appendChild(ta);
    row.appendChild(tgtCol);
    // Was missing entirely: every row was built and then dropped on the floor, so
    // this view only ever rendered its own "nothing to do" message.
    list.appendChild(row);
  });
  updateStatus();
}

$("#newLangsBtn").addEventListener("click", (e) => {
  missingMode = !missingMode;
  toggleBtn(e.target, missingMode);
  if (missingMode) renderMissing();
  else render();
});

init();
