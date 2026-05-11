"use strict";

const DEFAULT_SETTINGS = {
  calendarId: "",
  collectionUrl: "",
  username: "",
  password: "",
  deleteLimitPercent: 30,
  intervalMinutes: 15,
  enabled: false
};

async function getSettings() {
  const { settings } = await browser.storage.local.get({ settings: DEFAULT_SETTINGS });
  return { ...DEFAULT_SETTINGS, ...(settings || {}) };
}

async function setSettings(settings) {
  await browser.storage.local.set({ settings: { ...DEFAULT_SETTINGS, ...settings } });
  await configureAlarm();
}

async function appendLog(level, message, detail = null) {
  const { logs = [] } = await browser.storage.local.get({ logs: [] });
  logs.unshift({
    at: new Date().toISOString(),
    level,
    message,
    detail
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
  const settings = await getSettings();
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

browser.runtime.onMessage.addListener((message) => {
  if (message?.type === "listCalendars") {
    return browser.localCalendarMirror.listCalendars();
  }
  if (message?.type === "getSettings") {
    return getSettings();
  }
  if (message?.type === "setSettings") {
    return setSettings(message.settings);
  }
  if (message?.type === "validateCalDav") {
    return CalDav.validate(message.settings);
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
  if (message?.type === "exportBackup") {
    return MirrorSync.exportBackup(message.calendarId);
  }
  if (message?.type === "getLogs") {
    return browser.storage.local.get({ logs: [] }).then(result => result.logs);
  }
  return undefined;
});
