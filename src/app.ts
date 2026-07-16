import { internalDatabase } from "./storage/internalDatabase";
import type { DataRecord } from "./storage/dataBins";
import {
  localeTag,
  onLangChange,
  paymentMethodLabel,
  statusLabel,
  t,
  vehicleTypeLabel,
  washerOptionLabel,
} from "./i18n";
import {
  getRememberMe,
  getRememberedUser,
  isAdminAuthenticated,
  logoutAdmin,
  setAdminAuthenticated,
  setRememberMe,
  validateAdminLogin,
} from "./admin/auth";
import { bindConfirmDialog, confirmWarning } from "./ui/confirmDialog";

const DEFAULT_SERVICES = [
  {id:"basic", name:"Lavado básico", regular:600, late:700, duration:35, specialist:false},
  {id:"waxcream", name:"Lavado, cera y crema", regular:1450, late:1700, duration:45, specialist:false},
  {id:"wax", name:"Lavado y cera", regular:1100, late:1300, duration:40, specialist:false},
  {id:"cream", name:"Lavado y crema", regular:1000, late:1200, duration:40, specialist:false},
  {id:"interior_disassembled", name:"Interior desarmado", regular:7500, late:7500, duration:1440, specialist:false},
  {id:"interior_assembled", name:"Interior armado", regular:6500, late:6500, duration:300, specialist:false},
  {id:"shine", name:"Brillo de vehículo", regular:7500, late:7500, duration:300, specialist:true},
  {id:"shine_interior", name:"Brillo e interior", regular:15000, late:15000, duration:360, specialist:true}
];

const DEFAULT_WASHERS = [
  {id:"w1", name:"José Ángel Blanco", specialist:false},
  {id:"w2", name:"Eskarlin Martínez", specialist:true},
  {id:"w3", name:"Jhovanny Flete", specialist:false},
  {id:"w4", name:"Erison Sánchez", specialist:true},
  {id:"w5", name:"Javiel Gutiérrez", specialist:true},
  {id:"w6", name:"José Antonio Pérez", specialist:false},
  {id:"w7", name:"Héctor Jorge Guzmán", specialist:false},
  {id:"w8", name:"Miguel Ángel Abreu", specialist:false}
];

type Service = typeof DEFAULT_SERVICES[number] & DataRecord;
type Washer = typeof DEFAULT_WASHERS[number] & DataRecord;
type Reservation = DataRecord & {
  clientName: string;
  clientPhone: string;
  vehicleType: string;
  vehicleModel: string;
  vehicleYear?: string | number;
  vehiclePlate?: string;
  vehicleColor?: string;
  serviceId: string;
  serviceName: string;
  washer: string;
  date: string;
  time: string;
  paymentMethod: string;
  tip: number;
  cardTax: number;
  servicePrice: number;
  cancellationFee: number;
  total: number;
  duration: number;
  notes?: string;
  status: string;
  washStartedAt?: string;
  washCompletedAt?: string;
};

let services: Service[] = [];
let reservations: Reservation[] = [];
let washers: Washer[] = [];

const $ = (id: string) => document.getElementById(id)!;
const money = (n: number) => new Intl.NumberFormat("es-DO",{style:"currency",currency:"DOP",maximumFractionDigits:0}).format(n);

function phoneDigits(value: string): string {
  return value.replace(/\D/g, "").slice(0, 10);
}

function normalizePlate(value: string): string {
  return String(value || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function vehicleDedupeKey(r: {
  clientPhone?: unknown;
  vehiclePlate?: unknown;
  vehicleModel?: unknown;
  vehicleYear?: unknown;
}): string {
  const plate = normalizePlate(String(r.vehiclePlate || ""));
  if (plate) return `plate:${plate}`;
  const phone = phoneDigits(String(r.clientPhone || ""));
  const model = String(r.vehicleModel || "").trim().toLowerCase().replace(/\s+/g, " ");
  const year = String(r.vehicleYear || "").trim();
  return `veh:${phone}|${model}|${year}`;
}

/** Formats as 809-000-0000 while typing. */
function formatPhoneDO(value: string): string {
  const d = phoneDigits(value);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
}

function syncFromDatabase(){
  services = internalDatabase.getRecords<Service>("services");
  reservations = internalDatabase.getRecords<Reservation>("reservations");
  washers = internalDatabase.getRecords<Washer>("washers");
}

function persist(){
  internalDatabase.commit({
    services: services as unknown as DataRecord[],
    reservations: reservations as unknown as DataRecord[],
    washers: washers as unknown as DataRecord[],
  });
}

function tickWashProgressMeters(): void {
  document.querySelectorAll<HTMLElement>("[data-wash-progress]").forEach((el) => {
    const id = el.dataset.washProgress;
    const reservation = reservations.find((r) => r.id === id);
    if (!reservation || reservation.status === "Cancelado") return;
    const progress = getWashProgress(reservation);
    el.className = `wash-progress wash-progress--${progress.state}`;
    const card = el.closest(".wash-tracker-card");
    if (card) card.className = `wash-tracker-card wash-tracker-card--${progress.state}`;
    const pct = el.querySelector("[data-wash-pct]");
    const fill = el.querySelector<HTMLElement>("[data-wash-fill]");
    const elapsed = el.querySelector("[data-wash-elapsed]");
    const remain = el.querySelector("[data-wash-remain]");
    const label = el.querySelector(".wash-progress-label");
    const track = el.querySelector(".wash-progress-track");
    if (pct) pct.textContent = `${progress.pct}%`;
    if (fill) fill.style.width = `${progress.pct}%`;
    if (elapsed) elapsed.textContent = `${t("reservations.elapsed")}: ${formatShortDuration(progress.elapsedMin)}`;
    if (remain) remain.textContent = `${t("reservations.remaining")}: ${formatShortDuration(progress.remainMin)}`;
    if (label) {
      label.textContent =
        progress.state === "idle"
          ? t("reservations.progressWaiting")
          : progress.state === "running"
            ? t("reservations.progressRunning")
            : progress.state === "overdue"
              ? t("reservations.progressOverdue")
              : t("reservations.progressDone");
    }
    if (track) track.setAttribute("aria-valuenow", String(progress.pct));
  });
}

let washProgressTimer: number | null = null;
function ensureWashProgressTimer(): void {
  if (washProgressTimer != null) return;
  washProgressTimer = window.setInterval(tickWashProgressMeters, 1000);
}

export async function initApp(){
  await internalDatabase.init({
    defaultServices: DEFAULT_SERVICES as unknown as DataRecord[],
    defaultWashers: DEFAULT_WASHERS as unknown as DataRecord[],
  });
  syncFromDatabase();
  wireUi();
  renderServiceOptions();
  renderAll();
  ensureWashProgressTimer();
  internalDatabase.subscribe(() => {
    syncFromDatabase();
    renderServiceOptions();
    renderAll();
  });
}

function isLate(time){
  if(!time) return false;
  const [h] = time.split(":").map(Number);
  return h >= 18;
}

function parseMoneyInput(value: string): number {
  const digits = String(value || "").replace(/[^\d]/g, "");
  return digits ? Number(digits) : 0;
}

function formatMoneyInput(value: string | number): string {
  const n = typeof value === "number" ? value : parseMoneyInput(value);
  if (!n) return "";
  return new Intl.NumberFormat("es-DO", { maximumFractionDigits: 0 }).format(n);
}

function selectedTip(){
  const v = $("tipSelect").value;
  return v === "custom" ? parseMoneyInput(($("customTip") as HTMLInputElement).value) : Number(v);
}

function currentService(){
  return services.find(s => s.id === $("serviceSelect").value);
}

function calculate(){
  const s = currentService();
  if(!s) return null;
  const servicePrice = isLate($("bookingTime").value) ? s.late : s.regular;
  const tip = selectedTip();
  const method = $("paymentMethod").value;
  // Business-configurable rule requested by owner:
  // 18% added when payment method is card.
  const taxableBase = servicePrice + tip;
  const cardTax = method === "Tarjeta" ? taxableBase * 0.18 : 0;
  const total = taxableBase + cardTax;
  return {servicePrice, tip, cardTax, total, duration:s.duration};
}

function statusBadgeClass(status){
  if(status === "Reserva confirmada") return "badge-confirmada";
  if(status === "En lavado") return "badge-lavado";
  if(status === "Listo para entregar") return "badge-listo";
  if(status === "Cancelado") return "badge-cancelado";
  return "";
}

function vehicleTypeBadgeClass(type: string): string {
  if (type === "Carro") return "badge-type-car";
  if (type === "Jeepeta") return "badge-type-suv";
  if (type === "Camioneta") return "badge-type-truck";
  if (type === "Vehículo grande") return "badge-type-large";
  return "badge-type-default";
}

function renderSummary(){
  const c = calculate();
  if(!c){ $("summary").innerHTML = ""; return; }
  const durationText = c.duration >= 1440
    ? t("booking.hours24")
    : `${c.duration} ${t("booking.minutes")}`;
  $("summary").innerHTML = `
    <strong>${t("booking.summary")}</strong>
    <div class="summary-grid">
      <div class="summary-row"><span>${t("booking.summaryService")}</span><strong>${money(c.servicePrice)}</strong></div>
      <div class="summary-row"><span>${t("booking.summaryTip")}</span><strong>${money(c.tip)}</strong></div>
      ${c.cardTax ? `<div class="summary-row"><span>${t("booking.summaryCard")}</span><strong>${money(c.cardTax)}</strong></div>` : ""}
    </div>
    <div class="summary-total"><span>${t("booking.summaryTotal")}</span><strong>${money(c.total)}</strong></div>
    <div class="summary-meta">${t("booking.summaryDuration")}: ${durationText}</div>
  `;
}

function renderServiceOptions(){
  $("serviceSelect").innerHTML = services.map(s => `<option value="${s.id}">${s.name}</option>`).join("");
  renderWasherOptions();
  renderSummary();
}

function renderWasherOptions(){
  const s = currentService();
  const eligible = washers.filter(w => !s?.specialist || w.specialist);
  $("washerSelect").innerHTML =
    `<option value="" disabled selected>${t("booking.washerPh")}</option>` +
    `<option value="Aleatorio +">${t("booking.washerAny")}</option>` +
    eligible.map(w => `<option value="${w.name}">${washerOptionLabel(w.name, w.specialist)}</option>`).join("");
}

function isFlexibleWasher(washer){
  return washer === "Aleatorio +" || washer === "Cualquier lavador disponible";
}

function overlaps(r, date, time, duration, washer){
  if(r.date !== date || r.status === "Cancelado") return false;
  if(isFlexibleWasher(washer) || isFlexibleWasher(r.washer)) return false;
  if(r.washer !== washer) return false;
  const toMin = t => {const [h,m]=t.split(":").map(Number); return h*60+m};
  const start = toMin(time), end = start + duration;
  const rStart = toMin(r.time), rEnd = rStart + r.duration;
  return start < rEnd && end > rStart;
}

function checkBusinessHours(date, time, duration){
  const d = new Date(`${date}T00:00:00`);
  const day = d.getDay();
  const [h,m] = time.split(":").map(Number);
  const start = h*60+m;
  const close = day === 0 ? 17*60 : 23*60;
  return start >= 9*60 && start + duration <= close;
}

function isCompletedWash(r: Reservation): boolean {
  return r.status === "Listo para entregar";
}

function activeBookings(): Reservation[] {
  return reservations.filter((r) => !isCompletedWash(r));
}

function renderReservations(){
  if (reservationsView === "calendar") {
    $("reservationsList")?.classList.add("hidden");
    $("reservationsCalendar")?.classList.remove("hidden");
    renderBookingsCalendar();
    return;
  }
  $("reservationsList")?.classList.remove("hidden");
  $("reservationsCalendar")?.classList.add("hidden");

  const root = $("reservationsList");
  const list = activeBookings();
  if(!list.length){
    root.innerHTML = `
      <div class="empty-state">
        <strong>${t("reservations.emptyTitle")}</strong>
        <p>${t("reservations.emptyBody")}</p>
      </div>`;
    return;
  }
  root.innerHTML = list
    .slice().sort((a,b)=>`${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`))
    .map(r => reservationCardHtml(r)).join("");
}

function formatShortDuration(totalMinutes: number): string {
  const mins = Math.max(0, Math.round(totalMinutes));
  if (mins >= 1440) return t("booking.hours24");
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return t("duration.hm", { h, m });
  if (h) return `${h}h`;
  return `${m} ${t("admin.min")}`;
}

type WashProgress = {
  pct: number;
  elapsedMin: number;
  remainMin: number;
  totalMin: number;
  state: "idle" | "running" | "done" | "overdue";
};

function getWashProgress(r: Reservation): WashProgress {
  const totalMin = Math.max(1, Number(r.duration) || 1);
  if (r.status === "Listo para entregar") {
    const started = r.washStartedAt ? new Date(r.washStartedAt).getTime() : NaN;
    const ended = r.washCompletedAt ? new Date(r.washCompletedAt).getTime() : Date.now();
    const elapsed = Number.isFinite(started) ? Math.max(0, (ended - started) / 60000) : totalMin;
    return {
      pct: 100,
      elapsedMin: Math.round(elapsed),
      remainMin: 0,
      totalMin,
      state: "done",
    };
  }
  if (r.status !== "En lavado" || !r.washStartedAt) {
    return { pct: 0, elapsedMin: 0, remainMin: totalMin, totalMin, state: "idle" };
  }
  const started = new Date(r.washStartedAt).getTime();
  const elapsedMin = Math.max(0, (Date.now() - started) / 60000);
  if (elapsedMin >= totalMin) {
    return {
      pct: 100,
      elapsedMin: Math.floor(elapsedMin),
      remainMin: 0,
      totalMin,
      state: "overdue",
    };
  }
  return {
    pct: Math.min(99, Math.round((elapsedMin / totalMin) * 100)),
    elapsedMin: Math.floor(elapsedMin),
    remainMin: Math.max(0, Math.ceil(totalMin - elapsedMin)),
    totalMin,
    state: "running",
  };
}

function washProgressHtml(r: Reservation): string {
  if (r.status === "Cancelado") return "";
  const progress = getWashProgress(r);
  const label =
    progress.state === "idle"
      ? t("reservations.progressWaiting")
      : progress.state === "running"
        ? t("reservations.progressRunning")
        : progress.state === "overdue"
          ? t("reservations.progressOverdue")
          : t("reservations.progressDone");

  return `
    <div class="wash-progress wash-progress--${progress.state}" data-wash-progress="${r.id}">
      <div class="wash-progress-head">
        <span class="wash-progress-label">${label}</span>
        <strong class="wash-progress-pct" data-wash-pct>${progress.pct}%</strong>
      </div>
      <div class="wash-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress.pct}">
        <span class="wash-progress-fill" data-wash-fill style="width:${progress.pct}%"></span>
      </div>
      <div class="wash-progress-meta">
        <span data-wash-elapsed>${t("reservations.elapsed")}: ${formatShortDuration(progress.elapsedMin)}</span>
        <span data-wash-remain>${t("reservations.remaining")}: ${formatShortDuration(progress.remainMin)}</span>
        <span>${t("reservations.serviceTime")}: ${formatShortDuration(progress.totalMin)}</span>
      </div>
    </div>`;
}

function reservationCardHtml(r: Reservation): string {
  const isWashing = r.status === "En lavado";
  const isReady = r.status === "Listo para entregar";
  return `
    <article class="item ${isWashing ? "item--washing" : ""}">
      <div class="item-top">
        <div>
          <h4>${r.clientName}</h4>
          <div class="item-service">${r.serviceName}</div>
        </div>
        <span class="badge ${statusBadgeClass(r.status)}">${statusLabel(r.status)}</span>
      </div>
      <div class="item-meta">
        <div>${r.date} · ${r.time}</div>
        <div>${vehicleTypeLabel(r.vehicleType)} · ${r.vehicleModel} · ${r.vehiclePlate || t("reservations.noPlate")}</div>
        <div>${t("reservations.washer")}: ${washerOptionLabel(r.washer)}</div>
        <div>${t("reservations.payment")}: ${paymentMethodLabel(r.paymentMethod)} · ${t("booking.summaryTotal")}: ${money(r.total)}</div>
      </div>
      ${washProgressHtml(r)}
      <div class="actions">
        <button type="button" class="${isWashing ? "primary" : ""}" onclick="updateStatus('${r.id}','En lavado')">${t("reservations.washing")}</button>
        <button type="button" class="${isReady ? "primary" : ""}" onclick="updateStatus('${r.id}','Listo para entregar')">${t("reservations.ready")}</button>
        <button type="button" class="danger" onclick="cancelReservation('${r.id}')">${t("reservations.cancel")}</button>
      </div>
    </article>`;
}

type ReservationsView = "list" | "calendar";
let reservationsView: ReservationsView = "list";
let calendarCursor = new Date();
let calendarSelectedDate = "";

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function setReservationsView(view: ReservationsView): void {
  reservationsView = view;
  document.querySelectorAll("[data-reservations-view]").forEach((btn) => {
    btn.classList.toggle("active", (btn as HTMLElement).dataset.reservationsView === view);
  });
  renderReservations();
}

function renderBookingsCalendar(): void {
  const root = $("reservationsCalendar");
  if (!root) return;

  const year = calendarCursor.getFullYear();
  const month = calendarCursor.getMonth();
  const first = new Date(year, month, 1);
  const startPad = first.getDay(); // 0 Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = ymd(new Date());
  if (!calendarSelectedDate) calendarSelectedDate = today;

  const counts = new Map<string, number>();
  activeBookings().forEach((r) => {
    if (r.status === "Cancelado") return;
    counts.set(r.date, (counts.get(r.date) || 0) + 1);
  });

  const monthLabel = calendarCursor.toLocaleDateString(localeTag(), {
    month: "long",
    year: "numeric",
  });

  const weekdays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(2024, 0, 7 + i); // Jan 7, 2024 = Sunday
    return d.toLocaleDateString(localeTag(), { weekday: "short" });
  });

  let cells = "";
  for (let i = 0; i < startPad; i++) {
    cells += `<div class="cal-day cal-day--empty"></div>`;
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const date = ymd(new Date(year, month, day));
    const count = counts.get(date) || 0;
    const isToday = date === today;
    const isSelected = date === calendarSelectedDate;
    cells += `
      <button type="button" class="cal-day ${isToday ? "is-today" : ""} ${isSelected ? "is-selected" : ""} ${count ? "has-bookings" : ""}" data-cal-date="${date}">
        <span class="cal-day-num">${day}</span>
        ${count ? `<span class="cal-day-count">${count}</span>` : ""}
      </button>`;
  }

  const dayRows = activeBookings()
    .filter((r) => r.date === calendarSelectedDate)
    .sort((a, b) => a.time.localeCompare(b.time));

  root.innerHTML = `
    <div class="cal-toolbar">
      <button type="button" class="ghost" id="calPrev" aria-label="${t("reservations.prevMonth")}">‹</button>
      <strong class="cal-month">${monthLabel}</strong>
      <button type="button" class="ghost" id="calNext" aria-label="${t("reservations.nextMonth")}">›</button>
    </div>
    <div class="cal-weekdays">${weekdays.map((w) => `<span>${w}</span>`).join("")}</div>
    <div class="cal-grid">${cells}</div>
    <div class="cal-day-panel">
      <h3>${t("reservations.dayBookings")} · ${calendarSelectedDate}</h3>
      <div class="list">
        ${
          dayRows.length
            ? dayRows.map((r) => reservationCardHtml(r)).join("")
            : `<div class="empty-state"><strong>${t("reservations.noDayBookings")}</strong></div>`
        }
      </div>
    </div>`;

  $("calPrev")?.addEventListener("click", () => {
    calendarCursor = new Date(year, month - 1, 1);
    renderBookingsCalendar();
  });
  $("calNext")?.addEventListener("click", () => {
    calendarCursor = new Date(year, month + 1, 1);
    renderBookingsCalendar();
  });
  root.querySelectorAll<HTMLButtonElement>("[data-cal-date]").forEach((btn) => {
    btn.addEventListener("click", () => {
      calendarSelectedDate = btn.dataset.calDate || "";
      renderBookingsCalendar();
    });
  });
}

function getHiddenVehicleKeys(): string[] {
  try {
    const raw = internalDatabase.getSetting("hiddenVehicleKeys");
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function setHiddenVehicleKeys(keys: string[]): void {
  internalDatabase.setSetting("hiddenVehicleKeys", JSON.stringify([...new Set(keys)]));
}

type VehicleSummary = Reservation & {
  _key: string;
  spentTotal: number;
  tipsTotal: number;
  visitCount: number;
};

function collectVehicles(): VehicleSummary[] {
  const hidden = new Set(getHiddenVehicleKeys());
  const map = new Map<string, VehicleSummary>();
  const sorted = [...reservations].sort((a, b) =>
    String(a.updatedAt || a.createdAt || "").localeCompare(String(b.updatedAt || b.createdAt || ""))
  );

  sorted.forEach((r) => {
    if (!r.vehicleModel && !r.vehiclePlate) return;
    const key = vehicleDedupeKey(r);
    if (hidden.has(key)) return;
    const prev = map.get(key);
    const countsTowardSpend = r.status !== "Cancelado";
    const spent = countsTowardSpend ? Number(r.total || 0) : 0;
    const tips = countsTowardSpend ? Number(r.tip || 0) : 0;
    const visits = countsTowardSpend ? 1 : 0;

    if (!prev) {
      map.set(key, {
        ...r,
        _key: key,
        spentTotal: spent,
        tipsTotal: tips,
        visitCount: visits,
      });
      return;
    }

    map.set(key, {
      ...prev,
      ...r,
      _key: key,
      vehiclePlate: r.vehiclePlate || prev.vehiclePlate,
      vehicleColor: r.vehicleColor || prev.vehicleColor,
      vehicleYear: r.vehicleYear || prev.vehicleYear,
      vehicleModel: r.vehicleModel || prev.vehicleModel,
      vehicleType: r.vehicleType || prev.vehicleType,
      clientName: r.clientName || prev.clientName,
      clientPhone: r.clientPhone || prev.clientPhone,
      spentTotal: prev.spentTotal + spent,
      tipsTotal: prev.tipsTotal + tips,
      visitCount: prev.visitCount + visits,
    });
  });

  return [...map.values()];
}

function fillEditVehicleYears(selected?: string): void {
  const sel = $("editVehicleYear") as HTMLSelectElement | null;
  if (!sel) return;
  const max = Math.max(2035, new Date().getFullYear() + 1);
  let html = `<option value="">${t("booking.yearPh")}</option>`;
  for (let y = max; y >= 1980; y--) {
    const value = String(y);
    html += `<option value="${value}"${selected === value ? " selected" : ""}>${value}</option>`;
  }
  sel.innerHTML = html;
}

function openVehicleEditor(key: string): void {
  const vehicle = collectVehicles().find((v) => v._key === key);
  if (!vehicle) return;
  ($("editVehicleKey") as HTMLInputElement).value = key;
  ($("editVehicleType") as HTMLSelectElement).value = vehicle.vehicleType || "Carro";
  ($("editVehicleModel") as HTMLInputElement).value = vehicle.vehicleModel || "";
  fillEditVehicleYears(String(vehicle.vehicleYear || ""));
  ($("editVehiclePlate") as HTMLInputElement).value = vehicle.vehiclePlate || "";
  ($("editVehicleColor") as HTMLInputElement).value = vehicle.vehicleColor || "";
  ($("editVehicleClientName") as HTMLInputElement).value = vehicle.clientName || "";
  ($("editVehicleClientPhone") as HTMLInputElement).value = vehicle.clientPhone || "";
  $("vehicleEditModal").classList.remove("hidden");
}

function closeVehicleEditor(): void {
  $("vehicleEditModal")?.classList.add("hidden");
}

async function deleteVehicleByKey(key: string): Promise<void> {
  const vehicle = collectVehicles().find((v) => v._key === key);
  const label = vehicle?.vehicleModel || vehicle?.vehiclePlate || key;
  const ok = await confirmWarning(t("vehicles.deleteConfirm", { name: label }), {
    title: t("vehicles.deleteTitle"),
    confirmLabel: t("confirm.continue"),
  });
  if (!ok) return;
  setHiddenVehicleKeys([...getHiddenVehicleKeys(), key]);
  renderVehicles();
}

function renderVehicles(){
  const vehicles = collectVehicles();

  $("vehiclesList").innerHTML = vehicles.length ? vehicles.map((r) => `
    <article class="vehicle-row is-collapsed" data-vehicle-row="${encodeURIComponent(r._key)}">
      <div class="vehicle-row-main">
        <button type="button" class="vehicle-row-toggle" data-toggle-vehicle="${encodeURIComponent(r._key)}" aria-expanded="false">
          <span class="vehicle-row-caret" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </span>
          <span class="vehicle-row-title">
            <strong>${r.vehicleModel}</strong>
            <span class="badge ${vehicleTypeBadgeClass(r.vehicleType)}">${vehicleTypeLabel(r.vehicleType)}</span>
          </span>
          <span class="vehicle-row-summary">
            <span class="vehicle-plate">${r.vehiclePlate || t("reservations.noPlate")}</span>
            <span class="vehicle-row-spent">${money(r.spentTotal)}</span>
          </span>
        </button>
        <div class="item-icon-actions">
          <button type="button" class="icon-btn" data-edit-vehicle="${encodeURIComponent(r._key)}" aria-label="${t("admin.edit")}" title="${t("admin.edit")}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <button type="button" class="icon-btn icon-btn--danger" data-del-vehicle="${encodeURIComponent(r._key)}" aria-label="${t("bins.delete")}" title="${t("bins.delete")}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </div>
      <div class="vehicle-row-body" hidden>
        <div class="vehicle-details">
          <p class="vehicle-details-line">
            <strong>${r.vehicleYear || t("vehicles.yearUnknown")}</strong>
            <span class="vehicle-dot" aria-hidden="true">·</span>
            <span>${r.vehicleColor || t("vehicles.colorUnknown")}</span>
            <span class="vehicle-dot" aria-hidden="true">·</span>
            <span class="vehicle-plate">${r.vehiclePlate || t("reservations.noPlate")}</span>
          </p>
          <p class="vehicle-details-client">
            <span>${r.clientName}</span>
            <a href="tel:${String(r.clientPhone || "").replace(/\D/g, "")}">${r.clientPhone}</a>
          </p>
        </div>
        <div class="vehicle-spend">
          <div class="vehicle-spend-item">
            <span>${t("vehicles.spent")}</span>
            <strong>${money(r.spentTotal)}</strong>
          </div>
          <div class="vehicle-spend-item">
            <span>${t("vehicles.tipsPaid")}</span>
            <strong>${money(r.tipsTotal)}</strong>
          </div>
          <div class="vehicle-spend-item">
            <span>${t("vehicles.visits")}</span>
            <strong>${r.visitCount}</strong>
          </div>
        </div>
      </div>
    </article>`).join("") : `
      <div class="empty-state">
        <strong>${t("vehicles.emptyTitle")}</strong>
        <p>${t("vehicles.emptyBody")}</p>
      </div>`;

  $("vehiclesList")?.querySelectorAll<HTMLButtonElement>("[data-toggle-vehicle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const row = btn.closest(".vehicle-row");
      if (!row) return;
      const open = row.classList.toggle("is-collapsed") === false;
      row.classList.toggle("is-open", open);
      const body = row.querySelector(".vehicle-row-body") as HTMLElement | null;
      if (body) body.hidden = !open;
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
  });
  $("vehiclesList")?.querySelectorAll<HTMLButtonElement>("[data-edit-vehicle]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const key = decodeURIComponent(btn.dataset.editVehicle || "");
      if (key) openVehicleEditor(key);
    });
  });
  $("vehiclesList")?.querySelectorAll<HTMLButtonElement>("[data-del-vehicle]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const key = decodeURIComponent(btn.dataset.delVehicle || "");
      if (key) void deleteVehicleByKey(key);
    });
  });
}

function washTrackerCardHtml(r: Reservation): string {
  const progress = getWashProgress(r);
  const vehicle = [r.vehicleModel, r.vehiclePlate].filter(Boolean).join(" · ") || r.clientName;
  return `
    <article class="wash-tracker-card wash-tracker-card--${progress.state}">
      <div class="wash-tracker-card-top">
        <div>
          <strong class="wash-tracker-vehicle">${vehicle}</strong>
          <div class="wash-tracker-sub">${r.clientName} · ${r.serviceName}</div>
          <div class="wash-tracker-sub">${t("reservations.washer")}: ${washerOptionLabel(r.washer)} · ${r.time}</div>
        </div>
        <button type="button" class="ghost" onclick="updateStatus('${r.id}','Listo para entregar')">${t("reservations.ready")}</button>
      </div>
      ${washProgressHtml(r)}
    </article>`;
}

function renderWashTracker(): void {
  const root = document.getElementById("washTracker");
  if (!root) return;

  const active = reservations
    .filter((r) => r.status === "En lavado")
    .sort((a, b) => String(a.washStartedAt || "").localeCompare(String(b.washStartedAt || "")));

  if (!active.length) {
    root.innerHTML = `
      <div class="wash-tracker-empty">
        <div class="wash-tracker-empty-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M3 13l2-5a2 2 0 0 1 1.9-1.3h10.2A2 2 0 0 1 19 8l2 5M5 17h.01M19 17h.01M4 13h16v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <div>
          <strong>${t("admin.washTrackerEmptyTitle")}</strong>
          <p>${t("admin.washTrackerEmptyBody")}</p>
        </div>
      </div>`;
    return;
  }

  root.innerHTML = `
    <div class="wash-tracker-head">
      <div>
        <p class="panel-kicker">${t("admin.washTrackerKicker")}</p>
        <h3>${t("admin.washTrackerTitle")}</h3>
      </div>
      <span class="wash-tracker-count">${active.length} ${t("admin.washTrackerActive")}</span>
    </div>
    <div class="wash-tracker-list">
      ${active.map((r) => washTrackerCardHtml(r)).join("")}
    </div>`;
}

function renderAdmin(){
  const revenue = reservations.filter(r=>r.status!=="Cancelado").reduce((a,r)=>a+r.total,0);
  const tips = reservations.filter(r=>r.status!=="Cancelado").reduce((a,r)=>a+r.tip,0);
  const occupiedWashers = new Set(
    reservations
      .filter((r) => r.status === "En lavado" && String(r.washer || "").trim())
      .map((r) => String(r.washer).trim().toLowerCase())
  ).size;
  renderWashTracker();
  $("stats").innerHTML = `
    <article class="stat-card stat-card--bookings" data-open-calendar role="button" tabindex="0">
      <div class="stat-card-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
      </div>
      <div class="stat-card-body">
        <span class="stat-card-label">${t("admin.statReservations")}</span>
        <strong class="stat-card-value">${reservations.length}</strong>
      </div>
    </article>
    <article class="stat-card stat-card--revenue" data-open-budget role="button" tabindex="0">
      <div class="stat-card-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M12 3v18M8 8.5c0-1.7 1.8-3 4-3s4 1.3 4 3-1.8 3-4 3-4 1.3-4 3 1.8 3 4 3 4-1.3 4-3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
      <div class="stat-card-body">
        <span class="stat-card-label">${t("admin.statRevenue")}</span>
        <strong class="stat-card-value">${money(revenue)}</strong>
      </div>
    </article>
    <article class="stat-card stat-card--tips" data-open-budget role="button" tabindex="0">
      <div class="stat-card-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M12 17v4M8 21h8M7 3h10l1 8a6 6 0 0 1-12 0L7 3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
      <div class="stat-card-body">
        <span class="stat-card-label">${t("admin.statTips")}</span>
        <strong class="stat-card-value">${money(tips)}</strong>
      </div>
    </article>
    <article class="stat-card stat-card--washers" data-open-washers role="button" tabindex="0">
      <span class="stat-occupied-badge ${occupiedWashers ? "is-active" : ""}" title="${t("admin.washersOccupiedTitle", { count: occupiedWashers })}">${occupiedWashers}</span>
      <div class="stat-card-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM4.5 19a3.5 3.5 0 0 1 7 0M12.5 19a3.5 3.5 0 0 1 7 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
      </div>
      <div class="stat-card-body">
        <span class="stat-card-label">${t("admin.statWashers")}</span>
        <strong class="stat-card-value">${washers.length}</strong>
      </div>
    </article>`;
  $("stats")?.querySelector("[data-open-washers]")?.addEventListener("click", openWashersModal);
  $("stats")?.querySelector("[data-open-washers]")?.addEventListener("keydown", (e) => {
    const key = (e as KeyboardEvent).key;
    if (key === "Enter" || key === " ") {
      e.preventDefault();
      openWashersModal();
    }
  });
  $("stats")?.querySelectorAll("[data-open-budget]").forEach((el) => {
    el.addEventListener("click", () => {
      switchTab("budget");
      renderBudget();
      document.querySelector("main")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    el.addEventListener("keydown", (e) => {
      const key = (e as KeyboardEvent).key;
      if (key === "Enter" || key === " ") {
        e.preventDefault();
        switchTab("budget");
        renderBudget();
      }
    });
  });
  $("stats")?.querySelectorAll("[data-open-calendar]").forEach((el) => {
    el.addEventListener("click", () => {
      setReservationsView("calendar");
      switchTab("reservations");
      document.querySelector("main")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    el.addEventListener("keydown", (e) => {
      const key = (e as KeyboardEvent).key;
      if (key === "Enter" || key === " ") {
        e.preventDefault();
        setReservationsView("calendar");
        switchTab("reservations");
      }
    });
  });
  $("servicesAdminList").innerHTML = `
    <div class="sheet-scroll">
      <table class="sheet-table">
        <thead>
          <tr>
            <th>${t("admin.serviceName")}</th>
            <th>${t("admin.regularShort")}</th>
            <th>${t("admin.lateShort")}</th>
            <th>${t("admin.durationShort")}</th>
            <th>${t("admin.specialistBadge")}</th>
            <th>${t("admin.edit")} / ${t("admin.delete")}</th>
          </tr>
        </thead>
        <tbody>
          ${services.map(s => `
            <tr>
              <td class="sheet-cell-name">${s.name}</td>
              <td>${money(s.regular)}</td>
              <td>${money(s.late)}</td>
              <td>${s.duration >= 1440 ? t("booking.hours24") : `${s.duration} ${t("admin.min")}`}</td>
              <td>${s.specialist ? `<span class="badge badge-listo">${t("admin.specialistBadge")}</span>` : "—"}</td>
              <td class="sheet-cell-actions">
                <button type="button" class="ghost sheet-btn" onclick="openServiceEditor('${s.id}')">${t("admin.edit")}</button>
                <button type="button" class="danger sheet-btn" onclick="deleteService('${s.id}')">${t("admin.delete")}</button>
              </td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

window.updateStatus = (id, status) => {
  const now = new Date().toISOString();
  reservations = reservations.map((r) => {
    if (r.id !== id) return r;
    const next: Reservation = { ...r, status, updatedAt: now };
    if (status === "En lavado") {
      if (!r.washStartedAt) next.washStartedAt = now;
      next.washCompletedAt = undefined;
    }
    if (status === "Listo para entregar") {
      if (!r.washStartedAt) next.washStartedAt = now;
      next.washCompletedAt = now;
    }
    return next;
  });
  persist();
  renderAll();
};

window.cancelReservation = (id) => {
  reservations = reservations.map(r => r.id===id ? {...r,status:"Cancelado", cancellationFee:100} : r);
  persist(); renderAll();
  alert(t("alert.cancelled"));
};


window.openServiceEditor = (id) => {
  const s = services.find(item => item.id === id);
  if(!s) return;
  $("editServiceId").value = s.id;
  $("editServiceName").value = s.name;
  $("editServiceRegular").value = formatMoneyInput(s.regular);
  $("editServiceLate").value = formatMoneyInput(s.late);
  $("editServiceDuration").value = s.duration;
  setDurationField("editServiceDuration", s.duration);
  $("editServiceSpecialist").checked = s.specialist;
  $("serviceEditModal").classList.remove("hidden");
};

window.deleteService = (id) => {
  const s = services.find(item => item.id === id);
  if(!s) return;
  if(reservations.some(r => r.serviceId === id)){
    alert(t("alert.serviceInUse"));
    return;
  }
  if(confirm(t("alert.deleteService", { name: s.name }))){
    services = services.filter(item => item.id !== id);
    persist();
    renderServiceOptions();
    renderAdmin();
  }
};

function closeServiceEditor(){
  $("serviceEditModal").classList.add("hidden");
}

function resetWasherForm(){
  ($("editWasherId") as HTMLInputElement).value = "";
  ($("newWasherName") as HTMLInputElement).value = "";
  ($("newWasherSpecialist") as HTMLInputElement).checked = false;
  const submit = $("washerFormSubmit");
  if (submit) {
    submit.textContent = t("washer.add");
    submit.removeAttribute("data-i18n");
    submit.dataset.i18n = "washer.add";
  }
  $("washerFormCancelEdit")?.classList.add("hidden");
}

function startEditWasher(id: string){
  const w = washers.find(item => item.id === id);
  if (!w) return;
  ($("editWasherId") as HTMLInputElement).value = w.id;
  ($("newWasherName") as HTMLInputElement).value = w.name;
  ($("newWasherSpecialist") as HTMLInputElement).checked = !!w.specialist;
  const submit = $("washerFormSubmit");
  if (submit) {
    submit.textContent = t("washer.save");
    submit.dataset.i18n = "washer.save";
  }
  $("washerFormCancelEdit")?.classList.remove("hidden");
  ($("newWasherName") as HTMLInputElement).focus();
}

function renderWashersModalList(){
  const root = $("washersModalList");
  if(!root) return;
  if(!washers.length){
    root.innerHTML = `<div class="empty-state"><strong>${t("washer.empty")}</strong></div>`;
    return;
  }
  root.innerHTML = washers.map(w => `
    <article class="washer-row">
      <div>
        <strong>${w.name}</strong>
        ${w.specialist ? `<span class="badge badge-listo">${t("admin.specialistBadge")}</span>` : ""}
      </div>
      <div class="washer-row-actions">
        <button type="button" class="ghost sheet-btn" data-edit-washer="${w.id}">${t("washer.edit")}</button>
        <button type="button" class="danger sheet-btn" data-del-washer="${w.id}">${t("washer.delete")}</button>
      </div>
    </article>`).join("");

  root.querySelectorAll<HTMLButtonElement>("[data-edit-washer]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.editWasher;
      if (id) startEditWasher(id);
    });
  });

  root.querySelectorAll<HTMLButtonElement>("[data-del-washer]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.delWasher;
      const w = washers.find(item => item.id === id);
      if(!w) return;
      if(!confirm(t("washer.deleteConfirm", { name: w.name }))) return;
      washers = washers.filter(item => item.id !== id);
      if (($("editWasherId") as HTMLInputElement).value === id) resetWasherForm();
      persist();
      renderWashersModalList();
      renderServiceOptions();
      renderAll();
    });
  });
}

function openWashersModal(){
  resetWasherForm();
  renderWashersModalList();
  $("washerModal").classList.remove("hidden");
  requestAnimationFrame(() => ($("newWasherName") as HTMLInputElement).focus());
}

function closeWashersModal(){
  resetWasherForm();
  $("washerModal").classList.add("hidden");
}

function formatDurationLabel(totalMinutes: number): string {
  const mins = Math.max(0, Math.round(Number(totalMinutes) || 0));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return t("duration.hm", { h, m });
}

function setDurationField(inputId: string, totalMinutes: number): void {
  const mins = Math.max(5, Math.round(Number(totalMinutes) || 0));
  const input = $(inputId) as HTMLInputElement | null;
  const label = $(`${inputId}Label`) as HTMLElement | null;
  if (input) input.value = String(mins);
  if (label) label.textContent = formatDurationLabel(mins);
}

function getDurationMinutes(inputId: string): number {
  return Math.max(5, Number(($(inputId) as HTMLInputElement).value) || 0);
}

let durationPickerTarget: string | null = null;

function fillDurationSelects(): void {
  const hoursMenu = $("durationHoursMenu");
  const minutesMenu = $("durationMinutesMenu");
  if (hoursMenu && !hoursMenu.children.length) {
    hoursMenu.innerHTML = Array.from({ length: 25 }, (_, i) =>
      `<button type="button" class="duration-menu-option" role="option" data-value="${i}">${i}</button>`
    ).join("");
  }
  if (minutesMenu && !minutesMenu.children.length) {
    minutesMenu.innerHTML = Array.from({ length: 12 }, (_, i) => {
      const m = i * 5;
      return `<button type="button" class="duration-menu-option" role="option" data-value="${m}">${String(m).padStart(2, "0")}</button>`;
    }).join("");
  }
}

function syncDurationMenuUI(): void {
  const h = Number(($("durationHours") as HTMLInputElement).value) || 0;
  const m = Number(($("durationMinutes") as HTMLInputElement).value) || 0;
  const hVal = $("durationHoursValue");
  const mVal = $("durationMinutesValue");
  if (hVal) hVal.textContent = String(h);
  if (mVal) mVal.textContent = String(m).padStart(2, "0");
  $("durationHoursMenu")?.querySelectorAll(".duration-menu-option").forEach((btn) => {
    btn.classList.toggle("active", Number((btn as HTMLElement).dataset.value) === h);
  });
  $("durationMinutesMenu")?.querySelectorAll(".duration-menu-option").forEach((btn) => {
    btn.classList.toggle("active", Number((btn as HTMLElement).dataset.value) === m);
  });
}

function closeDurationMenus(): void {
  document.querySelectorAll(".duration-menu-list").forEach((el) => el.classList.add("hidden"));
  document.querySelectorAll(".duration-menu-btn").forEach((btn) => {
    btn.setAttribute("aria-expanded", "false");
  });
}

function toggleDurationMenu(kind: "hours" | "minutes"): void {
  const menu = $(kind === "hours" ? "durationHoursMenu" : "durationMinutesMenu");
  const btn = $(kind === "hours" ? "durationHoursBtn" : "durationMinutesBtn");
  const wasOpen = !menu.classList.contains("hidden");
  closeDurationMenus();
  if (!wasOpen) {
    menu.classList.remove("hidden");
    btn.setAttribute("aria-expanded", "true");
    menu.querySelector(".duration-menu-option.active")?.scrollIntoView({ block: "nearest" });
  }
}

function updateDurationPreview(): void {
  const h = Number(($("durationHours") as HTMLInputElement).value) || 0;
  const m = Number(($("durationMinutes") as HTMLInputElement).value) || 0;
  $("durationPickerPreview").textContent = formatDurationLabel(h * 60 + m);
  syncDurationMenuUI();
}

function openDurationPicker(targetId: string): void {
  fillDurationSelects();
  durationPickerTarget = targetId;
  const total = Number(($(targetId) as HTMLInputElement).value) || 45;
  let h = Math.floor(total / 60);
  let m = total % 60;
  m = Math.round(m / 5) * 5;
  if (m === 60) { h += 1; m = 0; }
  if (h > 24) h = 24;
  ($("durationHours") as HTMLInputElement).value = String(h);
  ($("durationMinutes") as HTMLInputElement).value = String(m);
  closeDurationMenus();
  updateDurationPreview();
  $("durationPicker").classList.remove("hidden");
}

function closeDurationPicker(): void {
  closeDurationMenus();
  $("durationPicker").classList.add("hidden");
  durationPickerTarget = null;
}

function applyDurationPicker(): void {
  if (!durationPickerTarget) return;
  const h = Number(($("durationHours") as HTMLInputElement).value) || 0;
  const m = Number(($("durationMinutes") as HTMLInputElement).value) || 0;
  let total = h * 60 + m;
  if (total < 5) total = 5;
  setDurationField(durationPickerTarget, total);
  closeDurationPicker();
}

type BudgetRange = "today" | "7d" | "30d" | "all";
let budgetRange: BudgetRange = "30d";

function budgetRangeStart(range: BudgetRange): Date | null {
  if (range === "all") return null;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (range === "today") return d;
  if (range === "7d") {
    d.setDate(d.getDate() - 6);
    return d;
  }
  d.setDate(d.getDate() - 29);
  return d;
}

function budgetRows(): Reservation[] {
  const start = budgetRangeStart(budgetRange);
  return reservations
    .filter((r) => r.status !== "Cancelado")
    .filter((r) => {
      if (!start) return true;
      const day = new Date(`${r.date}T00:00:00`);
      return day >= start;
    })
    .slice()
    .sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`));
}

function aggregateSum(rows: Reservation[], keyFn: (r: Reservation) => string): Array<{ label: string; value: number }> {
  const map = new Map<string, number>();
  rows.forEach((r) => {
    const key = keyFn(r) || "—";
    map.set(key, (map.get(key) || 0) + Number(r.total || 0));
  });
  return [...map.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

const BUDGET_PASTEL_FILLS = ["mint", "peach", "lilac", "sky", "rose", "lemon"] as const;

function renderBudgetBars(rootId: string, items: Array<{ label: string; value: number }>, limit = 8): void {
  const root = $(rootId);
  if (!root) return;
  const list = items.slice(0, limit);
  if (!list.length) {
    root.innerHTML = `<div class="budget-empty">${t("budget.empty")}</div>`;
    return;
  }
  const max = Math.max(...list.map((i) => i.value), 1);
  root.innerHTML = list
    .map((i, idx) => {
      const pastel = BUDGET_PASTEL_FILLS[idx % BUDGET_PASTEL_FILLS.length];
      return `
    <div class="budget-bar-row">
      <div class="budget-bar-meta">
        <span>${i.label}</span>
        <strong>${money(i.value)}</strong>
      </div>
      <div class="budget-bar-track">
        <span class="budget-bar-fill--${pastel}" style="width:${Math.max(4, (i.value / max) * 100)}%"></span>
      </div>
    </div>`;
    })
    .join("");
}

function renderBudget(): void {
  if (!$("budgetStats")) return;
  const rows = budgetRows();
  const revenue = rows.reduce((a, r) => a + Number(r.total || 0), 0);
  const tips = rows.reduce((a, r) => a + Number(r.tip || 0), 0);
  const avg = rows.length ? revenue / rows.length : 0;

  $("budgetStats").innerHTML = `
    <article class="stat-card stat-card--revenue">
      <div class="stat-card-body">
        <span class="stat-card-label">${t("budget.revenue")}</span>
        <strong class="stat-card-value">${money(revenue)}</strong>
      </div>
    </article>
    <article class="stat-card stat-card--tips">
      <div class="stat-card-body">
        <span class="stat-card-label">${t("budget.tips")}</span>
        <strong class="stat-card-value">${money(tips)}</strong>
      </div>
    </article>
    <article class="stat-card stat-card--bookings">
      <div class="stat-card-body">
        <span class="stat-card-label">${t("budget.washes")}</span>
        <strong class="stat-card-value">${rows.length}</strong>
      </div>
    </article>
    <article class="stat-card stat-card--washers">
      <div class="stat-card-body">
        <span class="stat-card-label">${t("budget.avg")}</span>
        <strong class="stat-card-value">${money(avg)}</strong>
      </div>
    </article>`;

  const byDay = aggregateSum(rows, (r) => r.date).reverse().slice(-14);
  renderBudgetBars("budgetChartDays", byDay, 14);
  renderBudgetBars(
    "budgetChartPay",
    aggregateSum(rows, (r) => paymentMethodLabel(r.paymentMethod))
  );
  renderBudgetBars("budgetChartService", aggregateSum(rows, (r) => r.serviceName));
  renderBudgetBars(
    "budgetChartWasher",
    aggregateSum(rows, (r) => washerOptionLabel(r.washer))
  );

  const list = $("budgetWashesList");
  if (!list) return;
  const pastWashes = rows.filter(isCompletedWash);
  if (!pastWashes.length) {
    list.innerHTML = `<div class="empty-state"><strong>${t("budget.empty")}</strong></div>`;
    return;
  }
  list.innerHTML = `
    <div class="sheet-scroll budget-washes-sheet">
      <table class="sheet-table">
        <thead>
          <tr>
            <th>${t("budget.colDate")}</th>
            <th>${t("budget.colClient")}</th>
            <th>${t("budget.colTotal")}</th>
            <th>${t("budget.colStatus")}</th>
          </tr>
        </thead>
        <tbody>
          ${pastWashes
            .map(
              (r) => `
            <tr class="budget-wash-row" data-wash-id="${r.id}" tabindex="0" role="button">
              <td>${r.date}<div class="meta">${r.time}</div></td>
              <td class="sheet-cell-name">${r.clientName}<div class="meta">${r.serviceName}</div></td>
              <td class="budget-wash-total">${money(r.total)}</td>
              <td><span class="badge ${statusBadgeClass(r.status)}">${statusLabel(r.status)}</span></td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>`;

  list.querySelectorAll<HTMLElement>("[data-wash-id]").forEach((row) => {
    const open = () => {
      const id = row.dataset.washId;
      const record = pastWashes.find((r) => r.id === id) || reservations.find((r) => r.id === id);
      if (record) showWashDetail(record);
    };
    row.addEventListener("click", open);
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });
  });
}

function showWashDetail(record: Reservation): void {
  const modal = document.getElementById("washDetailModal");
  const title = document.getElementById("washDetailTitle");
  const body = document.getElementById("washDetailBody");
  if (!modal || !title || !body) return;

  title.textContent = record.clientName || t("budget.washDetailTitle");
  body.innerHTML = `
    <div class="wash-detail-status">
      <span class="badge ${statusBadgeClass(record.status)}">${statusLabel(record.status)}</span>
      <strong>${money(record.total)}</strong>
    </div>
    <div class="booking-success-details">
      <div class="booking-success-row">
        <span>${t("budget.colDate")}</span>
        <strong>${record.date} · ${record.time}</strong>
      </div>
      <div class="booking-success-row">
        <span>${t("budget.colClient")}</span>
        <strong>${record.clientName}<br><span class="meta">${record.clientPhone}</span></strong>
      </div>
      <div class="booking-success-row">
        <span>${t("budget.colService")}</span>
        <strong>${record.serviceName}</strong>
      </div>
      <div class="booking-success-row">
        <span>${t("booking.successVehicle")}</span>
        <strong>${vehicleTypeLabel(record.vehicleType)} · ${record.vehicleModel}${record.vehiclePlate ? ` · ${record.vehiclePlate}` : ""}</strong>
      </div>
      <div class="booking-success-row">
        <span>${t("budget.colWasher")}</span>
        <strong>${washerOptionLabel(record.washer)}</strong>
      </div>
      <div class="booking-success-row">
        <span>${t("budget.colPay")}</span>
        <strong>${paymentMethodLabel(record.paymentMethod)}</strong>
      </div>
      <div class="booking-success-row">
        <span>${t("vehicles.tipsPaid")}</span>
        <strong>${money(Number(record.tip || 0))}</strong>
      </div>
      <div class="booking-success-row booking-success-row--total">
        <span>${t("budget.colTotal")}</span>
        <strong>${money(record.total)}</strong>
      </div>
    </div>
    ${record.notes ? `<p class="wash-detail-notes"><strong>${t("booking.notes")}:</strong> ${String(record.notes).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</p>` : ""}`;

  modal.classList.remove("hidden");
}

function closeWashDetail(): void {
  document.getElementById("washDetailModal")?.classList.add("hidden");
}

function exportBudgetReport(): void {
  const rows = budgetRows();
  const header = [
    "date",
    "time",
    "client",
    "phone",
    "service",
    "washer",
    "payment",
    "tip",
    "total",
    "status",
  ];
  const lines = [header.join(",")];
  rows.forEach((r) => {
    const cells = [
      r.date,
      r.time,
      r.clientName,
      r.clientPhone,
      r.serviceName,
      r.washer,
      r.paymentMethod,
      r.tip,
      r.total,
      r.status,
    ].map((v) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    });
    lines.push(cells.join(","));
  });
  const blob = new Blob([`${lines.join("\n")}\n`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `rr-budget-report-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function renderAll(){
  renderReservations();
  renderVehicles();
  renderAdmin();
  if (document.getElementById("budget")?.classList.contains("active")) {
    renderBudget();
  }
}

function closeDashMoreMenu(): void {
  $("dashMoreMenu")?.classList.add("hidden");
  $("dashMoreBtn")?.setAttribute("aria-expanded", "false");
}

function switchTab(target: string){
  if(!target || !$(target)) return;
  document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
  $(target).classList.add("active");
  document.querySelectorAll(".dash-nav [data-tab-target]").forEach(b => {
    const btn = b as HTMLButtonElement;
    btn.classList.toggle("active", btn.dataset.tabTarget === target);
  });
  const moreActive = target === "vehicles" || target === "databins";
  $("dashMoreBtn")?.classList.toggle("active", moreActive);
  closeDashMoreMenu();
  if (target === "budget") renderBudget();
}

function enterAdmin(target = "admin"){
  document.querySelector(".app-shell")?.classList.add("is-admin");
  const chrome = document.querySelector(".admin-chrome") as HTMLElement | null;
  if(chrome) chrome.hidden = false;
  switchTab(target);
  document.querySelector("main")?.scrollIntoView({behavior:"smooth", block:"start"});
}

function showAdminLogin(pendingTarget = "admin"){
  const page = $("adminLogin");
  page.classList.remove("hidden");
  page.dataset.pendingTarget = pendingTarget;
  $("adminLoginError").classList.add("hidden");
  const remember = getRememberMe();
  ($("adminRememberMe") as HTMLInputElement).checked = remember;
  ($("adminLoginUser") as HTMLInputElement).value = remember ? getRememberedUser() : "";
  ($("adminLoginPass") as HTMLInputElement).value = "";
  const passInput = $("adminLoginPass") as HTMLInputElement;
  passInput.type = "password";
  const toggle = $("adminPassToggle") as HTMLButtonElement;
  toggle?.setAttribute("aria-pressed", "false");
  toggle?.setAttribute("aria-label", t("login.showPass"));
  toggle?.querySelector(".icon-eye")?.classList.remove("hidden");
  toggle?.querySelector(".icon-eye-off")?.classList.add("hidden");
  requestAnimationFrame(() => {
    const userEl = $("adminLoginUser") as HTMLInputElement;
    if(userEl.value) ($("adminLoginPass") as HTMLInputElement).focus();
    else userEl.focus();
  });
}

function hideAdminLogin(){
  $("adminLogin").classList.add("hidden");
  delete ($("adminLogin") as HTMLElement).dataset.pendingTarget;
}

function requestAdminAccess(target = "admin"){
  if(isAdminAuthenticated()){
    enterAdmin(target);
    return;
  }
  showAdminLogin(target);
}

function exitAdmin(){
  document.querySelector(".app-shell")?.classList.remove("is-admin");
  const chrome = document.querySelector(".admin-chrome") as HTMLElement | null;
  if(chrome) chrome.hidden = true;
  hideAdminLogin();
  switchTab("booking");
  window.scrollTo({top:0, behavior:"smooth"});
}

function signOutAdmin(){
  logoutAdmin();
  exitAdmin();
}

function wireUi(){
const phoneInput = $("clientPhone") as HTMLInputElement;
phoneInput.setAttribute("maxlength", "12");
phoneInput.setAttribute("pattern", "[0-9]{3}-[0-9]{3}-[0-9]{4}");
phoneInput.setAttribute("title", "Formato: 809-000-0000");
phoneInput.addEventListener("input", () => {
  const start = phoneInput.selectionStart;
  const prevLen = phoneInput.value.length;
  phoneInput.value = formatPhoneDO(phoneInput.value);
  const nextLen = phoneInput.value.length;
  if (start != null) {
    const offset = nextLen - prevLen;
    const pos = Math.max(0, start + offset);
    phoneInput.setSelectionRange(pos, pos);
  }
});

document.querySelectorAll("[data-enter-admin]").forEach(btn => {
  btn.addEventListener("click", () => requestAdminAccess("admin"));
});

$("adminExitBtn")?.addEventListener("click", exitAdmin);
$("adminLogoutBtn")?.addEventListener("click", signOutAdmin);

$("adminLoginCancel")?.addEventListener("click", hideAdminLogin);
$("adminLogin")?.addEventListener("click", (e) => {
  if((e.target as HTMLElement).id === "adminLogin") hideAdminLogin();
});

$("adminPassToggle")?.addEventListener("click", () => {
  const passInput = $("adminLoginPass") as HTMLInputElement;
  const toggle = $("adminPassToggle") as HTMLButtonElement;
  const showing = passInput.type === "text";
  passInput.type = showing ? "password" : "text";
  toggle.setAttribute("aria-pressed", showing ? "false" : "true");
  toggle.setAttribute("aria-label", t(showing ? "login.showPass" : "login.hidePass"));
  toggle.querySelector(".icon-eye")?.classList.toggle("hidden", !showing);
  toggle.querySelector(".icon-eye-off")?.classList.toggle("hidden", showing);
  passInput.focus();
});

$("adminLoginForm")?.addEventListener("submit", (e) => {
  e.preventDefault();
  const user = ($("adminLoginUser") as HTMLInputElement).value;
  const pass = ($("adminLoginPass") as HTMLInputElement).value;
  const remember = ($("adminRememberMe") as HTMLInputElement).checked;
  if(!validateAdminLogin(user, pass)){
    $("adminLoginError").classList.remove("hidden");
    ($("adminLoginPass") as HTMLInputElement).select();
    return;
  }
  setRememberMe(remember, user);
  setAdminAuthenticated(true, remember);
  const target = ($("adminLogin") as HTMLElement).dataset.pendingTarget || "admin";
  hideAdminLogin();
  enterAdmin(target);
});

document.querySelectorAll(".dash-nav [data-tab-target]").forEach(btn => {
  btn.addEventListener("click", () => {
    const target = (btn as HTMLElement).dataset.tabTarget || "admin";
    if(!document.querySelector(".app-shell")?.classList.contains("is-admin")){
      requestAdminAccess(target);
      return;
    }
    switchTab(target);
    document.querySelector("main")?.scrollIntoView({behavior:"smooth", block:"start"});
  });
});

$("dashMoreBtn")?.addEventListener("click", (e) => {
  e.stopPropagation();
  const menu = $("dashMoreMenu");
  if (!menu) return;
  const willOpen = menu.classList.contains("hidden");
  if (willOpen) {
    menu.classList.remove("hidden");
    $("dashMoreBtn")?.setAttribute("aria-expanded", "true");
  } else {
    closeDashMoreMenu();
  }
});
document.addEventListener("click", (e) => {
  if (!(e.target as HTMLElement).closest(".dash-more")) closeDashMoreMenu();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeDashMoreMenu();
});

document.querySelectorAll("[data-tab-target]").forEach(btn => {
  if((btn as HTMLElement).closest(".dash-nav")) return;
  btn.addEventListener("click", () => {
    const target = (btn as HTMLElement).dataset.tabTarget || "";
    if(document.querySelector(".app-shell")?.classList.contains("is-admin")){
      switchTab(target);
      document.querySelector("main")?.scrollIntoView({behavior:"smooth", block:"start"});
    }else if(target === "booking"){
      switchTab("booking");
      document.querySelector("main")?.scrollIntoView({behavior:"smooth"});
    }
  });
});

["serviceSelect","bookingTime","paymentMethod","tipSelect","customTip"].forEach(id => {
  $(id).addEventListener("input", () => {
    if(id==="serviceSelect") renderWasherOptions();
    if(id==="customTip"){
      const tipInput = $("customTip") as HTMLInputElement;
      const caretEnd = tipInput.selectionStart === tipInput.value.length;
      tipInput.value = formatMoneyInput(tipInput.value);
      if(caretEnd) tipInput.setSelectionRange(tipInput.value.length, tipInput.value.length);
    }
    $("customTipWrap").classList.toggle("hidden", ($("tipSelect") as HTMLSelectElement).value!=="custom");
    renderSummary();
  });
});

$("tipSelect")?.addEventListener("change", () => {
  const tipInput = $("customTip") as HTMLInputElement;
  if(($("tipSelect") as HTMLSelectElement).value === "custom" && !tipInput.value){
    tipInput.value = "";
    tipInput.focus();
  }
});

["newServiceRegular","newServiceLate","editServiceRegular","editServiceLate"].forEach(id => {
  $(id)?.addEventListener("input", () => {
    const el = $(id) as HTMLInputElement;
    const caretEnd = el.selectionStart === el.value.length;
    el.value = formatMoneyInput(el.value);
    if(caretEnd) el.setSelectionRange(el.value.length, el.value.length);
  });
});

document.querySelectorAll<HTMLButtonElement>("[data-duration-for]").forEach(btn => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.durationFor;
    if (target) openDurationPicker(target);
  });
});

$("durationPickerApply")?.addEventListener("click", applyDurationPicker);
$("durationPickerCancel")?.addEventListener("click", closeDurationPicker);
$("durationPickerClose")?.addEventListener("click", closeDurationPicker);
$("durationHoursBtn")?.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleDurationMenu("hours");
});
$("durationMinutesBtn")?.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleDurationMenu("minutes");
});
$("durationHoursMenu")?.addEventListener("click", (e) => {
  const opt = (e.target as HTMLElement).closest(".duration-menu-option") as HTMLElement | null;
  if (!opt) return;
  ($("durationHours") as HTMLInputElement).value = opt.dataset.value || "0";
  closeDurationMenus();
  updateDurationPreview();
});
$("durationMinutesMenu")?.addEventListener("click", (e) => {
  const opt = (e.target as HTMLElement).closest(".duration-menu-option") as HTMLElement | null;
  if (!opt) return;
  ($("durationMinutes") as HTMLInputElement).value = opt.dataset.value || "0";
  closeDurationMenus();
  updateDurationPreview();
});
$("durationPicker")?.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  if (target.id === "durationPicker") {
    closeDurationPicker();
    return;
  }
  if (!target.closest(".duration-menu")) closeDurationMenus();
});
onLangChange(() => {
  setDurationField("newServiceDuration", Number(($("newServiceDuration") as HTMLInputElement).value) || 45);
  setDurationField("editServiceDuration", Number(($("editServiceDuration") as HTMLInputElement).value) || 45);
  if (!$("durationPicker").classList.contains("hidden")) updateDurationPreview();
});
setDurationField("newServiceDuration", 45);

function showBookingSuccess(record: Reservation, fee = 0): void {
  const modal = $("bookingSuccessModal");
  const lead = $("bookingSuccessLead");
  const details = $("bookingSuccessDetails");
  const feeEl = $("bookingSuccessFee");
  if (!modal || !lead || !details || !feeEl) {
    alert(t("alert.booked", { total: money(record.total) }) + (fee ? t("alert.bookedFee") : ""));
    return;
  }

  lead.textContent = t("booking.successLead");
  details.innerHTML = `
    <div class="booking-success-row">
      <span>${t("booking.successWhen")}</span>
      <strong>${record.date} · ${record.time}</strong>
    </div>
    <div class="booking-success-row">
      <span>${t("booking.successService")}</span>
      <strong>${record.serviceName}</strong>
    </div>
    <div class="booking-success-row">
      <span>${t("booking.successVehicle")}</span>
      <strong>${vehicleTypeLabel(record.vehicleType)} · ${record.vehicleModel}</strong>
    </div>
    <div class="booking-success-row booking-success-row--total">
      <span>${t("booking.successTotal")}</span>
      <strong>${money(record.total)}</strong>
    </div>`;

  if (fee) {
    feeEl.textContent = t("booking.successFee");
    feeEl.classList.remove("hidden");
  } else {
    feeEl.textContent = "";
    feeEl.classList.add("hidden");
  }

  modal.classList.remove("hidden");
  $("bookingSuccessClose")?.focus();
}

function closeBookingSuccess(): void {
  $("bookingSuccessModal")?.classList.add("hidden");
}

$("bookingForm").addEventListener("submit", e => {
  e.preventDefault();
  const s = currentService();
  const c = calculate();
  if(!s || !c) return;
  const date = ($("bookingDate") as HTMLInputElement).value;
  const time = ($("bookingTime") as HTMLInputElement).value;
  const washer = ($("washerSelect") as HTMLSelectElement).value;

  if(!checkBusinessHours(date,time,s.duration)){
    alert(t("alert.hours"));
    return;
  }
  if(reservations.some(r=>overlaps(r,date,time,s.duration,washer))){
    alert(t("alert.overlap"));
    return;
  }

  const phone = formatPhoneDO(($("clientPhone") as HTMLInputElement).value);
  const phoneKey = phoneDigits(phone);
  const existingFee = reservations.some(r => phoneDigits(String(r.clientPhone)) === phoneKey && r.cancellationFee === 100);
  const fee = existingFee ? 100 : 0;

  const record: Reservation = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    clientName:($("clientName") as HTMLInputElement).value.trim(),
    clientPhone:phone,
    vehicleType:($("vehicleType") as HTMLSelectElement).value,
    vehicleModel:($("vehicleModel") as HTMLInputElement).value.trim(),
    vehicleYear:($("vehicleYear") as HTMLSelectElement).value,
    vehiclePlate:($("vehiclePlate") as HTMLInputElement).value.trim(),
    vehicleColor:($("vehicleColor") as HTMLInputElement).value.trim(),
    serviceId:s.id, serviceName:s.name, washer, date, time,
    paymentMethod:($("paymentMethod") as HTMLSelectElement).value,
    tip:c.tip, cardTax:c.cardTax, servicePrice:c.servicePrice,
    cancellationFee:0, total:c.total + fee, duration:s.duration,
    notes:($("bookingNotes") as HTMLTextAreaElement).value.trim(),
    status:"Reserva confirmada",
    createdAt:new Date().toISOString(),
    updatedAt:new Date().toISOString(),
  };
  reservations.push(record);

  if(existingFee){
    reservations = reservations.map(r => phoneDigits(String(r.clientPhone)) === phoneKey && r.cancellationFee===100 ? {...r,cancellationFee:0} : r);
  }

  persist(); renderAll();
  showBookingSuccess(record, fee);
  (e.target as HTMLFormElement).reset();
  ($("customTip") as HTMLInputElement).value = "";
  $("customTipWrap").classList.add("hidden");
  fillVehicleYears();
  renderServiceOptions();
});

$("bookingSuccessClose")?.addEventListener("click", closeBookingSuccess);
$("bookingSuccessModal")?.addEventListener("click", (e) => {
  if ((e.target as HTMLElement).id === "bookingSuccessModal") closeBookingSuccess();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("bookingSuccessModal")?.classList.contains("hidden")) {
    closeBookingSuccess();
  }
  if (e.key === "Escape" && !document.getElementById("washDetailModal")?.classList.contains("hidden")) {
    closeWashDetail();
  }
});

$("washDetailClose")?.addEventListener("click", closeWashDetail);
$("washDetailModal")?.addEventListener("click", (e) => {
  if ((e.target as HTMLElement).id === "washDetailModal") closeWashDetail();
});

$("serviceForm").addEventListener("submit", e => {
  e.preventDefault();
  services.push({
    id:`custom_${Date.now()}`,
    name:($("newServiceName") as HTMLInputElement).value.trim(),
    regular:parseMoneyInput(($("newServiceRegular") as HTMLInputElement).value),
    late:parseMoneyInput(($("newServiceLate") as HTMLInputElement).value),
    duration:getDurationMinutes("newServiceDuration"),
    specialist:($("newServiceSpecialist") as HTMLInputElement).checked,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  persist(); (e.target as HTMLFormElement).reset();
  setDurationField("newServiceDuration", 45);
  renderServiceOptions(); renderAdmin();
});

$("editServiceForm").addEventListener("submit", e => {
  e.preventDefault();
  const id = ($("editServiceId") as HTMLInputElement).value;
  services = services.map(s => s.id === id ? {
    ...s,
    name:($("editServiceName") as HTMLInputElement).value.trim(),
    regular:parseMoneyInput(($("editServiceRegular") as HTMLInputElement).value),
    late:parseMoneyInput(($("editServiceLate") as HTMLInputElement).value),
    duration:getDurationMinutes("editServiceDuration"),
    specialist:($("editServiceSpecialist") as HTMLInputElement).checked
  } : s);
  persist();
  closeServiceEditor();
  renderServiceOptions();
  renderAdmin();
  alert(t("alert.serviceUpdated"));
});

$("closeServiceModal").addEventListener("click", closeServiceEditor);
$("serviceEditModal").addEventListener("click", e => {
  if((e.target as HTMLElement).id === "serviceEditModal") closeServiceEditor();
});

$("vehicleEditClose")?.addEventListener("click", closeVehicleEditor);
$("vehicleEditModal")?.addEventListener("click", (e) => {
  if ((e.target as HTMLElement).id === "vehicleEditModal") closeVehicleEditor();
});
$("editVehicleClientPhone")?.addEventListener("input", () => {
  const input = $("editVehicleClientPhone") as HTMLInputElement;
  input.value = formatPhoneDO(input.value);
});
$("vehicleEditForm")?.addEventListener("submit", (e) => {
  e.preventDefault();
  const originalKey = ($("editVehicleKey") as HTMLInputElement).value;
  if (!originalKey) return;

  const next = {
    vehicleType: ($("editVehicleType") as HTMLSelectElement).value,
    vehicleModel: ($("editVehicleModel") as HTMLInputElement).value.trim(),
    vehicleYear: ($("editVehicleYear") as HTMLSelectElement).value,
    vehiclePlate: ($("editVehiclePlate") as HTMLInputElement).value.trim(),
    vehicleColor: ($("editVehicleColor") as HTMLInputElement).value.trim(),
    clientName: ($("editVehicleClientName") as HTMLInputElement).value.trim(),
    clientPhone: formatPhoneDO(($("editVehicleClientPhone") as HTMLInputElement).value),
  };

  const now = new Date().toISOString();
  reservations = reservations.map((r) => {
    if (vehicleDedupeKey(r) !== originalKey) return r;
    return { ...r, ...next, updatedAt: now };
  });

  const nextKey = vehicleDedupeKey({
    clientPhone: next.clientPhone,
    vehiclePlate: next.vehiclePlate,
    vehicleModel: next.vehicleModel,
    vehicleYear: next.vehicleYear,
  });
  persist();
  setHiddenVehicleKeys(getHiddenVehicleKeys().filter((k) => k !== originalKey && k !== nextKey));
  closeVehicleEditor();
  renderAll();
  alert(t("vehicles.updated"));
});

$("washerModalClose")?.addEventListener("click", closeWashersModal);
$("washerModal")?.addEventListener("click", (e) => {
  if ((e.target as HTMLElement).id === "washerModal") closeWashersModal();
});
$("washerFormCancelEdit")?.addEventListener("click", resetWasherForm);
$("washerForm")?.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = ($("newWasherName") as HTMLInputElement).value.trim();
  if (!name) return;
  const editId = ($("editWasherId") as HTMLInputElement).value;
  const specialist = ($("newWasherSpecialist") as HTMLInputElement).checked;
  const exists = washers.some(
    (w) => w.name.toLowerCase() === name.toLowerCase() && w.id !== editId
  );
  if (exists) {
    alert(t("washer.exists"));
    return;
  }

  if (editId) {
    washers = washers.map((w) =>
      w.id === editId
        ? { ...w, name, specialist, updatedAt: new Date().toISOString() }
        : w
    );
  } else {
    washers.push({
      id: `w_${Date.now()}`,
      name,
      specialist,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  persist();
  resetWasherForm();
  renderWashersModalList();
  renderServiceOptions();
  renderAll();
});

$("budgetExportBtn")?.addEventListener("click", exportBudgetReport);
document.querySelectorAll<HTMLButtonElement>("[data-budget-range]").forEach((btn) => {
  btn.addEventListener("click", () => {
    budgetRange = (btn.dataset.budgetRange as BudgetRange) || "30d";
    document.querySelectorAll(".budget-filter").forEach((b) => {
      b.classList.toggle("active", b === btn);
    });
    renderBudget();
  });
});
document.querySelectorAll<HTMLButtonElement>("[data-reservations-view]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const view = (btn.dataset.reservationsView as ReservationsView) || "list";
    setReservationsView(view);
  });
});

($("publicBookingLink") as HTMLInputElement).value = internalDatabase.getSetting("publicBookingLink") || "";

$("savePublicLink").addEventListener("click", () => {
  const link = ($("publicBookingLink") as HTMLInputElement).value.trim();
  if(!link){
    alert(t("alert.linkNeeded"));
    return;
  }
  try{
    new URL(link);
    internalDatabase.setSetting("publicBookingLink", link);
    alert(t("alert.linkSaved"));
  }catch{
    alert(t("alert.linkInvalid"));
  }
});

$("copyPublicLink").addEventListener("click", async () => {
  const link = ($("publicBookingLink") as HTMLInputElement).value.trim();
  if(!link){
    alert(t("alert.linkCopyNeeded"));
    return;
  }
  try{
    await navigator.clipboard.writeText(link);
    alert(t("alert.linkCopied"));
  }catch{
    ($("publicBookingLink") as HTMLInputElement).select();
    document.execCommand("copy");
    alert(t("alert.linkCopiedShort"));
  }
});

$("openPublicLink").addEventListener("click", () => {
  const link = ($("publicBookingLink") as HTMLInputElement).value.trim();
  if(!link){
    alert(t("alert.linkNeeded"));
    return;
  }
  window.open(link, "_blank", "noopener");
});

$("clearDemo").addEventListener("click", async () => {
  const ok = await confirmWarning(t("alert.clearData"), {
    title: t("confirm.clearDataTitle"),
    confirmLabel: t("confirm.continue"),
  });
  if(ok){
    reservations=[]; persist(); renderAll();
  }
});

bindConfirmDialog();

const today = new Date();
($("bookingDate") as HTMLInputElement).min = today.toISOString().split("T")[0];

let deferredPrompt: any;
window.addEventListener("beforeinstallprompt", (e: Event) => {
  e.preventDefault(); deferredPrompt = e; $("installBtn").classList.remove("hidden");
});
$("installBtn").addEventListener("click", async () => {
  if(!deferredPrompt) return;
  deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null;
  $("installBtn").classList.add("hidden");
});

if("serviceWorker" in navigator){
  const isLocal = ["localhost","127.0.0.1"].includes(location.hostname);
  if(isLocal){
    navigator.serviceWorker.getRegistrations().then(regs => {
      regs.forEach(reg => reg.unregister());
    });
    if(window.caches){
      caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
    }
  }else{
    navigator.serviceWorker.register("service-worker.js");
  }
}

fillVehicleYears();
onLangChange(() => {
  fillVehicleYears();
  renderServiceOptions();
  renderAll();
});

document.querySelectorAll("select.select-scroll").forEach(sel => {
  const el = sel as HTMLSelectElement;
  const rows = Number(el.dataset.visible) || 10;
  const collapse = () => { el.size = 1; };
  el.addEventListener("focus", () => {
    el.size = rows;
    const opt = el.options[el.selectedIndex];
    if(opt) requestAnimationFrame(() => opt.scrollIntoView({block:"nearest"}));
  });
  el.addEventListener("change", () => { collapse(); el.blur(); });
  el.addEventListener("blur", collapse);
});
}

function fillVehicleYears(){
  const sel = $("vehicleYear") as HTMLSelectElement;
  if(!sel) return;
  const max = Math.max(2035, new Date().getFullYear() + 1);
  const current = sel.value;
  let html = `<option value="">${t("booking.yearPh")}</option>`;
  for(let y = max; y >= 1980; y--){
    const selected = current ? current === String(y) : y === 2020;
    html += `<option value="${y}"${selected ? " selected" : ""}>${y}</option>`;
  }
  sel.innerHTML = html;
}
