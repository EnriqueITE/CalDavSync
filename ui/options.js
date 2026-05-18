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

// Live progress from background sync
browser.runtime.onMessage.addListener(msg => {
  if (msg?.type === "_syncProgress") {
    setStatus(`⏳ ${msg.message}`);
  }
});

function setStatus(value) {
  statusNode.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
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
    throw new Error(response?.stack ? `${message}\n\n${response.stack}` : message);
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
  fields.calendarId.value = selectedId;
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
  } finally {
    button.disabled = previous;
  }
}

document.getElementById("refreshCalendars").addEventListener("click", () => {
  withBusy(document.getElementById("refreshCalendars"), () => refreshCalendars(fields.calendarId.value));
});

document.getElementById("pingExperiment").addEventListener("click", event => {
  withBusy(event.currentTarget, () => send("pingExperiment"));
});

document.getElementById("diagnostics").addEventListener("click", event => {
  withBusy(event.currentTarget, () => send("calendarDiagnostics"));
});

document.getElementById("save").addEventListener("click", event => {
  withBusy(event.currentTarget, async () => {
    const settings = await send("setSettings", { settings: readSettings() });
    writeSettings(settings);
    return "Settings saved.";
  });
});

document.getElementById("validate").addEventListener("click", event => {
  withBusy(event.currentTarget, async () => {
    const result = await send("validateCalDav", { settings: readSettings() });
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
    const ics = await send("exportBackup", { calendarId: settings.calendarId });
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `local-calendar-backup-${new Date().toISOString().slice(0, 10)}.ics`;
    link.click();
    URL.revokeObjectURL(link.href);
    return "Backup download started.";
  });
});

document.getElementById("dryRun").addEventListener("click", event => {
  withBusy(event.currentTarget, async () => {
    writeSettings(await send("setSettings", { settings: readSettings() }));
    return send("dryRun");
  });
});

document.getElementById("syncNow").addEventListener("click", event => {
  withBusy(event.currentTarget, async () => {
    writeSettings(await send("setSettings", { settings: readSettings() }));
    return send("syncNow", { forceDeletes: false });
  });
});

document.getElementById("syncForce").addEventListener("click", event => {
  withBusy(event.currentTarget, async () => {
    writeSettings(await send("setSettings", { settings: readSettings() }));
    return send("syncNow", { forceDeletes: true });
  });
});

document.getElementById("resetState").addEventListener("click", event => {
  withBusy(event.currentTarget, async () => {
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
