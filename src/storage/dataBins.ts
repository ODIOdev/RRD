/** Named storage bins for the RR AutoDetailing internal database. */

export type BinId =
  | "reservations"
  | "services"
  | "vehicles"
  | "clients"
  | "washers"
  | "settings"
  | "notes";

export interface BinMeta {
  id: BinId;
  label: string;
  description: string;
}

export interface DataRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

export interface DataBin<T extends DataRecord = DataRecord> {
  id: BinId;
  label: string;
  description: string;
  records: T[];
  updatedAt: string;
}

export interface DatabaseSnapshot {
  version: number;
  updatedAt: string;
  bins: Record<BinId, DataBin>;
}

export const BIN_META: BinMeta[] = [
  {
    id: "reservations",
    label: "Reservas",
    description: "Citas y reservas confirmadas, en curso o canceladas.",
  },
  {
    id: "services",
    label: "Servicios",
    description: "Catálogo de servicios, precios y duraciones.",
  },
  {
    id: "vehicles",
    label: "Vehículos",
    description: "Vehículos registrados a partir de reservas.",
  },
  {
    id: "clients",
    label: "Clientes",
    description: "Clientes únicos por teléfono.",
  },
  {
    id: "washers",
    label: "Lavadores",
    description: "Equipo de lavadores y brilladores.",
  },
  {
    id: "settings",
    label: "Configuración",
    description: "Enlaces públicos y preferencias del negocio.",
  },
  {
    id: "notes",
    label: "Notas / Info",
    description: "Notas internas y datos libres del dashboard.",
  },
];

export function emptyBin(meta: BinMeta): DataBin {
  return {
    id: meta.id,
    label: meta.label,
    description: meta.description,
    records: [],
    updatedAt: new Date().toISOString(),
  };
}

export function createRecordId(prefix = "rec"): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function stampRecord<T extends Record<string, unknown>>(
  data: T,
  existingId?: string
): T & DataRecord {
  const now = new Date().toISOString();
  return {
    ...data,
    id: existingId || (typeof data.id === "string" ? data.id : createRecordId()),
    createdAt: typeof data.createdAt === "string" ? data.createdAt : now,
    updatedAt: now,
  };
}
