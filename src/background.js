"use strict";

const DEFAULT_SETTINGS = {
  calendarId: "",
  collectionUrl: "",
  username: "",
  deleteLimitPercent: 30,
  intervalMinutes: 15,
  enabled: false
};

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
    hasSavedPassword: await Secrets.hasPassword()
  };
}

async function setSettings(settings) {
  if (settings.password) {
    await Secrets.savePassword(settings.password);
  }
  await browser.storage.local.set({
    settings: {
      ...DEFAULT_SETTINGS,
      ...sanitizeSettings(settings)
    }
  });
  await configureAlarm();
  return getSettings();
}

async function settingsWithPassword(settings = null) {
  const safeSettings = settings ? { ...DEFAULT_SETTINGS, ...sanitizeSettings(settings) } : await getSettings();
  const password = settings?.password || await Secrets.loadPassword();
  return { ...safeSettings, password };
}

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

async function configureAlarm() {
  const settings = await getSettings();
  await browser.alarms.clear("mirror-sync");
  if (settings.enabled) {
    await browser.alarms.create("mirror-sync", {
      periodInMinutes: Math.max(1, Number(settings.intervalMinutes || 15))
    });
  }
}

async function runSync(options = {}) {
  const settings = await settingsWithPassword();
  const summary = await MirrorSync.run(settings, options);
  await appendLog(
    summary.errors.length ? "error" : "info",
    `${summary.dryRun ? "Dry run" : "Sync"}: ${summary.create} created, ${summary.update} updated, ${summary.delete} deleted`,
    summary
  );
  return summary;
}

browser.runtime.onInstalled.addListener(configureAlarm);
browser.runtime.onStartup.addListener(configureAlarm);

browser.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name !== "mirror-sync") {
    return;
  }
  try {
    await runSync();
  } catch (error) {
    await appendLog("error", error.message);
  }
});

async function handleMessage(message) {
  if (message?.type === "pingExperiment") {
    return browser.CalDavSync.ping();
  }
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
    await Secrets.clearPassword();
    return getSettings();
  }
  if (message?.type === "exportBackup") {
    return MirrorSync.exportBackup(message.calendarId);
  }
  if (message?.type === "getLogs") {
    return browser.storage.local.get({ logs: [] }).then(result => result.logs);
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
      error: error.message || String(error),
      stack: error.stack || ""
    };
  }
});
