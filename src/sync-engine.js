"use strict";

const MirrorSync = (() => {
  const defaultState = {
    version: 1,
    events: {}
  };

  async function sha256(text) {
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
      .map(byte => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  async function loadState() {
    const { mirrorState } = await browser.storage.local.get({ mirrorState: defaultState });
    return {
      ...defaultState,
      ...mirrorState,
      events: { ...(mirrorState?.events || {}) }
    };
  }

  async function saveState(state) {
    await browser.storage.local.set({ mirrorState: state });
  }

  async function buildLocalIndex(exportedCalendar) {
    const index = {};
    for (const event of exportedCalendar.events) {
      index[event.uid] = {
        ...event,
        hash: await sha256(event.ics)
      };
    }
    return index;
  }

  function plannedActions(localIndex, state) {
    const actions = [];
    const seen = new Set();

    for (const [uid, event] of Object.entries(localIndex)) {
      seen.add(uid);
      const prior = state.events[uid];
      if (!prior) {
        actions.push({ type: "create", uid, event });
      } else if (prior.hash !== event.hash) {
        actions.push({ type: "update", uid, event, prior });
      }
    }

    for (const [uid, prior] of Object.entries(state.events)) {
      if (!seen.has(uid) && !prior.deleted) {
        actions.push({ type: "delete", uid, prior });
      }
    }

    return actions;
  }

  function deletionGuard(actions, state, settings, forceDeletes) {
    const trackedCount = Object.values(state.events).filter(event => !event.deleted).length;
    const deleteCount = actions.filter(action => action.type === "delete").length;
    const limit = Number(settings.deleteLimitPercent || 30);
    if (!forceDeletes && trackedCount > 0 && deleteCount > 0 && deleteCount / trackedCount * 100 > limit) {
      throw new Error(`Refusing to delete ${deleteCount}/${trackedCount} mirrored events. Re-run with force deletes if this is expected.`);
    }
  }

  async function run(settings, options = {}) {
    if (!settings.calendarId) {
      throw new Error("Select a local Thunderbird calendar before syncing.");
    }
    if (!settings.collectionUrl) {
      throw new Error("Configure a CalDAV collection URL before syncing.");
    }

    const onProgress = typeof options.onProgress === "function" ? options.onProgress : () => {};

    onProgress("Exporting local calendar…");
    const exportedCalendar = await browser.CalDavSync.exportCalendar(
      settings.calendarId,
      settings.syncPastMonths,
      settings.syncFutureMonths
    );
    const localIndex = await buildLocalIndex(exportedCalendar);
    const state = await loadState();
    const actions = plannedActions(localIndex, state);
    deletionGuard(actions, state, settings, !!options.forceDeletes);

    const summary = {
      calendar: exportedCalendar.calendar,
      dryRun: !!options.dryRun,
      totalLocalEvents: exportedCalendar.events.length,
      create: 0,
      update: 0,
      delete: 0,
      errors: [],
      actions: actions.map(action => ({
        type: action.type,
        uid: action.uid,
        title: action.event?.title || ""
      }))
    };

    if (options.dryRun) {
      for (const action of actions) {
        summary[action.type] += 1;
      }
      return summary;
    }

    const total = actions.length;
    let done = 0;

    for (const action of actions) {
      done++;
      onProgress(`${action.type === "create" ? "↑" : action.type === "update" ? "↻" : "✕"} ${action.event?.title || action.uid} (${done}/${total})`);
      try {
        if (action.type === "create") {
          let remote;
          try {
            remote = await CalDav.putEvent(settings, action.uid, action.event.ics);
          } catch (error) {
            if (!/HTTP 412/.test(error.message)) {
              throw error;
            }
            remote = await CalDav.overwriteEvent(settings, action.uid, action.event.ics);
          }
          state.events[action.uid] = {
            href: remote.href,
            etag: remote.etag,
            hash: action.event.hash,
            lastSeen: new Date().toISOString()
          };
        }

        if (action.type === "update") {
          let remote;
          try {
            remote = await CalDav.overwriteEvent(
              settings,
              action.uid,
              action.event.ics,
              action.prior?.etag || null
            );
          } catch (error) {
            if (!/HTTP 412/.test(error.message)) {
              throw error;
            }
            remote = await CalDav.overwriteEvent(settings, action.uid, action.event.ics);
          }
          state.events[action.uid] = {
            href: remote.href || action.prior.href,
            etag: remote.etag,
            hash: action.event.hash,
            lastSeen: new Date().toISOString()
          };
        }

        if (action.type === "delete") {
          try {
            await CalDav.deleteEvent(settings, action.prior.href, action.prior.etag || null);
          } catch (error) {
            if (/HTTP 412/.test(error.message)) {
              await CalDav.deleteEvent(settings, action.prior.href);
            } else if (!/HTTP 404/.test(error.message)) {
              throw error;
            }
          }
          state.events[action.uid] = {
            ...action.prior,
            deleted: true,
            deletedAt: new Date().toISOString()
          };
        }

        summary[action.type] += 1;
      } catch (error) {
        summary.errors.push({ uid: action.uid, type: action.type, message: error.message });
      }
    }

    onProgress(`Saving state…`);
    await saveState(state);
    onProgress(`Done. ${summary.create} created, ${summary.update} updated, ${summary.delete} deleted.`);
    return summary;
  }

  async function resetState() {
    await saveState(defaultState);
  }

  async function exportBackup(calendarId) {
    const exportedCalendar = await browser.CalDavSync.exportCalendar(calendarId);
    const body = exportedCalendar.events
      .map(event => event.ics.replace(/^BEGIN:VCALENDAR\r?\n/i, "").replace(/\r?\nEND:VCALENDAR\r?\n?$/i, ""))
      .join("\r\n");
    return [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Local Calendar CalDAV Mirror Backup//EN",
      `X-WR-CALNAME:${exportedCalendar.calendar.name}`,
      body,
      "END:VCALENDAR",
      ""
    ].join("\r\n");
  }

  return {
    run,
    loadState,
    resetState,
    exportBackup
  };
})();
