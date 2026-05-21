"use strict";

const CalDav = (() => {
  const managedProperty = "X-LOCAL-CALDAV-MIRROR-MANAGED";

  function normalizeCollectionUrl(url) {
    const trimmed = String(url || "").trim();
    if (!trimmed) {
      throw new Error("CalDAV collection URL is required.");
    }
    let parsed;
    try {
      parsed = new URL(trimmed);
    } catch (_error) {
      throw new Error("CalDAV collection URL is invalid.");
    }
    if (parsed.protocol !== "https:") {
      throw new Error("CalDAV collection URL must use HTTPS.");
    }
    if (parsed.username || parsed.password) {
      throw new Error("CalDAV collection URL must not include embedded credentials.");
    }
    if (parsed.search || parsed.hash) {
      throw new Error("CalDAV collection URL must not include a query string or fragment.");
    }
    if (!parsed.pathname.endsWith("/")) {
      parsed.pathname = `${parsed.pathname}/`;
    }
    return parsed.toString();
  }

  function urlForLog(url) {
    try {
      const parsed = new URL(url);
      parsed.username = "";
      parsed.password = "";
      return parsed.toString();
    } catch (_error) {
      return "[invalid URL]";
    }
  }

  function eventUrl(collectionUrl, uid) {
    const safeUid = encodeURIComponent(uid).replace(/%40/g, "@");
    return `${normalizeCollectionUrl(collectionUrl)}${safeUid}.ics`;
  }

  function authHeaders(settings) {
    const headers = {
      "User-Agent": "LocalCalendarCalDAVMirror/0.1.0"
    };
    if (settings.username || settings.password) {
      headers.Authorization = `Basic ${btoa(`${settings.username || ""}:${settings.password || ""}`)}`;
    }
    return headers;
  }

  function ensurePassiveMirrorPayload(ics) {
    let payload = String(ics || "").replace(/\r?\n/g, "\r\n");
    payload = payload
      .split("\r\n")
      .filter(line => !/^METHOD\s*:/i.test(line))
      .join("\r\n");

    if (!payload.includes(managedProperty)) {
      payload = payload.replace(
        /\r\nEND:VEVENT/i,
        `\r\n${managedProperty}:TRUE\r\nEND:VEVENT`
      );
    }
    return payload.endsWith("\r\n") ? payload : `${payload}\r\n`;
  }

  function parseMultiStatus(xmlText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, "application/xml");
    if (doc.querySelector("parsererror")) {
      throw new Error("CalDAV server returned invalid XML.");
    }
    return Array.from(doc.getElementsByTagNameNS("*", "response")).map(response => {
      const href = response.getElementsByTagNameNS("*", "href")[0]?.textContent || "";
      const etag = response.getElementsByTagNameNS("*", "getetag")[0]?.textContent || "";
      const calendarData = response.getElementsByTagNameNS("*", "calendar-data")[0]?.textContent || "";
      return { href, etag: etag.replace(/^"|"$/g, ""), calendarData };
    });
  }

  async function request(settings, method, url, body, extraHeaders = {}) {
    const response = await fetch(url, {
      method,
      headers: {
        ...authHeaders(settings),
        ...extraHeaders
      },
      body
    });
    const text = await response.text();
    if (!response.ok && response.status !== 207) {
      throw new Error(`${method} ${urlForLog(url)} failed: HTTP ${response.status} ${response.statusText}${text ? ` - ${text.slice(0, 500)}` : ""}`);
    }
    return { response, text };
  }

  async function validate(settings) {
    const url = normalizeCollectionUrl(settings.collectionUrl);
    const body = `<?xml version="1.0" encoding="utf-8" ?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:resourcetype/>
    <d:displayname/>
  </d:prop>
</d:propfind>`;
    const { response } = await request(settings, "PROPFIND", url, body, {
      Depth: "0",
      "Content-Type": "application/xml; charset=utf-8"
    });
    return { ok: response.status === 207 || response.ok, status: response.status };
  }

  async function listManaged(settings) {
    const url = normalizeCollectionUrl(settings.collectionUrl);
    const body = `<?xml version="1.0" encoding="utf-8" ?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag/>
    <c:calendar-data/>
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT"/>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`;
    const { text } = await request(settings, "REPORT", url, body, {
      Depth: "1",
      "Content-Type": "application/xml; charset=utf-8"
    });
    return parseMultiStatus(text).filter(item => item.calendarData.includes(managedProperty));
  }

  async function putEvent(settings, uid, ics, etag = null) {
    const url = eventUrl(settings.collectionUrl, uid);
    const headers = {
      "Content-Type": "text/calendar; charset=utf-8",
      "If-Match": etag || "*"
    };
    if (!etag) {
      headers["If-None-Match"] = "*";
      delete headers["If-Match"];
    }

    const { response } = await request(settings, "PUT", url, ensurePassiveMirrorPayload(ics), headers);
    return {
      href: new URL(url).pathname,
      etag: (response.headers.get("ETag") || "").replace(/^"|"$/g, "")
    };
  }

  async function overwriteEvent(settings, uid, ics, etag = null) {
    const url = eventUrl(settings.collectionUrl, uid);
    const headers = {
      "Content-Type": "text/calendar; charset=utf-8"
    };
    if (etag) {
      headers["If-Match"] = etag;
    }
    const { response } = await request(settings, "PUT", url, ensurePassiveMirrorPayload(ics), headers);
    return {
      href: new URL(url).pathname,
      etag: (response.headers.get("ETag") || "").replace(/^"|"$/g, "")
    };
  }

  async function deleteEvent(settings, href, etag = null) {
    const url = new URL(href, normalizeCollectionUrl(settings.collectionUrl)).toString();
    const headers = {};
    if (etag) {
      headers["If-Match"] = etag;
    }
    await request(settings, "DELETE", url, null, headers);
  }

  return {
    managedProperty,
    normalizeCollectionUrl,
    validate,
    listManaged,
    putEvent,
    overwriteEvent,
    deleteEvent
  };
})();
