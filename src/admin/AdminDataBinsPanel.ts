import { BinId, BIN_META, DataRecord } from "../storage/dataBins";
import { internalDatabase } from "../storage/internalDatabase";
import {
  binDescription,
  binLabel,
  localeTag,
  onLangChange,
  t,
} from "../i18n";
import { confirmWarning } from "../ui/confirmDialog";

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function binIcon(id: BinId): string {
  switch (id) {
    case "reservations":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    case "services":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 1 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    case "vehicles":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 13l2-5a2 2 0 0 1 1.9-1.3h10.2A2 2 0 0 1 19 8l2 5M5 17h.01M19 17h.01M4 13h16v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    case "clients":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    case "washers":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v3M8 8l-2-2M16 8l2-2M5 14h14M7 14a5 5 0 0 1 10 0M9 19h6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    case "settings":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.3.6.9 1 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    case "notes":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    default:
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
  }
}

function formatFieldLabel(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function recordTitle(record: DataRecord): string {
  const candidates = [
    record.name,
    record.title,
    record.key,
    record.clientName,
    record.vehicleModel,
    record.id,
  ];
  const value = candidates.find((item) => typeof item === "string" && String(item).trim());
  return String(value || record.id);
}

function recordSubtitle(record: DataRecord): string {
  const candidates = [
    record.serviceName,
    record.clientPhone,
    record.vehiclePlate,
    record.role,
    record.source,
  ];
  const value = candidates.find((item) => typeof item === "string" && String(item).trim());
  return String(value || "");
}

function recordInitials(title: string): string {
  const parts = title.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "RR";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function isMoneyField(key: string): boolean {
  return /price|total|tip|tax|fee|regular|late|amount|revenue/i.test(key);
}

function formatDetailValue(key: string, value: unknown): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number" && isMoneyField(key)) {
    return new Intl.NumberFormat("es-DO", {
      style: "currency",
      currency: "DOP",
      maximumFractionDigits: 0,
    }).format(value);
  }
  if ((key === "createdAt" || key === "updatedAt") && typeof value === "string") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toLocaleString(localeTag());
  }
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

type DetailGroup = { id: string; title: string; entries: Array<[string, unknown]> };

function groupRecordFields(record: DataRecord): DetailGroup[] {
  const groups: Array<{ id: string; titleKey: "bins.sectionClient" | "bins.sectionVehicle" | "bins.sectionService" | "bins.sectionSchedule" | "bins.sectionPayment" | "bins.sectionNotes"; keys: string[] }> = [
    { id: "client", titleKey: "bins.sectionClient", keys: ["clientName", "clientPhone"] },
    {
      id: "vehicle",
      titleKey: "bins.sectionVehicle",
      keys: ["vehicleType", "vehicleModel", "vehicleYear", "vehiclePlate", "vehicleColor"],
    },
    {
      id: "service",
      titleKey: "bins.sectionService",
      keys: ["serviceId", "serviceName", "washer", "duration", "specialist", "name", "regular", "late"],
    },
    {
      id: "schedule",
      titleKey: "bins.sectionSchedule",
      keys: ["date", "time", "status"],
    },
    {
      id: "payment",
      titleKey: "bins.sectionPayment",
      keys: ["paymentMethod", "servicePrice", "tip", "cardTax", "cancellationFee", "total"],
    },
    {
      id: "notes",
      titleKey: "bins.sectionNotes",
      keys: ["notes", "title", "body", "source", "key", "value", "role"],
    },
  ];

  const used = new Set<string>(["id"]);
  const result: DetailGroup[] = [];

  for (const group of groups) {
    const entries = group.keys
      .filter((key) => key in record && record[key] !== undefined && record[key] !== "")
      .map((key) => {
        used.add(key);
        return [key, record[key]] as [string, unknown];
      });
    if (entries.length) result.push({ id: group.id, title: t(group.titleKey), entries });
  }

  const rest = Object.entries(record).filter(
    ([key, value]) => !used.has(key) && key !== "createdAt" && key !== "updatedAt" && value !== undefined && value !== ""
  );
  if (rest.length) result.push({ id: "more", title: t("bins.sectionDetails"), entries: rest });

  return result;
}

function renderRecordDetail(record: DataRecord, binId: BinId): string {
  const title = recordTitle(record);
  const subtitle = recordSubtitle(record);
  const groups = groupRecordFields(record);
  const status = typeof record.status === "string" ? record.status : "";
  const created = record.createdAt ? formatDetailValue("createdAt", record.createdAt) : "";
  const updated = record.updatedAt ? formatDetailValue("updatedAt", record.updatedAt) : "";

  return `
    <div class="bin-record-hero bin-record-hero--${binId}">
      <div class="bin-record-avatar" aria-hidden="true">${escapeHtml(recordInitials(title))}</div>
      <div class="bin-record-hero-copy">
        <div class="bin-record-hero-tags">
          <span class="bin-record-chip">${escapeHtml(binLabel(binId))}</span>
          ${status ? `<span class="bin-record-chip bin-record-chip--status">${escapeHtml(status)}</span>` : ""}
        </div>
        <h2 id="binRecordModalTitle">${escapeHtml(title)}</h2>
        ${subtitle ? `<p class="bin-record-hero-sub">${escapeHtml(subtitle)}</p>` : ""}
        <p class="bin-record-id-line">${escapeHtml(record.id)}</p>
      </div>
    </div>

    <div class="bin-record-sections">
      ${groups
        .map(
          (group) => `
        <section class="bin-record-section">
          <h3>${escapeHtml(group.title)}</h3>
          <div class="bin-record-facts">
            ${group.entries
              .map(
                ([key, value]) => `
              <div class="bin-record-fact">
                <span>${escapeHtml(formatFieldLabel(key))}</span>
                <strong>${escapeHtml(formatDetailValue(key, value))}</strong>
              </div>`
              )
              .join("")}
          </div>
        </section>`
        )
        .join("")}
    </div>

    <div class="bin-record-timestamps">
      ${created ? `<div><span>${t("bins.created")}</span><strong>${escapeHtml(created)}</strong></div>` : ""}
      ${updated ? `<div><span>${t("bins.updated")}</span><strong>${escapeHtml(updated)}</strong></div>` : ""}
    </div>
  `;
}

export class AdminDataBinsPanel {
  private root: HTMLElement;
  private activeBin: BinId = "reservations";
  private selectedRecordId: string | null = null;
  private isEditingRecord = false;
  private unsubscribe: (() => void) | null = null;
  private unsubLang: (() => void) | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  mount(): void {
    this.render();
    this.unsubscribe = internalDatabase.subscribe(() => this.render());
    this.unsubLang = onLangChange(() => this.render());
  }

  destroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.unsubLang?.();
    this.unsubLang = null;
  }

  private render(): void {
    const bins = internalDatabase.listBins();
    const active = internalDatabase.getBin(this.activeBin);
    const selectedRecord = this.selectedRecordId
      ? active.records.find((r) => r.id === this.selectedRecordId) || null
      : null;
    if (!selectedRecord) {
      this.selectedRecordId = null;
      this.isEditingRecord = false;
    }
    const totalRecords = bins.reduce((n, b) => n + b.records.length, 0);
    const activeLabel = binLabel(active.id);
    const activeDesc = binDescription(active.id);
    const updated = new Date(internalDatabase.getSnapshot().updatedAt).toLocaleString(localeTag());

    this.root.innerHTML = `
      <div class="data-bins">
        <div class="data-bins-head">
          <div>
            <h3>${t("bins.heading")}</h3>
            <p class="meta">${t("bins.meta", { count: totalRecords, date: updated })}</p>
          </div>
          <div class="actions">
            <button type="button" class="ghost" data-bins-action="export">${t("bins.export")}</button>
            <button type="button" class="ghost" data-bins-action="import">${t("bins.import")}</button>
            <input id="binsImportFile" type="file" accept=".csv,text/csv" hidden />
          </div>
        </div>

        <div class="bin-grid">
          ${bins
            .map(
              (b) => `
            <button type="button" class="bin-card bin-card--${b.id} ${b.id === this.activeBin ? "active" : ""}" data-bin="${b.id}">
              <span class="bin-card-icon">${binIcon(b.id)}</span>
              <span class="bin-card-body">
                <strong class="bin-card-label">${escapeHtml(binLabel(b.id))}</strong>
                <span class="bin-card-count">${b.records.length}</span>
                <span class="bin-card-meta">${t("bins.records")}</span>
              </span>
            </button>`
            )
            .join("")}
        </div>

        <div class="bin-detail">
          <div class="section-header">
            <div>
              <h3>${escapeHtml(activeLabel)}</h3>
              <p class="meta">${escapeHtml(activeDesc)}</p>
            </div>
            <button type="button" class="danger" data-bins-action="clear-bin">${t("bins.clear")}</button>
          </div>

          <div class="sheet-wrap bin-records-sheet" id="binRecordsList">
            ${
              active.records.length
                ? `<div class="sheet-scroll">
                    <table class="sheet-table">
                      <thead>
                        <tr>
                          <th>${t("bins.record")}</th>
                          <th>ID</th>
                          <th>${t("bins.updated")}</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${active.records
                          .slice()
                          .reverse()
                          .map(
                            (r) => `
                          <tr class="bin-record-row" data-open-record="${escapeHtml(r.id)}">
                            <td class="bin-record-name">
                              <strong>${escapeHtml(recordTitle(r))}</strong>
                              ${
                                recordSubtitle(r)
                                  ? `<div class="meta">${escapeHtml(recordSubtitle(r))}</div>`
                                  : ""
                              }
                            </td>
                            <td class="bin-record-id">${escapeHtml(r.id)}</td>
                            <td>${escapeHtml(new Date(r.updatedAt).toLocaleString(localeTag()))}</td>
                            <td class="sheet-cell-actions">
                              <button type="button" class="ghost" data-edit-record="${escapeHtml(r.id)}">${t("admin.edit")}</button>
                              <button type="button" class="danger" data-del-record="${escapeHtml(r.id)}">${t("bins.delete")}</button>
                            </td>
                          </tr>`
                          )
                          .join("")}
                      </tbody>
                    </table>
                  </div>`
                : `<div class="empty-state"><strong>${t("bins.emptyTitle")}</strong><p>${t("bins.emptyBody", { label: activeLabel })}</p></div>`
            }
          </div>
        </div>

        <div class="bin-demo admin-block">
          <h3>${t("bins.demoTitle")}</h3>
          <form id="binsDemoForm" class="grid admin-form">
            <label>
              <span>${t("bins.noteTitle")}</span>
              <input id="binsDemoTitle" required placeholder="${t("bins.noteTitlePh")}" />
            </label>
            <label>
              <span>${t("bins.noteBody")}</span>
              <input id="binsDemoBody" required placeholder="${t("bins.noteBodyPh")}" />
            </label>
            <div class="admin-form-action">
              <button type="submit" class="primary">${t("bins.saveNote")}</button>
            </div>
          </form>
        </div>

        <div class="modal ${selectedRecord ? "" : "hidden"}" id="binRecordModal" role="dialog" aria-modal="true" aria-labelledby="binRecordModalTitle">
          <div class="modal-card bin-record-modal-card">
            <div class="bin-record-modal-top">
              <div class="sheet-cell-actions">
                ${
                  selectedRecord && !this.isEditingRecord
                    ? `<button type="button" class="ghost" data-record-modal-edit>${t("admin.edit")}</button>`
                    : ""
                }
                <button type="button" class="ghost" data-record-modal-close>${t("modal.close")}</button>
              </div>
            </div>
            ${
              selectedRecord
                ? this.isEditingRecord
                  ? `
                    <div class="bin-record-hero bin-record-hero--${active.id}">
                      <div class="bin-record-avatar" aria-hidden="true">${escapeHtml(recordInitials(recordTitle(selectedRecord)))}</div>
                      <div class="bin-record-hero-copy">
                        <div class="bin-record-hero-tags">
                          <span class="bin-record-chip">${escapeHtml(binLabel(active.id))}</span>
                          <span class="bin-record-chip bin-record-chip--edit">${t("admin.edit")}</span>
                        </div>
                        <h2 id="binRecordModalTitle">${escapeHtml(recordTitle(selectedRecord))}</h2>
                        <p class="bin-record-id-line">${escapeHtml(selectedRecord.id)}</p>
                      </div>
                    </div>
                    <form id="binRecordEditForm" class="bin-record-form">
                      ${Object.entries(selectedRecord)
                        .filter(([key]) => !["id", "createdAt", "updatedAt"].includes(key))
                        .map(([key, value]) => {
                          const fieldId = `binRecordField_${key}`;
                          if (typeof value === "boolean") {
                            return `
                              <label class="check-chip">
                                <input id="${fieldId}" data-record-field="${escapeHtml(key)}" data-record-type="boolean" type="checkbox" ${value ? "checked" : ""} />
                                <span class="check-chip-box" aria-hidden="true"></span>
                                <span class="check-chip-text">${escapeHtml(formatFieldLabel(key))}</span>
                              </label>`;
                          }
                          const serialized = typeof value === "object"
                            ? JSON.stringify(value, null, 2)
                            : String(value ?? "");
                          const type = typeof value === "number" ? "number" : typeof value === "object" ? "json" : "text";
                          const useTextarea = typeof value === "object" || serialized.length > 60 || key === "notes" || key === "body";
                          return `
                            <label>
                              <span>${escapeHtml(formatFieldLabel(key))}</span>
                              ${
                                useTextarea
                                  ? `<textarea id="${fieldId}" rows="3" data-record-field="${escapeHtml(key)}" data-record-type="${type}">${escapeHtml(serialized)}</textarea>`
                                  : `<input id="${fieldId}" data-record-field="${escapeHtml(key)}" data-record-type="${type}" value="${escapeHtml(serialized)}" />`
                              }
                            </label>`;
                        })
                        .join("")}
                      <div class="bin-record-form-actions">
                        <button type="submit" class="primary">${t("modal.save")}</button>
                        <button type="button" class="ghost" data-record-modal-cancel>${t("login.cancel")}</button>
                      </div>
                    </form>`
                  : renderRecordDetail(selectedRecord, active.id)
                : ""
            }
          </div>
        </div>
      </div>
    `;

    this.bind();
  }

  private bind(): void {
    this.root.querySelectorAll<HTMLButtonElement>("[data-bin]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.activeBin = btn.dataset.bin as BinId;
        this.selectedRecordId = null;
        this.isEditingRecord = false;
        this.render();
      });
    });

    this.root.querySelectorAll<HTMLElement>("[data-open-record]").forEach((row) => {
      row.addEventListener("click", () => {
        const id = row.dataset.openRecord;
        if (!id) return;
        this.selectedRecordId = id;
        this.isEditingRecord = false;
        this.render();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-edit-record]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.dataset.editRecord;
        if (!id) return;
        this.selectedRecordId = id;
        this.isEditingRecord = true;
        this.render();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-del-record]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const id = btn.dataset.delRecord;
        if (!id) return;
        const ok = await confirmWarning(t("alert.deleteRecord"), {
          title: t("confirm.deleteRecordTitle"),
          confirmLabel: t("confirm.continue"),
        });
        if (ok) {
          internalDatabase.remove(this.activeBin, id);
          if (this.selectedRecordId === id) {
            this.selectedRecordId = null;
            this.isEditingRecord = false;
          }
        }
      });
    });

    this.root.querySelector<HTMLElement>("[data-record-modal-close]")?.addEventListener("click", () => {
      this.selectedRecordId = null;
      this.isEditingRecord = false;
      this.render();
    });

    this.root.querySelector<HTMLElement>("[data-record-modal-edit]")?.addEventListener("click", () => {
      this.isEditingRecord = true;
      this.render();
    });

    this.root.querySelector<HTMLElement>("[data-record-modal-cancel]")?.addEventListener("click", () => {
      this.isEditingRecord = false;
      this.render();
    });

    this.root.querySelector<HTMLElement>("#binRecordModal")?.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).id === "binRecordModal") {
        this.selectedRecordId = null;
        this.isEditingRecord = false;
        this.render();
      }
    });

    this.root.querySelector<HTMLFormElement>("#binRecordEditForm")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const activeRecord = this.selectedRecordId
        ? internalDatabase.getBin(this.activeBin).records.find((r) => r.id === this.selectedRecordId)
        : null;
      if (!activeRecord) return;
      try {
        const nextRecord: Record<string, unknown> = { ...activeRecord };
        this.root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("[data-record-field]").forEach((field) => {
          const key = field.dataset.recordField;
          const type = field.dataset.recordType;
          if (!key) return;
          if (type === "boolean" && field instanceof HTMLInputElement) {
            nextRecord[key] = field.checked;
            return;
          }
          if (type === "number") {
            nextRecord[key] = Number(field.value || 0);
            return;
          }
          if (type === "json") {
            nextRecord[key] = field.value.trim() ? JSON.parse(field.value) : null;
            return;
          }
          nextRecord[key] = field.value;
        });
        internalDatabase.upsert(this.activeBin, nextRecord);
        this.isEditingRecord = false;
      } catch (err) {
        alert((err as Error).message);
      }
    });

    const exportBtn = this.root.querySelector('[data-bins-action="export"]');
    exportBtn?.addEventListener("click", () => {
      const blob = new Blob([internalDatabase.exportAllCsv()], {
        type: "text/csv;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rr-internal-db-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    });

    const importBtn = this.root.querySelector('[data-bins-action="import"]');
    const fileInput = this.root.querySelector<HTMLInputElement>("#binsImportFile");
    importBtn?.addEventListener("click", () => fileInput?.click());
    fileInput?.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        if (file.name.toLowerCase().endsWith(".json") || text.trim().startsWith("{")) {
          internalDatabase.importAll(text);
        } else {
          internalDatabase.importAllCsv(text);
        }
        alert(t("alert.importOk"));
      } catch (err) {
        alert(t("alert.importFail", { error: (err as Error).message }));
      }
      fileInput.value = "";
    });

    this.root.querySelector('[data-bins-action="clear-bin"]')?.addEventListener("click", async () => {
      const meta = BIN_META.find((b) => b.id === this.activeBin);
      const label = binLabel(this.activeBin) || meta?.label || this.activeBin;
      const ok = await confirmWarning(t("alert.clearBin", { label }), {
        title: t("confirm.clearBinTitle"),
        confirmLabel: t("confirm.continue"),
      });
      if (ok) {
        internalDatabase.clearBin(this.activeBin);
      }
    });

    const form = this.root.querySelector<HTMLFormElement>("#binsDemoForm");
    form?.addEventListener("submit", (e) => {
      e.preventDefault();
      const title = (this.root.querySelector("#binsDemoTitle") as HTMLInputElement).value.trim();
      const body = (this.root.querySelector("#binsDemoBody") as HTMLInputElement).value.trim();
      internalDatabase.upsert("notes", { title, body, source: "admin-demo" });
      this.activeBin = "notes";
      form.reset();
      alert(t("alert.noteSaved"));
    });
  }
}

export function mountAdminDataBinsPanel(selector = "#adminDataBinsRoot"): AdminDataBinsPanel | null {
  const root = document.querySelector<HTMLElement>(selector);
  if (!root) return null;
  const panel = new AdminDataBinsPanel(root);
  panel.mount();
  return panel;
}
