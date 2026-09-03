function fnv1a32(input) {
  const str = String(input);
  let hash = 0x811c9dc5;

  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash.toString(16).padStart(8, "0");
}

const hashApiExport = { fnv1a32 };

if (typeof module !== "undefined" && module.exports) {
  module.exports = hashApiExport;
}

if (typeof globalThis !== "undefined") {
  globalThis.ReadChatGuiHash = hashApiExport;
}
