
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

const WASHERS = [
  {name:"José Ángel Blanco", specialist:false},
  {name:"Eskarlin Martínez", specialist:true},
  {name:"Jhovanny Flete", specialist:false},
  {name:"Erison Sánchez", specialist:true},
  {name:"Javiel Gutiérrez", specialist:true},
  {name:"José Antonio Pérez", specialist:false},
  {name:"Héctor Jorge Guzmán", specialist:false},
  {name:"Miguel Ángel Abreu", specialist:false}
];

let services = JSON.parse(localStorage.getItem("rr_services") || "null") || DEFAULT_SERVICES;
let reservations = JSON.parse(localStorage.getItem("rr_reservations") || "[]");

const $ = (id) => document.getElementById(id);
const money = n => new Intl.NumberFormat("es-DO",{style:"currency",currency:"DOP",maximumFractionDigits:0}).format(n);

function persist(){
  localStorage.setItem("rr_services", JSON.stringify(services));
  localStorage.setItem("rr_reservations", JSON.stringify(reservations));
}

function isLate(time){
  if(!time) return false;
  const [h] = time.split(":").map(Number);
  return h >= 18;
}

function selectedTip(){
  const v = $("tipSelect").value;
  return v === "custom" ? Number($("customTip").value || 0) : Number(v);
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

function renderSummary(){
  const c = calculate();
  if(!c){ $("summary").innerHTML = ""; return; }
  $("summary").innerHTML = `
    <strong>Resumen de pago</strong>
    <div class="summary-grid">
      <div class="summary-row"><span>Servicio</span><strong>${money(c.servicePrice)}</strong></div>
      <div class="summary-row"><span>Propina</span><strong>${money(c.tip)}</strong></div>
      ${c.cardTax ? `<div class="summary-row"><span>18% tarjeta</span><strong>${money(c.cardTax)}</strong></div>` : ""}
    </div>
    <div class="summary-total"><span>Total</span><strong>${money(c.total)}</strong></div>
    <div class="summary-meta">Duración estimada: ${c.duration >= 1440 ? "24 horas" : `${c.duration} minutos`}</div>
  `;
}

function renderServiceOptions(){
  $("serviceSelect").innerHTML = services.map(s => `<option value="${s.id}">${s.name}</option>`).join("");
  renderWasherOptions();
  renderSummary();
}

function renderWasherOptions(){
  const s = currentService();
  const eligible = WASHERS.filter(w => !s?.specialist || w.specialist);
  $("washerSelect").innerHTML =
    `<option value="" disabled selected>Elije Lavador</option>` +
    `<option value="Aleatorio +">Aleatorio +</option>` +
    eligible.map(w => `<option value="${w.name}">${w.name}${w.specialist ? " · Brillador" : ""}</option>`).join("");
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

function renderReservations(){
  const root = $("reservationsList");
  if(!reservations.length){
    root.innerHTML = `
      <div class="empty-state">
        <strong>Sin reservas todavía</strong>
        <p>Cuando confirmes una cita, aparecerá aquí con su estado.</p>
      </div>`;
    return;
  }
  root.innerHTML = reservations
    .slice().sort((a,b)=>`${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`))
    .map(r => `
      <article class="item">
        <div class="item-top">
          <div>
            <h4>${r.clientName}</h4>
            <div class="item-service">${r.serviceName}</div>
          </div>
          <span class="badge ${statusBadgeClass(r.status)}">${r.status}</span>
        </div>
        <div class="item-meta">
          <div>${r.date} · ${r.time}</div>
          <div>${r.vehicleType} · ${r.vehicleModel} · ${r.vehiclePlate || "Sin placa"}</div>
          <div>Lavador: ${r.washer}</div>
          <div>Pago: ${r.paymentMethod} · Total: ${money(r.total)}</div>
        </div>
        <div class="actions">
          <button type="button" onclick="updateStatus('${r.id}','En lavado')">En lavado</button>
          <button type="button" onclick="updateStatus('${r.id}','Listo para entregar')">Listo</button>
          <button type="button" class="danger" onclick="cancelReservation('${r.id}')">Cancelar</button>
        </div>
      </article>`).join("");
}

function renderVehicles(){
  const map = new Map();
  reservations.forEach(r => {
    const key = `${r.clientPhone}-${r.vehiclePlate || r.vehicleModel}`;
    map.set(key, r);
  });
  $("vehiclesList").innerHTML = map.size ? [...map.values()].map(r => `
    <article class="item">
      <div class="item-top">
        <h4>${r.vehicleModel}</h4>
        <span class="badge">${r.vehicleType}</span>
      </div>
      <div class="item-meta">
        <div>${r.vehicleYear || "Año no indicado"} · ${r.vehicleColor || "Color no indicado"}</div>
        <div>Placa: ${r.vehiclePlate || "Sin placa"}</div>
        <div>Cliente: ${r.clientName} · ${r.clientPhone}</div>
      </div>
    </article>`).join("") : `
      <div class="empty-state" style="grid-column:1/-1">
        <strong>No hay vehículos registrados</strong>
        <p>Los vehículos se guardan automáticamente con cada reserva.</p>
      </div>`;
}

function renderAdmin(){
  const revenue = reservations.filter(r=>r.status!=="Cancelado").reduce((a,r)=>a+r.total,0);
  const tips = reservations.filter(r=>r.status!=="Cancelado").reduce((a,r)=>a+r.tip,0);
  $("stats").innerHTML = `
    <div class="stat"><span>Reservas</span><strong>${reservations.length}</strong></div>
    <div class="stat"><span>Ingresos</span><strong>${money(revenue)}</strong></div>
    <div class="stat"><span>Propinas</span><strong>${money(tips)}</strong></div>
    <div class="stat"><span>Lavadores</span><strong>${WASHERS.length}</strong></div>`;
  $("servicesAdminList").innerHTML = services.map(s => `
    <article class="item">
      <div class="item-top">
        <h4>${s.name}</h4>
        ${s.specialist ? `<span class="badge badge-listo">Brillador</span>` : ""}
      </div>
      <div class="item-meta">
        <div>Regular: ${money(s.regular)}</div>
        <div>Después de 6 p. m.: ${money(s.late)}</div>
        <div>Duración: ${s.duration >= 1440 ? "24 horas" : `${s.duration} min`}</div>
      </div>
      <div class="actions">
        <button type="button" onclick="openServiceEditor('${s.id}')">Editar</button>
        <button type="button" class="danger" onclick="deleteService('${s.id}')">Eliminar</button>
      </div>
    </article>`).join("");
}

window.updateStatus = (id,status) => {
  reservations = reservations.map(r => r.id===id ? {...r,status} : r);
  persist(); renderAll();
};

window.cancelReservation = (id) => {
  reservations = reservations.map(r => r.id===id ? {...r,status:"Cancelado", cancellationFee:100} : r);
  persist(); renderAll();
  alert("Reserva cancelada. Se registró una penalidad de RD$100 para la próxima reserva.");
};


window.openServiceEditor = (id) => {
  const s = services.find(item => item.id === id);
  if(!s) return;
  $("editServiceId").value = s.id;
  $("editServiceName").value = s.name;
  $("editServiceRegular").value = s.regular;
  $("editServiceLate").value = s.late;
  $("editServiceDuration").value = s.duration;
  $("editServiceSpecialist").checked = s.specialist;
  $("serviceEditModal").classList.remove("hidden");
};

window.deleteService = (id) => {
  const s = services.find(item => item.id === id);
  if(!s) return;
  if(reservations.some(r => r.serviceId === id)){
    alert("Este servicio ya aparece en reservas. Puedes editarlo, pero no eliminarlo.");
    return;
  }
  if(confirm(`¿Eliminar el servicio "${s.name}"?`)){
    services = services.filter(item => item.id !== id);
    persist();
    renderServiceOptions();
    renderAdmin();
  }
};

function closeServiceEditor(){
  $("serviceEditModal").classList.add("hidden");
}

function renderAll(){
  renderReservations();
  renderVehicles();
  renderAdmin();
}


function switchTab(target){
  if(!target || !$(target)) return;
  document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
  $(target).classList.add("active");
  document.querySelectorAll(".dash-nav button").forEach(b => {
    b.classList.toggle("active", b.dataset.tabTarget === target);
  });
}

document.querySelectorAll("[data-tab-target]").forEach(btn => {
  btn.addEventListener("click", () => {
    switchTab(btn.dataset.tabTarget);
    document.querySelector("main").scrollIntoView({behavior:"smooth"});
  });
});

["serviceSelect","bookingTime","paymentMethod","tipSelect","customTip"].forEach(id => {
  $(id).addEventListener("input", () => {
    if(id==="serviceSelect") renderWasherOptions();
    $("customTipWrap").classList.toggle("hidden", $("tipSelect").value!=="custom");
    renderSummary();
  });
});

$("bookingForm").addEventListener("submit", e => {
  e.preventDefault();
  const s = currentService();
  const c = calculate();
  const date = $("bookingDate").value;
  const time = $("bookingTime").value;
  const washer = $("washerSelect").value;

  if(!checkBusinessHours(date,time,s.duration)){
    alert("El horario seleccionado no permite completar el servicio antes del cierre.");
    return;
  }
  if(reservations.some(r=>overlaps(r,date,time,s.duration,washer))){
    alert("Ese lavador ya tiene una reserva que coincide con ese horario.");
    return;
  }

  const existingFee = reservations.some(r => r.clientPhone === $("clientPhone").value && r.cancellationFee === 100);
  const fee = existingFee ? 100 : 0;

  const record = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    clientName:$("clientName").value.trim(),
    clientPhone:$("clientPhone").value.trim(),
    vehicleType:$("vehicleType").value,
    vehicleModel:$("vehicleModel").value.trim(),
    vehicleYear:$("vehicleYear").value,
    vehiclePlate:$("vehiclePlate").value.trim(),
    vehicleColor:$("vehicleColor").value.trim(),
    serviceId:s.id, serviceName:s.name, washer, date, time,
    paymentMethod:$("paymentMethod").value,
    tip:c.tip, cardTax:c.cardTax, servicePrice:c.servicePrice,
    cancellationFee:0, total:c.total + fee, duration:s.duration,
    notes:$("bookingNotes").value.trim(),
    status:"Reserva confirmada", createdAt:new Date().toISOString()
  };
  reservations.push(record);

  if(existingFee){
    reservations = reservations.map(r => r.clientPhone === record.clientPhone && r.cancellationFee===100 ? {...r,cancellationFee:0} : r);
  }

  persist(); renderAll();
  alert(`Reserva confirmada. Total: ${money(record.total)}${fee ? " (incluye penalidad de RD$100)" : ""}`);
  e.target.reset();
  $("customTipWrap").classList.add("hidden");
  renderServiceOptions();
});

$("serviceForm").addEventListener("submit", e => {
  e.preventDefault();
  services.push({
    id:`custom_${Date.now()}`,
    name:$("newServiceName").value.trim(),
    regular:Number($("newServiceRegular").value),
    late:Number($("newServiceLate").value),
    duration:Number($("newServiceDuration").value),
    specialist:$("newServiceSpecialist").checked
  });
  persist(); e.target.reset(); renderServiceOptions(); renderAdmin();
});


$("editServiceForm").addEventListener("submit", e => {
  e.preventDefault();
  const id = $("editServiceId").value;
  services = services.map(s => s.id === id ? {
    ...s,
    name:$("editServiceName").value.trim(),
    regular:Number($("editServiceRegular").value),
    late:Number($("editServiceLate").value),
    duration:Number($("editServiceDuration").value),
    specialist:$("editServiceSpecialist").checked
  } : s);
  persist();
  closeServiceEditor();
  renderServiceOptions();
  renderAdmin();
  alert("Servicio actualizado correctamente.");
});

$("closeServiceModal").addEventListener("click", closeServiceEditor);
$("serviceEditModal").addEventListener("click", e => {
  if(e.target.id === "serviceEditModal") closeServiceEditor();
});

$("publicBookingLink").value = localStorage.getItem("rr_public_link") || "";

$("savePublicLink").addEventListener("click", () => {
  const link = $("publicBookingLink").value.trim();
  if(!link){
    alert("Escribe primero el enlace público.");
    return;
  }
  try{
    new URL(link);
    localStorage.setItem("rr_public_link", link);
    alert("Enlace guardado.");
  }catch{
    alert("Escribe un enlace válido que comience con http:// o https://");
  }
});

$("copyPublicLink").addEventListener("click", async () => {
  const link = $("publicBookingLink").value.trim();
  if(!link){
    alert("Escribe o guarda primero el enlace público.");
    return;
  }
  try{
    await navigator.clipboard.writeText(link);
    alert("Enlace copiado. Ya puedes pegarlo en WhatsApp.");
  }catch{
    $("publicBookingLink").select();
    document.execCommand("copy");
    alert("Enlace copiado.");
  }
});

$("openPublicLink").addEventListener("click", () => {
  const link = $("publicBookingLink").value.trim();
  if(!link){
    alert("Escribe primero el enlace público.");
    return;
  }
  window.open(link, "_blank", "noopener");
});

$("clearDemo").addEventListener("click", () => {
  if(confirm("¿Borrar todas las reservas guardadas en este dispositivo?")){
    reservations=[]; persist(); renderAll();
  }
});

const today = new Date();
$("bookingDate").min = today.toISOString().split("T")[0];

let deferredPrompt;
window.addEventListener("beforeinstallprompt", e => {
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
    // Dev: never cache — always show latest files from live-server
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

renderServiceOptions();
renderAll();

(function fillVehicleYears(){
  const sel = $("vehicleYear");
  if(!sel) return;
  const max = Math.max(2035, new Date().getFullYear() + 1);
  let html = `<option value="">Elije año</option>`;
  for(let y = max; y >= 1980; y--){
    html += `<option value="${y}"${y === 2020 ? " selected" : ""}>${y}</option>`;
  }
  sel.innerHTML = html;
})();

document.querySelectorAll("select.select-scroll").forEach(sel => {
  const rows = Number(sel.dataset.visible) || 10;
  const collapse = () => { sel.size = 1; };
  sel.addEventListener("focus", () => {
    sel.size = rows;
    const opt = sel.options[sel.selectedIndex];
    if(opt) requestAnimationFrame(() => opt.scrollIntoView({block:"nearest"}));
  });
  sel.addEventListener("change", () => { collapse(); sel.blur(); });
  sel.addEventListener("blur", collapse);
});
