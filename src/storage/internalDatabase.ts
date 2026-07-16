import {
  BIN_META,
  BinId,
  DataBin,
  DataRecord,
  DatabaseSnapshot,
  emptyBin,
  stampRecord,
} from "./dataBins";
import { csvToSnapshot, snapshotToCsv } from "./csv";

const DB_KEY = "rr_internal_db_v1";
const LEGACY_SERVICES = "rr_services";
const LEGACY_RESERVATIONS = "rr_reservations";
const LEGACY_PUBLIC_LINK = "rr_public_link";

type Listener = (snapshot: DatabaseSnapshot) => void;

function nowIso(): string {
  return new Date().toISOString();
}

function readRaw(): DatabaseSnapshot | null {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DatabaseSnapshot;
  } catch {
    return null;
  }
}

function writeRaw(snapshot: DatabaseSnapshot): void {
  localStorage.setItem(DB_KEY, JSON.stringify(snapshot));
}

function ensureBins(snapshot: DatabaseSnapshot): DatabaseSnapshot {
  const bins = { ...snapshot.bins };
  for (const meta of BIN_META) {
    if (!bins[meta.id]) bins[meta.id] = emptyBin(meta);
  }
  return { ...snapshot, bins };
}

export class InternalDatabase {
  private snapshot: DatabaseSnapshot;
  private listeners = new Set<Listener>();

  constructor() {
    this.snapshot = this.createEmpty();
  }

  createEmpty(): DatabaseSnapshot {
    const bins = {} as Record<BinId, DataBin>;
    for (const meta of BIN_META) bins[meta.id] = emptyBin(meta);
    return { version: 1, updatedAt: nowIso(), bins };
  }

  /** Load DB, migrate legacy localStorage keys, seed defaults. */
  async init(seed?: {
    defaultServices?: DataRecord[];
    defaultWashers?: DataRecord[];
  }): Promise<DatabaseSnapshot> {
    const existing = readRaw();
    this.snapshot = existing ? ensureBins(existing) : this.createEmpty();
    this.migrateLegacy();

    if (seed?.defaultServices?.length && this.snapshot.bins.services.records.length === 0) {
      this.snapshot.bins.services.records = seed.defaultServices.map((s) =>
        stampRecord(s, s.id)
      );
      this.snapshot.bins.services.updatedAt = nowIso();
    }

    if (seed?.defaultWashers?.length && this.snapshot.bins.washers.records.length === 0) {
      this.snapshot.bins.washers.records = seed.defaultWashers.map((w) =>
        stampRecord(w, w.id)
      );
      this.snapshot.bins.washers.updatedAt = nowIso();
    }

    this.rebuildDerivedBins();
    this.persist();
    return this.getSnapshot();
  }

  private migrateLegacy(): void {
    try {
      const legacyServices = localStorage.getItem(LEGACY_SERVICES);
      if (legacyServices && this.snapshot.bins.services.records.length === 0) {
        const parsed = JSON.parse(legacyServices) as DataRecord[];
        if (Array.isArray(parsed)) {
          this.snapshot.bins.services.records = parsed.map((s) => stampRecord(s, s.id));
          this.snapshot.bins.services.updatedAt = nowIso();
        }
      }

      const legacyReservations = localStorage.getItem(LEGACY_RESERVATIONS);
      if (legacyReservations && this.snapshot.bins.reservations.records.length === 0) {
        const parsed = JSON.parse(legacyReservations) as DataRecord[];
        if (Array.isArray(parsed)) {
          this.snapshot.bins.reservations.records = parsed.map((r) =>
            stampRecord(r, r.id)
          );
          this.snapshot.bins.reservations.updatedAt = nowIso();
          this.rebuildDerivedBins();
        }
      }

      const publicLink = localStorage.getItem(LEGACY_PUBLIC_LINK);
      if (publicLink && this.snapshot.bins.settings.records.length === 0) {
        this.snapshot.bins.settings.records = [
          stampRecord({ key: "publicBookingLink", value: publicLink }),
        ];
        this.snapshot.bins.settings.updatedAt = nowIso();
      }
    } catch {
      /* ignore corrupt legacy */
    }
  }

  /** Rebuild clients + vehicles bins from reservations. */
  rebuildDerivedBins(): void {
    const reservations = this.snapshot.bins.reservations.records;
    const clients = new Map<string, DataRecord>();
    const vehicles = new Map<string, DataRecord>();

    const phoneDigits = (value: string) => value.replace(/\D/g, "").slice(0, 10);
    const normalizePlate = (value: string) =>
      String(value || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    const vehicleKey = (r: DataRecord) => {
      const plate = normalizePlate(String(r.vehiclePlate || ""));
      if (plate) return `plate:${plate}`;
      const phone = phoneDigits(String(r.clientPhone || ""));
      const model = String(r.vehicleModel || "").trim().toLowerCase().replace(/\s+/g, " ");
      const year = String(r.vehicleYear || "").trim();
      return `veh:${phone}|${model}|${year}`;
    };

    const sorted = [...reservations].sort((a, b) =>
      String(a.updatedAt || a.createdAt || "").localeCompare(String(b.updatedAt || b.createdAt || ""))
    );

    for (const r of sorted) {
      const phone = phoneDigits(String(r.clientPhone || ""));
      const name = String(r.clientName || "");
      if (phone) {
        const prev = clients.get(phone);
        clients.set(
          phone,
          stampRecord(
            {
              id: `client_${phone}`,
              clientName: name || String(prev?.clientName || ""),
              clientPhone: String(r.clientPhone || prev?.clientPhone || phone),
            },
            `client_${phone}`
          )
        );
      }

      const plate = String(r.vehiclePlate || "");
      const model = String(r.vehicleModel || "");
      if (!model && !plate) continue;

      const key = vehicleKey(r);
      try {
        const hiddenRaw = this.getSetting("hiddenVehicleKeys");
        const hidden = hiddenRaw ? (JSON.parse(hiddenRaw) as string[]) : [];
        if (Array.isArray(hidden) && hidden.includes(key)) continue;
      } catch {
        /* ignore bad hidden list */
      }
      const prev = vehicles.get(key);
      vehicles.set(
        key,
        stampRecord(
          {
            id: `veh_${key}`,
            clientName: name || String(prev?.clientName || ""),
            clientPhone: String(r.clientPhone || prev?.clientPhone || ""),
            vehicleType: r.vehicleType || prev?.vehicleType,
            vehicleModel: model || String(prev?.vehicleModel || ""),
            vehicleYear: r.vehicleYear || prev?.vehicleYear,
            vehiclePlate: plate || String(prev?.vehiclePlate || ""),
            vehicleColor: r.vehicleColor || prev?.vehicleColor,
          },
          `veh_${key}`
        )
      );
    }

    this.snapshot.bins.clients.records = [...clients.values()];
    this.snapshot.bins.clients.updatedAt = nowIso();
    this.snapshot.bins.vehicles.records = [...vehicles.values()];
    this.snapshot.bins.vehicles.updatedAt = nowIso();
  }

  getSnapshot(): DatabaseSnapshot {
    return structuredClone(this.snapshot);
  }

  listBins(): DataBin[] {
    return BIN_META.map((m) => this.snapshot.bins[m.id]);
  }

  getBin<T extends DataRecord = DataRecord>(id: BinId): DataBin<T> {
    return structuredClone(this.snapshot.bins[id]) as DataBin<T>;
  }

  getRecords<T extends DataRecord = DataRecord>(id: BinId): T[] {
    return structuredClone(this.snapshot.bins[id].records) as T[];
  }

  setRecords(id: BinId, records: DataRecord[]): DataBin {
    this.applyRecords(id, records);
    if (id === "reservations") this.rebuildDerivedBins();
    this.persist();
    return this.getBin(id);
  }

  /** Write multiple bins in one pass and notify listeners once. */
  commit(updates: Partial<Record<BinId, DataRecord[]>>): DatabaseSnapshot {
    let touchedReservations = false;
    (Object.entries(updates) as Array<[BinId, DataRecord[] | undefined]>).forEach(([id, records]) => {
      if (!records) return;
      this.applyRecords(id, records);
      if (id === "reservations") touchedReservations = true;
    });
    if (touchedReservations) this.rebuildDerivedBins();
    this.persist();
    return this.getSnapshot();
  }

  private applyRecords(id: BinId, records: DataRecord[]): void {
    this.snapshot.bins[id].records = records.map((r) => {
      const stamped = stampRecord(r, r.id);
      const existing = this.snapshot.bins[id].records.find((row) => row.id === stamped.id);
      if (existing?.createdAt) stamped.createdAt = existing.createdAt;
      return stamped;
    });
    this.snapshot.bins[id].updatedAt = nowIso();
  }

  upsert(id: BinId, data: Record<string, unknown>): DataRecord {
    const records = this.snapshot.bins[id].records;
    const incomingId = typeof data.id === "string" ? data.id : undefined;
    const idx = incomingId ? records.findIndex((r) => r.id === incomingId) : -1;
    const stamped = stampRecord(data, incomingId);

    if (idx >= 0) {
      stamped.createdAt = records[idx].createdAt;
      records[idx] = stamped;
    } else {
      records.push(stamped);
    }

    this.snapshot.bins[id].updatedAt = nowIso();
    if (id === "reservations") this.rebuildDerivedBins();
    this.persist();
    return structuredClone(stamped);
  }

  remove(id: BinId, recordId: string): boolean {
    const before = this.snapshot.bins[id].records.length;
    this.snapshot.bins[id].records = this.snapshot.bins[id].records.filter(
      (r) => r.id !== recordId
    );
    const changed = this.snapshot.bins[id].records.length !== before;
    if (changed) {
      this.snapshot.bins[id].updatedAt = nowIso();
      if (id === "reservations") this.rebuildDerivedBins();
      this.persist();
    }
    return changed;
  }

  clearBin(id: BinId): void {
    this.snapshot.bins[id].records = [];
    this.snapshot.bins[id].updatedAt = nowIso();
    if (id === "reservations") this.rebuildDerivedBins();
    this.persist();
  }

  exportAll(): string {
    return JSON.stringify(this.getSnapshot(), null, 2);
  }

  exportAllCsv(): string {
    return snapshotToCsv(this.getSnapshot());
  }

  importAll(json: string): DatabaseSnapshot {
    const parsed = JSON.parse(json) as DatabaseSnapshot;
    if (!parsed?.bins) throw new Error("Formato de base de datos inválido");
    this.snapshot = ensureBins({
      version: parsed.version || 1,
      updatedAt: nowIso(),
      bins: parsed.bins,
    });
    this.persist();
    return this.getSnapshot();
  }

  importAllCsv(csv: string): DatabaseSnapshot {
    const parsed = csvToSnapshot(csv);
    if (!parsed?.bins) throw new Error("Formato CSV inválido");
    this.snapshot = ensureBins({
      version: parsed.version || 1,
      updatedAt: nowIso(),
      bins: parsed.bins,
    });
    this.persist();
    return this.getSnapshot();
  }

  getSetting(key: string): string {
    const row = this.snapshot.bins.settings.records.find((r) => r.key === key);
    return row ? String(row.value ?? "") : "";
  }

  setSetting(key: string, value: string): void {
    const existing = this.snapshot.bins.settings.records.find((r) => r.key === key);
    this.upsert("settings", {
      id: existing?.id || `setting_${key}`,
      key,
      value,
    });
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private persist(): void {
    this.snapshot.updatedAt = nowIso();
    writeRaw(this.snapshot);

    // Keep legacy keys in sync for compatibility
    localStorage.setItem(
      LEGACY_SERVICES,
      JSON.stringify(this.snapshot.bins.services.records)
    );
    localStorage.setItem(
      LEGACY_RESERVATIONS,
      JSON.stringify(this.snapshot.bins.reservations.records)
    );
    const link = this.getSetting("publicBookingLink");
    if (link) localStorage.setItem(LEGACY_PUBLIC_LINK, link);
    else localStorage.removeItem(LEGACY_PUBLIC_LINK);

    const snap = this.getSnapshot();
    this.listeners.forEach((fn) => fn(snap));
  }
}

export const internalDatabase = new InternalDatabase();
