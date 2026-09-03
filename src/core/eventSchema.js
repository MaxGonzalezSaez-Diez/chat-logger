const hashApi =
  typeof module !== "undefined" && module.exports
    ? require("./hash.js")
    : globalThis.ReadChatGuiHash;

if (!hashApi || typeof hashApi.fnv1a32 !== "function") {
  throw new Error("ReadChatGuiHash.fnv1a32 is required");
}

const VALID_SITES = new Set(["chatgpt", "gemini", "claude"]);
const VALID_ROLES = new Set(["user", "assistant"]);
const VALID_EXTRACTION_MODES = new Set(["plain", "structured"]);

function normalizeForHash(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeOptionalId(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeIsoTimestamp(now) {
  const date = now instanceof Date ? now : new Date(now || Date.now());
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid timestamp");
  }
  return date.toISOString();
}

function makeEvent(input) {
  const site = String(input.site || "").toLowerCase();
  const role = String(input.role || "").toLowerCase();
  const text = String(input.text || "");
  const extractionMode = String(input.extractionMode || "plain").toLowerCase();

  if (!VALID_SITES.has(site)) {
    throw new Error("Invalid site");
  }
  if (!VALID_ROLES.has(role)) {
    throw new Error("Invalid role");
  }
  if (!VALID_EXTRACTION_MODES.has(extractionMode)) {
    throw new Error("Invalid extractionMode");
  }
  if (!text.trim()) {
    throw new Error("Text must not be empty");
  }

  const tsIso = normalizeIsoTimestamp(input.now);
  const conversationId = normalizeOptionalId(input.conversationId);
  const turnId = normalizeOptionalId(input.turnId);

  const dedupeSource = [
    site,
    role,
    conversationId || "",
    turnId || "",
    normalizeForHash(text),
  ].join("|");

  const dedupeKey = hashApi.fnv1a32(dedupeSource);
  const eventId = `${Date.parse(tsIso)}-${dedupeKey}`;

  return {
    eventId,
    tsIso,
    site,
    conversationId,
    turnId,
    role,
    text,
    extractionMode,
    dedupeKey,
  };
}

function validateEvent(event) {
  const errors = [];

  if (!event || typeof event !== "object") {
    return ["Event must be an object"];
  }

  if (typeof event.eventId !== "string" || event.eventId.trim().length === 0) {
    errors.push("eventId is required");
  }

  if (
    typeof event.tsIso !== "string" ||
    Number.isNaN(Date.parse(event.tsIso))
  ) {
    errors.push("tsIso must be a valid ISO timestamp");
  }

  if (!VALID_SITES.has(event.site)) {
    errors.push("site must be one of: chatgpt, gemini, claude");
  }

  if (!VALID_ROLES.has(event.role)) {
    errors.push("role must be one of: user, assistant");
  }

  if (typeof event.text !== "string" || event.text.trim().length === 0) {
    errors.push("text must be a non-empty string");
  }

  if (!VALID_EXTRACTION_MODES.has(event.extractionMode)) {
    errors.push("extractionMode must be one of: plain, structured");
  }

  if (
    typeof event.dedupeKey !== "string" ||
    !/^[0-9a-f]{8}$/i.test(event.dedupeKey)
  ) {
    errors.push("dedupeKey must be an 8-character hex string");
  }

  return errors;
}

const eventSchemaApi = {
  VALID_SITES,
  VALID_ROLES,
  VALID_EXTRACTION_MODES,
  normalizeForHash,
  makeEvent,
  validateEvent,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = eventSchemaApi;
}

if (typeof globalThis !== "undefined") {
  globalThis.ReadChatGuiEventSchema = eventSchemaApi;
}
