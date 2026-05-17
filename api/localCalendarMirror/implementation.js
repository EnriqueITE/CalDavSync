"use strict";

var { ExtensionCommon } = ChromeUtils.importESModule(
  "resource://gre/modules/ExtensionCommon.sys.mjs"
);
if (typeof Services === "undefined") {
  try {
    var { Services } = ChromeUtils.importESModule(
      "resource://gre/modules/Services.sys.mjs"
    );
  } catch (_error) {
    // Thunderbird 128+: Services is available as a global.
  }
}
var calModule = null;
var calModuleError = "";

function getCal() {
  if (calModule || calModuleError) {
    return calModule?.cal || null;
  }

  try {
    calModule = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
  } catch (error) {
    calModuleError = error.message;
  }
  return calModule?.cal || null;
}

function getCalendars() {
  try {
    return getCalendarManager().getCalendars();
  } catch (_error) {
    return [];
  }
}

function getCalendarManager() {
  const cal = getCal();
  if (cal?.manager) {
    return cal.manager;
  }
  if (typeof cal?.getCalendarManager == "function") {
    return cal.getCalendarManager();
  }
  try {
    return Components.classes["@mozilla.org/calendar/manager;1"]
      .getService(Components.interfaces.calICalendarManager);
  } catch (_error) {
    return { getCalendars: () => [] };
  }
}

function getCalendar(calendarId) {
  return getCalendars().find(calendar => calendar.id === calendarId);
}

function isLocalStorageCalendar(calendar) {
  const uri = String(calendar.uri?.spec || "");
  return (
    calendar.type === "storage" ||
    calendar.type === "ics" ||
    uri.startsWith("moz-storage-calendar:") ||
    uri.startsWith("file:")
  );
}

function getRegistryCalendars() {
  const branch = "calendar.registry.";
  const ids = new Set();
  for (const key of Services.prefs.getChildList(branch)) {
    const end = key.indexOf(".", branch.length);
    if (end > branch.length) {
      ids.add(key.slice(branch.length, end));
    }
  }

  return Array.from(ids).map(id => {
    const prefix = `${branch}${id}.`;
    const type = Services.prefs.getStringPref(`${prefix}type`, "");
    const uri = Services.prefs.getStringPref(`${prefix}uri`, "");
    return {
      id,
      name: Services.prefs.getStringPref(`${prefix}name`, id),
      type,
      uri,
      readOnly: Services.prefs.getBoolPref(`${prefix}readOnly`, false),
      disabled: Services.prefs.getBoolPref(`${prefix}disabled`, false),
      isLocal: type === "storage" || type === "ics" || uri.startsWith("moz-storage-calendar:") || uri.startsWith("file:"),
      source: "registry"
    };
  });
}

function getIcsService() {
  const cal = getCal();
  if (cal?.getIcsService) {
    return cal.getIcsService();
  }
  return Components.classes["@mozilla.org/calendar/ics-service;1"]
    .getService(Components.interfaces.calIIcsService);
}

function calendarSummary(calendar) {
  return {
    id: calendar.id,
    name: calendar.name,
    type: calendar.type,
    uri: calendar.uri?.spec || "",
    readOnly: !!calendar.readOnly,
    disabled: !!calendar.getProperty("disabled"),
    isLocal: isLocalStorageCalendar(calendar),
    source: "manager"
  };
}

function stripSchedulingMethod(ics) {
  return ics
    .split(/\r?\n/)
    .filter(line => !/^METHOD\s*:/i.test(line))
    .join("\r\n");
}

function itemUid(item) {
  return item.id || item.icalComponent?.getFirstPropertyValue("UID") || "";
}

function itemLastModified(item) {
  return (
    item.lastModifiedTime?.icalString ||
    item.stampTime?.icalString ||
    ""
  );
}

async function getCalendarItems(calendar) {
  const filter = Components.interfaces.calICalendar.ITEM_FILTER_TYPE_EVENT;
  if (typeof calendar.getItemsAsArray == "function") {
    return calendar.getItemsAsArray(filter, 0, null, null);
  }

  return new Promise((resolve, reject) => {
    const items = [];
    calendar.getItems(filter, 0, null, null, {
      onGetResult(_calendar, status, _itemType, _detail, count, foundItems) {
        if (!Components.isSuccessCode(status)) {
          reject(new Error(`Calendar read failed with status ${status}`));
          return;
        }
        for (let i = 0; i < count; i += 1) {
          items.push(foundItems[i]);
        }
      },
      onOperationComplete(_calendar, status) {
        if (!Components.isSuccessCode(status)) {
          reject(new Error(`Calendar read failed with status ${status}`));
          return;
        }
        resolve(items);
      }
    });
  });
}

function serializeEvent(item) {
  const component = item.icalComponent;
  if (!component) {
    return null;
  }

  const icsService = getIcsService();
  const vcalendar = icsService.createIcalComponent("VCALENDAR");
  const version = icsService.createIcalProperty("VERSION");
  version.value = "2.0";
  vcalendar.addProperty(version);
  const prodid = icsService.createIcalProperty("PRODID");
  prodid.value = "-//Local Calendar CalDAV Mirror//EN";
  vcalendar.addProperty(prodid);
  vcalendar.addSubcomponent(component.clone());

  return stripSchedulingMethod(vcalendar.serializeToICS());
}

var CalDavSync = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    function wrapResult(callback) {
      return context.wrapPromise(Promise.resolve().then(callback));
    }

    return {
      CalDavSync: {
        ping() {
          return wrapResult(() => ({
            ok: true,
            namespace: "CalDavSync",
            at: new Date().toISOString()
          }));
        },

        listCalendars() {
          return wrapResult(() => {
            const managerCalendars = getCalendars().map(calendarSummary);
            if (managerCalendars.length) {
              return managerCalendars;
            }
            return getRegistryCalendars();
          });
        },

        diagnostics() {
          return wrapResult(() => {
            let managerCalendars = [];
            let managerError = "";
            try {
              managerCalendars = getCalendars().map(calendarSummary);
            } catch (error) {
              managerError = error.message;
            }
            return {
              calModuleLoaded: !!getCal(),
              calModuleError,
              hasCalManager: !!getCal()?.manager,
              hasGetCalendarManager: typeof getCal()?.getCalendarManager == "function",
              managerError,
              managerCalendars,
              registryCalendars: getRegistryCalendars()
            };
          });
        },

        exportCalendar(calendarId) {
          return wrapResult(async () => {
            const calendar = getCalendar(calendarId);
            if (!calendar) {
              throw new Error(`Calendar not found: ${calendarId}`);
            }
            if (!isLocalStorageCalendar(calendar)) {
              throw new Error(`Refusing to mirror non-local calendar: ${calendar.name}`);
            }

            const items = await getCalendarItems(calendar);
            const events = [];
            for (const item of items) {
              if (!item.isEvent?.()) {
                continue;
              }
              const ics = serializeEvent(item);
              const uid = itemUid(item);
              if (!ics || !uid) {
                continue;
              }
              events.push({
                uid,
                title: item.title || "",
                lastModified: itemLastModified(item),
                ics
              });
            }

            return {
              calendar: {
                id: calendar.id,
                name: calendar.name
              },
              exportedAt: new Date().toISOString(),
              events
            };
          });
        }
      }
    };
  }

  onShutdown(isAppShutdown) {
    if (!isAppShutdown) {
      Services.obs.notifyObservers(null, "startupcache-invalidate");
    }
  }
};
