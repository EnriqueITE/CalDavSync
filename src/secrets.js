"use strict";

const Secrets = (() => {
  async function savePassword(username, password) {
    if (!password) {
      return;
    }
    await browser.CalDavSync.savePassword(username || "", password);
  }

  async function loadPassword(username) {
    return browser.CalDavSync.loadPassword(username || "");
  }

  async function hasPassword(username) {
    return browser.CalDavSync.hasPassword(username || "");
  }

  async function clearPassword(username) {
    await browser.CalDavSync.clearPassword(username || "");
  }

  return {
    savePassword,
    loadPassword,
    hasPassword,
    clearPassword
  };
})();
