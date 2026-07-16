import { BIN_META, BinId, DataRecord, DatabaseSnapshot, emptyBin } from "./dataBins";

const CORE_COLS = ["bin", "id", "createdAt", "updatedAt"] as const;

function csvEscape(value: unknown): string {
  if (value == null) return "";
  const s = typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      cell = "";
      if (row.some((c) => c.length)) rows.push(row);
      row = [];
    } else if (ch === "\r") {
      // ignore CR (handled with LF)
    } else {
      cell += ch;
    }
  }

  if (cell.length || row.length) {
    row.push(cell);
    if (row.some((c) => c.length)) rows.push(row);
  }

  return rows;
}

function parseCell(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return raw;
    }
  }
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return raw;
}

export function snapshotToCsv(snapshot: DatabaseSnapshot): string {
  const keySet = new Set<string>(CORE_COLS);
  const flat: Array<Record<string, unknown>> = [];

  for (const meta of BIN_META) {
    const bin = snapshot.bins[meta.id];
    if (!bin) continue;
    for (const record of bin.records) {
      const row: Record<string, unknown> = { bin: meta.id };
      for (const [k, v] of Object.entries(record)) {
        keySet.add(k);
        row[k] = v;
      }
      flat.push(row);
    }
  }

  const extras = [...keySet].filter((k) => !(CORE_COLS as readonly string[]).includes(k)).sort();
  const header = [...CORE_COLS, ...extras];
  const lines = [header.join(",")];

  for (const row of flat) {
    lines.push(header.map((k) => csvEscape(row[k])).join(","));
  }

  return `${lines.join("\n")}\n`;
}

export function csvToSnapshot(csv: string): DatabaseSnapshot {
  const rows = parseCsv(csv.replace(/^\uFEFF/, ""));
  if (rows.length < 1) throw new Error("CSV vacío");

  const header = rows[0].map((h) => h.trim());
  const binIdx = header.indexOf("bin");
  if (binIdx < 0) throw new Error('Falta la columna "bin"');

  const bins = Object.fromEntries(BIN_META.map((m) => [m.id, emptyBin(m)])) as DatabaseSnapshot["bins"];
  const validBins = new Set<BinId>(BIN_META.map((m) => m.id));

  for (let r = 1; r < rows.length; r++) {
    const cols = rows[r];
    if (!cols.some((c) => c.trim())) continue;

    const binId = String(cols[binIdx] || "").trim() as BinId;
    if (!validBins.has(binId)) continue;

    const record: DataRecord = {
      id: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    header.forEach((key, i) => {
      if (key === "bin" || i >= cols.length) return;
      const value = parseCell(cols[i]);
      if (key === "id" || key === "createdAt" || key === "updatedAt") {
        if (value !== "") record[key] = String(value);
      } else if (value !== "") {
        record[key] = value;
      }
    });

    if (!record.id) record.id = `${binId}_${r}_${Date.now()}`;
    bins[binId].records.push(record);
    bins[binId].updatedAt = new Date().toISOString();
  }

  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    bins,
  };
}
