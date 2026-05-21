"use strict";

// ── First-run disclaimer ──────────────────────────────────────────────
(async () => {
  const KEY = "disclaimerAccepted";
  const { [KEY]: accepted } = await browser.storage.local.get(KEY);
  if (!accepted) {
    const overlay = document.getElementById("disclaimerOverlay");
    const layout  = document.querySelector(".layout");
    overlay.hidden = false;
    layout.style.visibility = "hidden";

    document.getElementById("disclaimerAccept").addEventListener("click", async () => {
      await browser.storage.local.set({ [KEY]: true });
      overlay.hidden = true;
      layout.style.visibility = "";
      resetScrollPosition();
    }, { once: true });
  }
})();

const fields = {
  calendarId: document.getElementById("calendarId"),
  collectionUrl: document.getElementById("collectionUrl"),
  username: document.getElementById("username"),
  password: document.getElementById("password"),
  intervalMinutes: document.getElementById("intervalMinutes"),
  deleteLimitPercent: document.getElementById("deleteLimitPercent"),
  syncPastMonths: document.getElementById("syncPastMonths"),
  syncFutureMonths: document.getElementById("syncFutureMonths"),
  enabled: document.getElementById("enabled")
};

const statusNode = document.getElementById("status");
const logsNode = document.getElementById("logs");
const passwordStatusNode = document.getElementById("passwordStatus");
let hasSavedPassword = false;
let savedPasswordUsername = "";

function resetScrollPosition() {
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

function showSection(targetId, { resetScroll = true } = {}) {
  const target = document.getElementById(targetId);
  if (!target) return;

  for (const section of document.querySelectorAll(".content > .card")) {
    section.hidden = section.id !== targetId;
  }

  for (const link of document.querySelectorAll(".nav-link")) {
    const isActive = link.getAttribute("href") === `#${targetId}`;
    link.classList.toggle("active", isActive);
    link.setAttribute("aria-current", isActive ? "page" : "false");
  }

  if (resetScroll) {
    resetScrollPosition();
  }
}

for (const link of document.querySelectorAll(".nav-link")) {
  link.addEventListener("click", event => {
    const targetId = link.getAttribute("href")?.replace(/^#/, "");
    if (!targetId) return;

    event.preventDefault();
    showSection(targetId);
  });
}

// Live progress from background sync
browser.runtime.onMessage.addListener(msg => {
  if (msg?.type === "_syncProgress") {
    setStatus(`⏳ ${msg.message}`);
  }
});

function setStatus(value) {
  statusNode.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function requireLocalCalendar(settings) {
  if (!settings.calendarId) {
    throw new Error("Select a local Thunderbird calendar first.");
  }
  const selectedOption = fields.calendarId.selectedOptions?.[0];
  if (selectedOption?.disabled) {
    throw new Error("Select a local Thunderbird calendar first.");
  }
}

function requireCollectionUrl(settings) {
  if (!settings.collectionUrl) {
    throw new Error("Configure a CalDAV collection URL first.");
  }
}

function validateCollectionUrlIfPresent(settings) {
  const raw = settings.collectionUrl;
  if (!raw) {
    return;
  }

  let url;
  try {
    url = new URL(raw);
  } catch (_error) {
    throw new Error("CalDAV collection URL is invalid.");
  }
  if (url.protocol !== "https:") {
    throw new Error("CalDAV collection URL must use HTTPS.");
  }
  if (url.username || url.password) {
    throw new Error("CalDAV collection URL must not include embedded credentials.");
  }
  if (url.search || url.hash) {
    throw new Error("CalDAV collection URL must not include a query string or fragment.");
  }
}

function requireValidNumber(value, label, min, max = Infinity) {
  if (!Number.isInteger(value) || value < min || value > max) {
    const range = max === Infinity ? `${min} or higher` : `between ${min} and ${max}`;
    throw new Error(`${label} must be ${range}.`);
  }
}

function validateNumericSettings(settings) {
  requireValidNumber(settings.intervalMinutes, "Sync interval", 1);
  requireValidNumber(settings.deleteLimitPercent, "Delete guard", 1, 100);
  requireValidNumber(settings.syncPastMonths, "Sync past months", 0);
  requireValidNumber(settings.syncFutureMonths, "Sync future months", 0);
}

function validateSettings(settings) {
  validateNumericSettings(settings);
  validateCollectionUrlIfPresent(settings);
}

function requireConnection(settings) {
  requireLocalCalendar(settings);
  requireCollectionUrl(settings);
  validateCollectionUrlIfPresent(settings);
}

function requirePasswordForConnection(settings) {
  const savedPasswordMatchesUser = hasSavedPassword && settings.username === savedPasswordUsername;
  if (!settings.password && !savedPasswordMatchesUser) {
    throw new Error("Enter and save a CalDAV password first.");
  }
}

function downloadTextFile(filename, text, mimeType) {
  const encoded = encodeURIComponent(text);
  const link = document.createElement("a");
  link.download = filename;
  document.body.append(link);

  try {
    const blob = new Blob([text], { type: mimeType });
    const objectUrl = URL.createObjectURL(blob);
    link.href = objectUrl;
    link.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  } catch (_error) {
    link.href = `data:${mimeType},${encoded}`;
    link.click();
  } finally {
    link.remove();
  }
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.append(textarea);
  textarea.select();
  try {
    document.execCommand("copy");
  } finally {
    textarea.remove();
  }
}

function readSettings() {
  return {
    calendarId: fields.calendarId.value,
    collectionUrl: fields.collectionUrl.value.trim(),
    username: fields.username.value,
    password: fields.password.value,
    intervalMinutes: Number(fields.intervalMinutes.value || 15),
    deleteLimitPercent: Number(fields.deleteLimitPercent.value || 30),
    syncPastMonths: Number(fields.syncPastMonths.value || 0),
    syncFutureMonths: Number(fields.syncFutureMonths.value || 0),
    enabled: fields.enabled.checked
  };
}

function writeSettings(settings) {
  hasSavedPassword = !!settings.hasSavedPassword;
  savedPasswordUsername = hasSavedPassword ? (settings.username || "") : "";
  fields.calendarId.value = settings.calendarId || "";
  fields.collectionUrl.value = settings.collectionUrl || "";
  fields.username.value = settings.username || "";
  fields.password.value = "";
  fields.intervalMinutes.value = settings.intervalMinutes || 15;
  fields.deleteLimitPercent.value = settings.deleteLimitPercent || 30;
  fields.syncPastMonths.value = settings.syncPastMonths || 0;
  fields.syncFutureMonths.value = settings.syncFutureMonths || 0;
  fields.enabled.checked = !!settings.enabled;
  passwordStatusNode.textContent = settings.hasSavedPassword
    ? "A CalDAV password is saved in Thunderbird's Password Manager."
    : "No CalDAV password is saved.";
}

async function send(type, payload = {}) {
  const response = await browser.runtime.sendMessage({ type, ...payload });
  if (!response?.ok) {
    const message = response?.error || "Background request failed.";
    throw new Error(message);
  }
  return response.value;
}

async function refreshCalendars(selectedId = "") {
  const calendars = await send("listCalendars");
  fields.calendarId.textContent = "";
  if (!calendars.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No calendars found";
    fields.calendarId.append(option);
    return;
  }
  for (const calendar of calendars) {
    const option = document.createElement("option");
    option.value = calendar.id;
    option.textContent = `${calendar.name} (${calendar.type || "unknown"}${calendar.isLocal ? ", local" : ""}${calendar.source ? `, ${calendar.source}` : ""})`;
    option.disabled = !calendar.isLocal;
    fields.calendarId.append(option);
  }
  const selectedOption = Array.from(fields.calendarId.options)
    .find(option => option.value === selectedId && !option.disabled);
  fields.calendarId.value = selectedOption ? selectedId : "";
}

async function refreshLogs() {
  const logs = await send("getLogs");
  logsNode.textContent = logs.map(log => {
    const detail = log.detail ? `\n${JSON.stringify(log.detail, null, 2)}` : "";
    return `[${log.at}] ${log.level.toUpperCase()}: ${log.message}${detail}`;
  }).join("\n\n");
}

async function withBusy(button, action) {
  const previous = button.disabled;
  button.disabled = true;
  try {
    const result = await action();
    setStatus(result || "Done.");
    await refreshLogs();
    await refreshSyncStatus();
  } catch (error) {
    setStatus(error.message);
    try {
      await refreshLogs();
      await refreshSyncStatus();
    } catch (_) {
      // Keep the original action error visible.
    }
  } finally {
    button.disabled = previous;
  }
}

document.getElementById("refreshCalendars").addEventListener("click", () => {
  withBusy(document.getElementById("refreshCalendars"), () => refreshCalendars(fields.calendarId.value));
});

document.getElementById("diagnostics").addEventListener("click", event => {
  withBusy(event.currentTarget, () => send("calendarDiagnostics"));
});

document.getElementById("copyStatus").addEventListener("click", async event => {
  const button = event.currentTarget;
  const text = statusNode.textContent.trim();
  if (!text) {
    return;
  }

  const previousText = button.textContent;
  button.disabled = true;
  try {
    await copyTextToClipboard(text);
    button.textContent = "Copied";
  } catch (error) {
    setStatus(`Could not copy last result: ${error.message}`);
  } finally {
    setTimeout(() => {
      button.textContent = previousText;
      button.disabled = false;
    }, 1200);
  }
});

document.getElementById("save").addEventListener("click", event => {
  withBusy(event.currentTarget, async () => {
    const nextSettings = readSettings();
    validateSettings(nextSettings);
    if (nextSettings.enabled) {
      requireConnection(nextSettings);
      requirePasswordForConnection(nextSettings);
    }
    writeSettings(await send("setSettings", { settings: nextSettings }));
    return "Settings saved.";
  });
});

document.getElementById("validate").addEventListener("click", event => {
  withBusy(event.currentTarget, async () => {
    const settings = readSettings();
    validateSettings(settings);
    requireCollectionUrl(settings);
    requirePasswordForConnection(settings);
    const result = await send("validateCalDav", { settings });
    // Show inline feedback near the credentials, not just in the log panel
    const ok = result?.ok ?? (typeof result === "object" ? true : !!result);
    const msg = typeof result === "string"
      ? result
      : (result?.message || result?.status || (ok ? "Connected successfully." : "Connection failed."));
    passwordStatusNode.textContent = ok ? `✓ ${msg}` : `✗ ${msg}`;
    passwordStatusNode.className = ok ? "password-status status-ok" : "password-status status-err";
    return result;
  });
});

document.getElementById("clearCredentials").addEventListener("click", event => {
  withBusy(event.currentTarget, async () => {
    const settings = await send("clearCredentials");
    writeSettings(settings);
    return "Saved password cleared.";
  });
});

document.getElementById("backup").addEventListener("click", event => {
  withBusy(event.currentTarget, async () => {
    const settings = readSettings();
    validateNumericSettings(settings);
    requireLocalCalendar(settings);
    const ics = await send("exportBackup", { calendarId: settings.calendarId });
    downloadTextFile(
      `local-calendar-backup-${new Date().toISOString().slice(0, 10)}.ics`,
      ics,
      "text/calendar;charset=utf-8"
    );
    return "Backup download started.";
  });
});

document.getElementById("dryRun").addEventListener("click", event => {
  withBusy(event.currentTarget, async () => {
    const settings = readSettings();
    validateSettings(settings);
    requireConnection(settings);
    requirePasswordForConnection(settings);
    writeSettings(await send("setSettings", { settings }));
    return send("dryRun");
  });
});

document.getElementById("syncNow").addEventListener("click", event => {
  withBusy(event.currentTarget, async () => {
    const settings = readSettings();
    validateSettings(settings);
    requireConnection(settings);
    requirePasswordForConnection(settings);
    writeSettings(await send("setSettings", { settings }));
    return send("syncNow", { forceDeletes: false });
  });
});

document.getElementById("syncForce").addEventListener("click", event => {
  withBusy(event.currentTarget, async () => {
    const settings = readSettings();
    validateSettings(settings);
    requireConnection(settings);
    requirePasswordForConnection(settings);
    if (!confirm("Force sync bypasses the delete guard. Continue only if the planned deletes are expected.")) {
      return "Force sync cancelled.";
    }
    writeSettings(await send("setSettings", { settings }));
    return send("syncNow", { forceDeletes: true });
  });
});

document.getElementById("resetState").addEventListener("click", event => {
  withBusy(event.currentTarget, async () => {
    if (!confirm("Reset mirror state? Remote events are not changed, but the next sync may re-upload local events.")) {
      return "Reset cancelled.";
    }
    await send("resetState");
    return "Mirror state reset. Remote events were not changed.";
  });
});

// ── Sync status badge ─────────────────────────────────────────────────
function timeAgo(isoString) {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.floor(diffH / 24)}d ago`;
}

async function refreshSyncStatus() {
  const badge = document.getElementById("syncStatus");
  try {
    const status = await send("getSyncStatus");
    if (!status) {
      badge.textContent = "● Never synced";
      badge.className = "sync-badge sync-idle";
    } else if (status.ok) {
      badge.textContent = `✓ Synced ${timeAgo(status.at)}`;
      badge.className = "sync-badge sync-ok";
    } else {
      badge.textContent = `✗ Failed ${timeAgo(status.at)}`;
      badge.className = "sync-badge sync-error";
    }
  } catch (_) {
    badge.textContent = "● Idle";
    badge.className = "sync-badge sync-idle";
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    history.replaceState(null, "", `${location.pathname}${location.search}`);
  } catch (_) {
    // Some embedded Thunderbird contexts can reject history changes.
  }
  showSection("section-connection", { resetScroll: true });
  setTimeout(resetScrollPosition, 0);

  const fallbackSettings = {
    calendarId: "",
    collectionUrl: "",
    username: "",
    intervalMinutes: 15,
    deleteLimitPercent: 30,
    enabled: false,
    hasSavedPassword: false
  };
  writeSettings(fallbackSettings);

  try {
    const settings = await send("getSettings");
    writeSettings(settings);
    await refreshCalendars(settings.calendarId);
    await refreshLogs();
    await refreshSyncStatus();
    setInterval(refreshSyncStatus, 30_000);
    setStatus("Ready.");
  } catch (error) {
    setStatus(`Initialization failed: ${error.message}`);
  }
});
