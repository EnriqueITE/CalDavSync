"use strict";

const Secrets = (() => {
  const keyName = "secretKey";
  const secretsName = "secrets";

  function bytesToBase64(bytes) {
    let binary = "";
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary);
  }

  function base64ToBytes(value) {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  async function getKey() {
    const stored = await browser.storage.local.get(keyName);
    if (stored[keyName]) {
      return crypto.subtle.importKey(
        "jwk",
        stored[keyName],
        { name: "AES-GCM" },
        false,
        ["encrypt", "decrypt"]
      );
    }

    const key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );
    const jwk = await crypto.subtle.exportKey("jwk", key);
    await browser.storage.local.set({ [keyName]: jwk });
    return key;
  }

  async function savePassword(password) {
    if (!password) {
      return;
    }
    const key = await getKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(password)
    );
    await browser.storage.local.set({
      [secretsName]: {
        password: {
          iv: bytesToBase64(iv),
          ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
          updatedAt: new Date().toISOString()
        }
      }
    });
  }

  async function loadPassword() {
    const stored = await browser.storage.local.get(secretsName);
    const encrypted = stored[secretsName]?.password;
    if (!encrypted?.iv || !encrypted?.ciphertext) {
      return "";
    }
    const key = await getKey();
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(encrypted.iv) },
      key,
      base64ToBytes(encrypted.ciphertext)
    );
    return new TextDecoder().decode(plaintext);
  }

  async function hasPassword() {
    const stored = await browser.storage.local.get(secretsName);
    return !!stored[secretsName]?.password?.ciphertext;
  }

  async function clearPassword() {
    const stored = await browser.storage.local.get(secretsName);
    const next = { ...(stored[secretsName] || {}) };
    delete next.password;
    await browser.storage.local.set({ [secretsName]: next });
  }

  return {
    savePassword,
    loadPassword,
    hasPassword,
    clearPassword
  };
})();
