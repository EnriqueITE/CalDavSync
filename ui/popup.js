"use strict";

const output = document.getElementById("output");

async function send(type, payload = {}) {
  return browser.runtime.sendMessage({ type, ...payload });
}

function show(value) {
  output.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

document.getElementById("dryRun").addEventListener("click", async () => {
  try {
    show(await send("dryRun"));
  } catch (error) {
    show(error.message);
  }
});

document.getElementById("syncNow").addEventListener("click", async () => {
  try {
    show(await send("syncNow"));
  } catch (error) {
    show(error.message);
  }
});

document.getElementById("options").addEventListener("click", () => {
  browser.runtime.openOptionsPage();
});
