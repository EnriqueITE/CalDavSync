"use strict";

const statusText = document.getElementById("statusText");
const statusDetails = document.getElementById("statusDetails");
const syncBtn = document.getElementById("syncNow");
const optionsBtn = document.getElementById("options");

async function send(type, payload = {}) {
  const response = await browser.runtime.sendMessage({ type, ...payload });
  if (!response?.ok) {
    throw new Error(response?.error || "Background request failed.");
  }
  return response.value;
}

function timeAgo(isoString) {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.floor(diffH / 24)}d ago`;
}

function firstMissingConfiguration(settings) {
  if (!settings?.calendarId) {
    return "Select a local calendar in options.";
  }
  if (!settings?.collectionUrl) {
    return "Configure a CalDAV collection URL in options.";
  }
  if (!settings?.hasSavedPassword) {
    return "Save a CalDAV password in options.";
  }
  return "";
}

async function refreshStatus() {
  try {
    const settings = await send("getSettings");
    const missingConfiguration = firstMissingConfiguration(settings);
    if (missingConfiguration) {
      statusText.textContent = "Not configured";
      statusText.className = "status-text status-idle";
      statusDetails.textContent = missingConfiguration;
      return;
    }

    const status = await send("getSyncStatus");
    if (!status) {
      statusText.textContent = "● Never synced";
      statusText.className = "status-text status-idle";
      statusDetails.textContent = "No sync history found.";
    } else if (status.ok) {
      statusText.textContent = `✓ Synced ${timeAgo(status.at)}`;
      statusText.className = "status-text status-ok";
      statusDetails.textContent = `${status.create} created · ${status.update} updated · ${status.delete} deleted`;
    } else {
      statusText.textContent = `✗ Failed ${timeAgo(status.at)}`;
      statusText.className = "status-text status-err";
      statusDetails.textContent = `${status.errorCount} error(s). Check options.`;
    }
  } catch (error) {
    statusText.textContent = "● Background script error";
    statusText.className = "status-text status-idle";
    statusDetails.textContent = error.message;
  }
}

// Listen for live progress
browser.runtime.onMessage.addListener(msg => {
  if (msg?.type === "_syncProgress") {
    statusText.textContent = "⏳ Syncing...";
    statusText.className = "status-text status-idle";
    statusDetails.textContent = msg.message;
  }
});

syncBtn.addEventListener("click", async () => {
  syncBtn.disabled = true;
  statusText.textContent = "⏳ Starting sync...";
  statusText.className = "status-text status-idle";
  statusDetails.textContent = "Please wait";
  try {
    const settings = await send("getSettings");
    const missingConfiguration = firstMissingConfiguration(settings);
    if (missingConfiguration) {
      statusText.textContent = "Not configured";
      statusText.className = "status-text status-idle";
      statusDetails.textContent = missingConfiguration;
      return;
    }
    await send("syncNow");
  } catch (error) {
    statusText.textContent = "✕ Sync failed";
    statusText.className = "status-text status-err";
    statusDetails.textContent = error.message;
    return;
  } finally {
    syncBtn.disabled = false;
  }
  await refreshStatus();
});

optionsBtn.addEventListener("click", () => {
  browser.runtime.openOptionsPage();
  window.close();
});

document.addEventListener("DOMContentLoaded", () => {
  refreshStatus();
  setInterval(refreshStatus, 30_000);
});
