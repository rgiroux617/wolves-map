// campaignStore.js v2026-02-26-01
// Purpose: single-file Campaign Export/Import/Wipe for cross-device editing.
// - Hex map stays at its existing localStorage key.
// - Dungeons are stored per-hex as: dungeon_hex_${hexKey}

export const CAMPAIGN_SCHEMA = 1;

export function dungeonKeyForHex(hexKey) {
  return `dungeon_hex_${hexKey}`;
}

export function listDungeonHexKeys() {
  const out = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    if (k.startsWith("dungeon_hex_")) out.push(k);
  }
  out.sort();
  return out;
}

export function exportCampaign({ hexStorageKey, filenameBase = "campaign" }) {
  if (!hexStorageKey) throw new Error("exportCampaign: hexStorageKey required.");

  const hexRaw = localStorage.getItem(hexStorageKey);
  const hexData = hexRaw ? safeParse(hexRaw, {}) : {};

  // Collect all per-hex dungeon saves
  const dungeonsByHexKey = {};
  const dungeonStorageKeys = listDungeonHexKeys();
  for (const storageKey of dungeonStorageKeys) {
    const raw = localStorage.getItem(storageKey);
    const dungeonState = raw ? safeParse(raw, null) : null;
    if (!dungeonState) continue;

    const hexKey = storageKey.replace(/^dungeon_hex_/, "");
    dungeonsByHexKey[hexKey] = dungeonState;
  }

  const bundle = {
    schema: CAMPAIGN_SCHEMA,
    updatedAt: new Date().toISOString(),
    hex: {
      storageKey: hexStorageKey,
      data: hexData
    },
    dungeonsByHexKey
  };

  const stamp = isoStamp(new Date());
  const filename = `${filenameBase}_${stamp}.json`;

  downloadJson(bundle, filename);
}

export async function importCampaignFromFile({ file, hexStorageKey }) {
  if (!file) throw new Error("importCampaignFromFile: file required.");
  if (!hexStorageKey) throw new Error("importCampaignFromFile: hexStorageKey required.");

  const text = await file.text();
  const obj = safeParse(text, null);
  if (!obj || obj.schema !== CAMPAIGN_SCHEMA) {
    throw new Error("Invalid campaign file (schema mismatch).");
  }
  if (!obj.hex || typeof obj.hex.data !== "object") {
    throw new Error("Invalid campaign file (missing hex.data).");
  }
  if (!obj.dungeonsByHexKey || typeof obj.dungeonsByHexKey !== "object") {
    throw new Error("Invalid campaign file (missing dungeonsByHexKey).");
  }

  // Replace hex map state
  localStorage.setItem(hexStorageKey, JSON.stringify(obj.hex.data));

  // Replace all dungeon saves that are present in the bundle
  // (We DO NOT automatically wipe other dungeon_hex_* keys here; that’s a separate Wipe action.)
  for (const [hexKey, dungeonState] of Object.entries(obj.dungeonsByHexKey)) {
    const storageKey = dungeonKeyForHex(hexKey);
    localStorage.setItem(storageKey, JSON.stringify(dungeonState));
  }

  return {
    importedHex: true,
    importedDungeons: Object.keys(obj.dungeonsByHexKey).length
  };
}

export async function importCampaignFromUrl({ url, hexStorageKey, cacheBust = "" }) {
  if (!url) throw new Error("importCampaignFromUrl: url required.");
  if (!hexStorageKey) throw new Error("importCampaignFromUrl: hexStorageKey required.");

  const finalUrl = cacheBust ? `${url}${url.includes("?") ? "&" : "?"}${cacheBust}` : url;

  const res = await fetch(finalUrl, { cache: "no-store" });
  if (!res.ok) throw new Error(`Seed fetch failed (${res.status}).`);

  const text = await res.text();
  const obj = safeParse(text, null);

  if (!obj || obj.schema !== CAMPAIGN_SCHEMA) {
    throw new Error("Invalid campaign seed (schema mismatch).");
  }
  if (!obj.hex || typeof obj.hex.data !== "object") {
    throw new Error("Invalid campaign seed (missing hex.data).");
  }
  if (!obj.dungeonsByHexKey || typeof obj.dungeonsByHexKey !== "object") {
    throw new Error("Invalid campaign seed (missing dungeonsByHexKey).");
  }

  // Replace hex map state
  localStorage.setItem(hexStorageKey, JSON.stringify(obj.hex.data));

  // Replace all dungeon saves that are present in the bundle
  for (const [hexKey, dungeonState] of Object.entries(obj.dungeonsByHexKey)) {
    localStorage.setItem(dungeonKeyForHex(hexKey), JSON.stringify(dungeonState));
  }

  return {
    importedHex: true,
    importedDungeons: Object.keys(obj.dungeonsByHexKey).length
  };
}

export function wipeCampaign({ hexStorageKey, confirmFn = null }) {
  if (!hexStorageKey) throw new Error("wipeCampaign: hexStorageKey required.");

  if (confirmFn) {
    const ok = confirmFn("Wipe ALL campaign data (hex + all linked dungeons) from this browser?");
    if (!ok) return { wiped: false };
  }

  localStorage.removeItem(hexStorageKey);

  const dungeonKeys = listDungeonHexKeys();
  for (const k of dungeonKeys) localStorage.removeItem(k);

  return { wiped: true, wipedDungeons: dungeonKeys.length };
}

/* ---------------- helpers ---------------- */

function safeParse(text, fallback) {
  try { return JSON.parse(text); }
  catch { return fallback; }
}

function isoStamp(d) {
  // 2026-02-26_142530
  const pad = (n) => String(n).padStart(2, "0");
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `${y}-${m}-${day}_${hh}${mm}${ss}`;
}

function downloadJson(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}