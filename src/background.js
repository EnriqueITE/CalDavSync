"use strict";

const DEFAULT_SETTINGS = {
  calendarId: "",
  collectionUrl: "",
  username: "",
  deleteLimitPercent: 30,
  intervalMinutes: 15,
  syncPastMonths: 0,
  syncFutureMonths: 0,
  enabled: false
};

// ── Password is NEVER stored in settings/storage.local ────────────────
// sanitizeSettings strips it before any write to storage.
function sanitizeSettings(settings) {
  const sanitized = { ...settings };
  delete sanitized.password;
  return sanitized;
}

async function getSettings() {
  const { settings } = await browser.storage.local.get({ settings: DEFAULT_SETTINGS });
  return {
    ...DEFAULT_SETTINGS,
    ...sanitizeSettings(settings || {}),
    hasSavedPassword: await Secrets.hasPassword(settings?.username)
  };
}

function requireValidNumber(value, label, min, max = Infinity) {
  if (!Number.isInteger(value) || value < min || value > max) {
    const range = max === Infinity ? `${min} or higher` : `between ${min} and ${max}`;
    throw new Error(`${label} must be ${range}.`);
  }
}

function validateSettingsShape(settings) {
  requireValidNumber(Number(settings.intervalMinutes), "Sync interval", 1);
  requireValidNumber(Number(settings.deleteLimitPercent), "Delete guard", 1, 100);
  requireValidNumber(Number(settings.syncPastMonths), "Sync past months", 0);
  requireValidNumber(Number(settings.syncFutureMonths), "Sync future months", 0);
  if (settings.collectionUrl) {
    CalDav.normalizeCollectionUrl(settings.collectionUrl);
  }
}

async function assertCanEnable(settings) {
  if (!settings.enabled) {
    return;
  }
  if (!settings.calendarId) {
    throw new Error("Select a local Thunderbird calendar before enabling automatic sync.");
  }
  if (!settings.collectionUrl) {
    throw new Error("Configure a CalDAV collection URL before enabling automatic sync.");
  }
  if (!settings.password && !await Secrets.hasPassword(settings.username)) {
    throw new Error("Enter and save a CalDAV password before enabling automatic sync.");
  }
}

async function setSettings(settings) {
  const nextSettings = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  validateSettingsShape(nextSettings);
  await assertCanEnable(nextSettings);
  if (nextSettings.password) {
    await Secrets.savePassword(nextSettings.username, nextSettings.password);
  }
  await browser.storage.local.set({
    settings: {
      ...DEFAULT_SETTINGS,
      ...sanitizeSettings(nextSettings)  // password stripped here
    }
  });
  await configureAlarm();
  return getSettings();
}

async function settingsWithPassword(settings = null) {
  const safeSettings = settings ? { ...DEFAULT_SETTINGS, ...sanitizeSettings(settings) } : await getSettings();
  // Password always fetched fresh from native Password Manager, never from storage
  const password = settings?.password || await Secrets.loadPassword(safeSettings.username);
  return { ...safeSettings, password };
}

// ── Redact sensitive data from logs ──────────────────────────────────
function redactDetail(detail) {
  if (!detail || typeof detail !== "object") {
    return detail;
  }
  return JSON.parse(JSON.stringify(detail, (key, value) => {
    if (key.toLowerCase().includes("password")) {
      return "[redacted]";
    }
    if (key === "collectionUrl" && typeof value === "string") {
      try {
        const url = new URL(value);
        url.username = "";
        url.password = "";
        return url.toString();
      } catch (_error) {
        return "[configured]";
      }
    }
    return value;
  }));
}

async function appendLog(level, message, detail = null) {
  const { logs = [] } = await browser.storage.local.get({ logs: [] });
  logs.unshift({
    at: new Date().toISOString(),
    level,
    message,
    detail: redactDetail(detail)
  });
  await browser.storage.local.set({ logs: logs.slice(0, 200) });
}

// ── Sync status: last sync timestamp & result ─────────────────────────
async function setSyncStatus(status) {
  await browser.storage.local.set({ syncStatus: status });
}

async function getSyncStatus() {
  const { syncStatus = null } = await browser.storage.local.get("syncStatus");
  return syncStatus;
}

// ── Notifications ─────────────────────────────────────────────────────
async function notifyError(message) {
  try {
    await browser.notifications.create("caldavsync-error", {
      type: "basic",
      title: "CalDavSync — Sync failed",
      message
    });
  } catch (_) {
    // Notifications not available in all environments
  }
}

// ── Alarm / schedule ──────────────────────────────────────────────────
async function configureAlarm() {
  const settings = await getSettings();
  await browser.alarms.clear("mirror-sync");
  if (settings.enabled) {
    await browser.alarms.create("mirror-sync", {
      periodInMinutes: Math.max(1, Number(settings.intervalMinutes || 15))
    });
  }
}

// ── #6 Retry with exponential backoff ────────────────────────────────
async function withRetry(fn, maxAttempts = 3, baseDelayMs = 1500) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      // Don't retry on clear client errors (auth, not-found, bad request)
      if (/HTTP 4\d\d/.test(err.message) && !/HTTP 408|HTTP 429/.test(err.message)) {
        throw err;
      }
      if (attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, baseDelayMs * 2 ** (attempt - 1)));
      }
    }
  }
  throw lastError;
}

// ── Core sync runner (#5 progress via status broadcast) ───────────────
async function runSync(options = {}) {
  const settings = await settingsWithPassword();

  // Broadcast progress updates to the options page if it's open
  function broadcastProgress(msg) {
    browser.runtime.sendMessage({ type: "_syncProgress", message: msg }).catch(() => {});
  }

  const summary = await MirrorSync.run(settings, { ...options, onProgress: broadcastProgress });
  const hasErrors = summary.errors.length > 0;
  const label = summary.dryRun ? "Dry run" : "Sync";
  await appendLog(
    hasErrors ? "error" : "info",
    `${label}: ${summary.create} created, ${summary.update} updated, ${summary.delete} deleted`,
    summary
  );
  if (!summary.dryRun) {
    await setSyncStatus({
      at: new Date().toISOString(),
      ok: !hasErrors,
      create: summary.create,
      update: summary.update,
      delete: summary.delete,
      errorCount: summary.errors.length
    });
  }
  return summary;
}

browser.runtime.onInstalled.addListener(configureAlarm);
browser.runtime.onStartup.addListener(configureAlarm);

browser.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name !== "mirror-sync") {
    return;
  }
  try {
    const summary = await runSync();
    if (summary.errors.length > 0) {
      await notifyError(
        `${summary.errors.length} event(s) failed to sync. Open CalDavSync settings for details.`
      );
    }
  } catch (error) {
    await appendLog("error", error.message);
    await setSyncStatus({ at: new Date().toISOString(), ok: false, errorCount: 1 });
    await notifyError(`Sync failed: ${error.message}`);
  }
});

// Message handler.
async function handleMessage(message) {
  if (message?.type === "listCalendars") {
    return browser.CalDavSync.listCalendars();
  }
  if (message?.type === "calendarDiagnostics") {
    return browser.CalDavSync.diagnostics();
  }
  if (message?.type === "getSettings") {
    return getSettings();
  }
  if (message?.type === "setSettings") {
    return setSettings(message.settings);
  }
  if (message?.type === "validateCalDav") {
    const settings = await settingsWithPassword(message.settings);
    return CalDav.validate(settings);
  }
  if (message?.type === "dryRun") {
    return runSync({ dryRun: true });
  }
  if (message?.type === "syncNow") {
    return runSync({ forceDeletes: !!message.forceDeletes });
  }
  if (message?.type === "resetState") {
    return MirrorSync.resetState();
  }
  if (message?.type === "clearCredentials") {
    const currentSettings = await getSettings();
    await Secrets.clearPassword(currentSettings.username);
    return getSettings();
  }
  if (message?.type === "exportBackup") {
    return MirrorSync.exportBackup(message.calendarId);
  }
  if (message?.type === "getLogs") {
    return browser.storage.local.get({ logs: [] }).then(result => result.logs);
  }
  if (message?.type === "getSyncStatus") {
    return getSyncStatus();
  }
  throw new Error(`Unknown message type: ${message?.type || "missing"}`);
}

browser.runtime.onMessage.addListener(async message => {
  try {
    return { ok: true, value: await handleMessage(message) };
  } catch (error) {
    await appendLog("error", error.message, { type: message?.type, stack: error.stack || "" });
    return {
      ok: false,
      error: error.message || String(error)
    };
  }
});
