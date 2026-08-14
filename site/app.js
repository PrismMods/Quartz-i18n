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
let en = {}; // reference block (values)
let target = {}; // { langCode, data, sha, path }
let dirty = {}; // key -> new value (only changed keys)
let addedKeys = new Set(); // keys added that don't exist in original target

// ===== DOM helpers =====
const $ = (s) => document.querySelector(s);

function setUser(login) {
  $("#user").textContent = login || "";
}

// ===== Init =====
async function init() {
  const token = sessionStorage.getItem("gh-token");
  $("#authBtn").addEventListener("click", () => {
    if (sessionStorage.getItem("gh-token")) signOut();
    else signIn();
  });
  $("#welcomeBtn").addEventListener("click", signIn);

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

async function loadEditor() {
  try {
    en = await loadJson(`Lang/${CONFIG.referenceLang}.json`);
    if (en[CONFIG.referenceLang]) en = en[CONFIG.referenceLang];

    const langs = await api(
      `/repos/${CONFIG.owner}/${CONFIG.repo}/contents/Lang`
    );
    const files = langs
      .map((l) => l.name)
      .filter((n) => n.endsWith(".json") && n !== `${CONFIG.referenceLang}.json`)
      .sort();

    const sel = $("#langSelect");
    sel.innerHTML = "";
    files.forEach((f) => {
      const opt = document.createElement("option");
      opt.value = f;
      opt.textContent = f.replace(/\.json$/, "");
      sel.appendChild(opt);
    });

    $("#app").hidden = false;
    $("#welcome").hidden = true;
    await selectLanguage(sel.value);
  } catch (e) {
    alert("Failed to load: " + e.message);
  }
}

// ===== Language selection =====
async function selectLanguage(file) {
  if (!file) return;
  const langCode = file.replace(/\.json$/, "");
  const raw = await loadJson(`Lang/${file}`);
  const block = raw[langCode];
  target = {
    langCode,
    path: `Lang/${file}`,
    data: block || {},
    sha: (await getFile(`Lang/${file}`)).sha,
  };

  dirty = {};
  addedKeys = new Set();
  missingMode = false;
  toggleBtn($("#newLangsBtn"), false);
  render();
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

  // Added/missing keys not yet in target
  const missing = keys.filter((k) => target.data[k] === undefined);
  const missingRow = buildMissingRow(missing.length);
  list.appendChild(frag);
  if (missing.length) list.appendChild(missingRow);

  updateStatus();
}

function buildRow(key, showSrc) {
  const row = document.createElement("div");
  row.className = "row-item";

  const keyCol = document.createElement("div");
  keyCol.className = "col key";
  keyCol.textContent = key;
  if (CONFIG.protectedKeys.includes(key)) keyCol.textContent += " 🔒";
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

function buildMissingRow(count) {
  const row = document.createElement("div");
  row.className = "row-item";

  const keyCol = document.createElement("div");
  keyCol.className = "col key";
  keyCol.textContent = "Missing keys";
  row.appendChild(keyCol);

  const srcCol = document.createElement("div");
  srcCol.className = "col";
  const btn = document.createElement("button");
  btn.className = "btn";
  btn.textContent = `Add ${count} missing key${count > 1 ? "s" : ""}`;
  btn.addEventListener("click", () => {
    const textarea = document.createElement("textarea");
    textarea.placeholder = "Type translations here…";
    btn.replaceWith(textarea);
    textarea.focus();
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
  const msg = `Update ${target.langCode} translations via web editor`;

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
  const missing = Object.keys(en).filter((k) => target.data[k] === undefined);
  const list = $("#list");
  if (!missing.length) {
    list.innerHTML = `<div class="empty muted">No missing keys — translation is up to date.</div>`;
    return;
  }
  list.innerHTML = "";
  missing.forEach((key) => {
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
    ta.value = "";
    ta.placeholder = "Translation…";
    ta.addEventListener("input", () => {
      if (ta.value === "") delete dirty[key];
      else dirty[key] = ta.value;
      updateStatus();
    });
    tgtCol.appendChild(ta);
    row.appendChild(tgtCol);
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
