"use strict";

var { ExtensionCommon } = ChromeUtils.importESModule(
  "resource://gre/modules/ExtensionCommon.sys.mjs"
);
var { Services } = ChromeUtils.importESModule(
  "resource://gre/modules/Services.sys.mjs"
);
var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");

function getCalendars() {
  return getCalendarManager().getCalendars();
}

function getCalendarManager() {
  if (cal.manager) {
    return cal.manager;
  }
  if (typeof cal.getCalendarManager == "function") {
    return cal.getCalendarManager();
  }
  return Components.classes["@mozilla.org/calendar/manager;1"]
    .getService(Components.interfaces.calICalendarManager);
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

  const vcalendar = cal.getIcsService().createIcalComponent("VCALENDAR");
  const version = cal.getIcsService().createIcalProperty("VERSION");
  version.value = "2.0";
  vcalendar.addProperty(version);
  const prodid = cal.getIcsService().createIcalProperty("PRODID");
  prodid.value = "-//Local Calendar CalDAV Mirror//EN";
  vcalendar.addProperty(prodid);
  vcalendar.addSubcomponent(component.clone());

  return stripSchedulingMethod(vcalendar.serializeToICS());
}

var localCalendarMirror = class extends ExtensionCommon.ExtensionAPI {
  getAPI() {
    return {
      localCalendarMirror: {
        async listCalendars() {
          const calendars = getCalendars().map(calendarSummary);
          if (calendars.length) {
            return calendars;
          }
          return getRegistryCalendars();
        },

        async diagnostics() {
          let managerCalendars = [];
          let managerError = "";
          try {
            managerCalendars = getCalendars().map(calendarSummary);
          } catch (error) {
            managerError = error.message;
          }
          return {
            hasCalManager: !!cal.manager,
            hasGetCalendarManager: typeof cal.getCalendarManager == "function",
            managerError,
            managerCalendars,
            registryCalendars: getRegistryCalendars()
          };
        },

        async exportCalendar(calendarId) {
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
