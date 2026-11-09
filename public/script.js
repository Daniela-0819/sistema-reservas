/* ANIMACIONES DEL HOME */
window.addEventListener("DOMContentLoaded", () => {
  // Contadores de la home al entrar en viewport
  observeCounters(".stat-pill-num");

  // Todo lo de abajo sí necesita GSAP; si no cargó, la página funciona igual
  if (typeof gsap === "undefined") return;

  // Nav
  gsap.from(".nav", {
    y: -24,
    opacity: 0,
    duration: 0.6,
    ease: "power3.out",
    clearProps: "transform,opacity",
  });

  // Hero en cascada
  const heroTl = gsap.timeline({ defaults: { ease: "power3.out" } });
  heroTl
    .from(".hero-tag", { y: -14, opacity: 0, duration: 0.55 }, "+=0.15")
    .from(".hero-title", { y: 36, opacity: 0, duration: 0.7 }, "-=0.3")
    .from(".hero-sub", { y: 22, opacity: 0, duration: 0.55 }, "-=0.35")
    .from(".hero-ctas", { y: 14, opacity: 0, duration: 0.5 }, "-=0.3")
    .from(".hcard-1", { opacity: 0, duration: 0.5 }, "-=0.2")
    .from(".hcard-2", { opacity: 0, duration: 0.5 }, "-=0.35")
    .from(".hcard-2", { opacity: 0, duration: 0.5 }, "-=0.35")
    .from(".hcard-3", { opacity: 0, duration: 0.5 }, "-=0.35");

  // Scroll: features, steps, stats, cta
  observeAndAnimate(".feat-card", { y: 32, opacity: 0 });
  observeAndAnimate(".step", { y: 24, opacity: 0 });
  observeAndAnimate(".stat-pill", { y: 18, opacity: 0 });
  observeAndAnimate(".cta-banner h2, .cta-banner p, .cta-banner .btn-primary", {
    y: 18,
    opacity: 0,
  });
});

/* ANIMACIONES AL HACER SCROLL */
function observeAndAnimate(selector, fromVars) {
  const els = document.querySelectorAll(selector);
  if (!els.length) return;
  gsap.set(els, fromVars); // estado inicial oculto: evita el parpadeo
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        gsap.to(entry.target, {
          y: 0,
          opacity: 1,
          duration: 0.62,
          ease: "power3.out",
          clearProps: "transform,opacity",
        });
        io.unobserve(entry.target);
      });
    },
    { threshold: 0.12 },
  );
  els.forEach((el) => io.observe(el));
}

/* CONTADORES AL HACER SCROLL */
function observeCounters(selector) {
  const els = document.querySelectorAll(selector);
  if (!els.length) return;
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        const meta = Number(el.dataset.count),
          suf = el.dataset.suffix || "";
        const t0 = performance.now(),
          dur = 1400;
        const paso = (t) => {
          const p = Math.min((t - t0) / dur, 1);
          el.textContent =
            Math.round(meta * (1 - Math.pow(1 - p, 2))).toLocaleString(
              "es-CO",
            ) + suf;
          if (p < 1) requestAnimationFrame(paso);
        };
        requestAnimationFrame(paso);
        io.unobserve(el);
      });
    },
    { threshold: 0.4 },
  );
  els.forEach((el) => io.observe(el));
}

/* ESTADO Y UTILIDADES */
const API = "/api";
const SESSION_KEY = "savoria_session";
const ROL_LABEL = {
  cliente: "Cliente",
  dueno: "Dueño",
  admin: "Administrador",
};
const DEFAULT_SCREEN = {
  cliente: "cliente-restaurantes",
  dueno: "dueno-restaurante",
  admin: "admin-inicio",
};
const NAV_PARENT = { "cliente-mesas": "cliente-restaurantes" };

let session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
let selectedRole = null;
let authMode = "login";
let restauranteActual = null; // restaurante que el cliente está viendo
let mesaElegida = null;
let mesasCombo = []; // mesas contiguas elegidas para combinar: [{ id, num, cap }]

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const money = (n) => "$ " + Number(n).toLocaleString("es-CO");
const fechaHora = (s) => {
  const [d, t] = s.split("T");
  const [y, m, dd] = d.split("-");
  return `${dd}/${m}/${y} · ${t}`;
};
const hoy = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Authorization: "Bearer " + session.token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && session) {
    logout(true);
    throw new Error(data.error || "Tu sesión expiró. Inicia sesión de nuevo.");
  }
  if (!res.ok) throw new Error(data.error || "Ocurrió un error inesperado");
  return data;
}

/* TOAST-NOTIFICACION */
function showToast(msg, tipo = "ok") {
  $("toast")?.remove();
  const t = document.createElement("div");
  t.id = "toast";
  t.className = "toast " + tipo;
  t.innerHTML = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

/* SESIÓN AL CARGAR LA PÁGINA */
window.addEventListener("DOMContentLoaded", async () => {
  $("res-fecha").min = hoy();
  renderNav();
  if (session) {
    try {
      await api("/auth/me");
    } catch {
      /* api() ya cerró la sesión si el token no sirve */
    }
  }
});

/* NAV: INICIAR SESIÓN / MI PANEL */
function renderNav() {
  $("btn-login").classList.toggle("hidden", !!session);
  $("nav-session").classList.toggle("hidden", !session);
}

/* MODAL DE LOGIN */
function openAuth() {
  if (session) return enterApp();
  $("login-overlay").classList.add("active");
  backToRoles();
}
function closeModal() {
  $("login-overlay").classList.remove("active");
}
function closeModalOutside(e) {
  if (e.target === $("login-overlay")) closeModal();
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

function backToRoles() {
  $("pane-roles").classList.remove("hidden");
  $("pane-auth").classList.add("hidden");
}

/* SELECCIÓN DE ROL */
// Paso 1: el usuario elige el perfil; recién ahí aparecen "Iniciar sesión" y "Registrarme"
function selectRole(role) {
  selectedRole = role;
  $("pane-roles").classList.add("hidden");
  $("pane-auth").classList.remove("hidden");
  $("auth-badge").innerHTML = '<span class="tag-dot"></span>' + ROL_LABEL[role];
  // El Admin Total no se registra: su cuenta la crea el equipo (npm run crear-admin)
  $("auth-tabs").classList.toggle("hidden", role === "admin");
  $("auth-form").reset();
  setAuthMode("login");
}

/* INICIAR SESIÓN / REGISTRARSE */
function setAuthMode(mode) {
  authMode = mode;
  const registro = mode === "register";
  $("tab-login").classList.toggle("active", !registro);
  $("tab-register").classList.toggle("active", registro);
  $("field-nombre").classList.toggle("hidden", !registro);
  $("auth-title").textContent = registro ? "Crear cuenta" : "Iniciar sesión";
  $("auth-submit").textContent = registro ? "Crear cuenta" : "Iniciar sesión";
  $("auth-pass").autocomplete = registro ? "new-password" : "current-password";
  $("auth-error").textContent = "";
}

async function submitAuth(e) {
  e.preventDefault();
  const err = $("auth-error");
  const email = $("auth-email").value.trim();
  const password = $("auth-pass").value;
  const nombre = $("auth-nombre").value.trim();
  err.textContent = "";
  if (authMode === "register" && nombre.length < 2)
    return (err.textContent = "Escribe tu nombre.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return (err.textContent = "Escribe un correo válido.");
  if (password.length < 6)
    return (err.textContent = "La contraseña debe tener mínimo 6 caracteres.");

  const btn = $("auth-submit");
  btn.disabled = true;
  try {
    const body = {
      email,
      password,
      rol: selectedRole,
      ...(authMode === "register" ? { nombre } : {}),
    };
    const data = await api("/auth/" + authMode, { method: "POST", body });
    session = data;
    localStorage.setItem(SESSION_KEY, JSON.stringify(session)); // sesión persistente
    closeModal();
    renderNav();
    enterApp();
    showToast(
      authMode === "register"
        ? '<i class="fa-solid fa-circle-check"></i> Cuenta creada'
        : '<i class="fa-solid fa-circle-check"></i> Bienvenido, ' +
            esc(data.user.nombre),
    );
  } catch (ex) {
    err.textContent = ex.message;
  } finally {
    btn.disabled = false;
  }
}

/* ENTRAR A LA APP */
function enterApp() {
  if (!session) return openAuth();
  const rol = session.user.rol;
  $("home-page").classList.remove("active");
  $("app-shell").classList.add("active");
  document
    .querySelectorAll(".sidebar")
    .forEach((s) => s.classList.remove("active"));
  $("sidebar-" + rol).classList.add("active");
  $("role-badge").textContent = ROL_LABEL[rol];
  $("user-name").textContent = session.user.nombre;
  navTo(DEFAULT_SCREEN[rol]);
}

/* BOTON VOLVER AL HOME */
function goHome(e) {
  e?.preventDefault();
  $("app-shell").classList.remove("active");
  $("home-page").classList.add("active");
  renderNav();
  window.scrollTo(0, 0);
}

/* CERRAR SESIÓN */
function logout(expirada = false) {
  session = null;
  localStorage.removeItem(SESSION_KEY);
  $("app-shell").classList.remove("active");
  $("home-page").classList.add("active");
  renderNav();
  window.scrollTo(0, 0);
  showToast(
    expirada
      ? "Tu sesión expiró. Inicia sesión de nuevo."
      : '<i class="fa-solid fa-circle-check"></i> Sesión cerrada',
    expirada ? "error" : "ok",
  );
}

/* PANTALLAS Y SIDEBAR */
const LOADERS = {
  "cliente-restaurantes": cargarRestaurantes,
  "cliente-reservas": cargarMisReservas,
  "dueno-restaurante": cargarMiRestaurante,
  "dueno-mesas": cargarMesasDueno,
  "dueno-reservas": cargarReservasDueno,
  "cliente-stats": cargarStatsGenerales,
  "dueno-stats": cargarStatsDueno,
  "admin-inicio": cargarPanelAdmin,
  "admin-balances": cargarBalancesAdmin,
};

function navTo(id) {
  document
    .querySelectorAll(".content-screen")
    .forEach((s) => s.classList.remove("active"));
  $(id).classList.add("active");
  const activo = NAV_PARENT[id] || id;
  document
    .querySelectorAll(".sidebar.active button")
    .forEach((b) =>
      b.classList.toggle("active-nav", b.dataset.screen === activo),
    );
  LOADERS[id]?.();
}

/* "Mesa 4" o "Mesas 4, 5" (reservas con mesas contiguas combinadas) */
const etiquetaMesa = (m) => (String(m).includes(",") ? "Mesas " : "Mesa ") + m;

/* ESTADO DE LA RESERVA (ACTIVA / CANCELADA) */
function estadoBadge(r) {
  return r.estado === "activa"
    ? '<span class="estado activa">Activa</span>'
    : `<span class="estado cancelada" title="${esc(r.motivo_cancelacion || "")}">Cancelada</span>`;
}

/* CLIENTE: RESTAURANTES (HU02, HU03) */
async function cargarRestaurantes() {
  const cont = $("lista-restaurantes");
  cont.innerHTML = '<p class="info-line">Cargando restaurantes…</p>';
  try {
    const lista = await api("/restaurantes");
    if (!lista.length) {
      cont.innerHTML =
        '<p class="info-line">Todavía no hay restaurantes registrados.</p>';
      return;
    }
    cont.innerHTML = lista
      .map(
        (r) => `
      <article class="restaurant-card">
        <div class="rcard-cover"><i class="fa-solid fa-utensils"></i></div>
        <div class="rcard-body">
          <h3>${esc(r.nombre)}</h3>
          <p class="muted"><i class="fa-solid fa-location-dot"></i> ${esc(r.ubicacion)}</p>
          ${r.descripcion ? `<p class="muted">${esc(r.descripcion)}</p>` : ""}
          <p class="price">${money(r.valor_reserva)} / reserva</p>
          <p class="muted"><i class="fa-regular fa-clock"></i> ${r.duracion_min} min · ${r.total_mesas} mesas</p>
          <button class="btn-primary sm" onclick="abrirMesas(${r.id})">Ver mesas <i class="fa-solid fa-arrow-right"></i></button>
        </div>
      </article>`,
      )
      .join("");
  } catch (ex) {
    cont.innerHTML = `<p class="form-error">${esc(ex.message)}</p>`;
  }
}

/* CLIENTE: MESAS (HU04, HU05) */
function abrirMesas(id) {
  restauranteActual = id;
  if (!$("res-fecha").value) $("res-fecha").value = hoy();
  if (!$("res-hora").value) $("res-hora").value = "19:00";
  navTo("cliente-mesas");
  cargarMesas();
}

/* MESAS CONTIGUAS QUE SUMAN LA CAPACIDAD NECESARIA
   Devuelve los ids de las mesas libres que forman al menos un grupo de 2 a 4 mesas
   con números consecutivos, cuya capacidad sumada alcanza para `personas` y sin
   mesas de sobra (si quitas la primera o la última, ya no alcanza). */
function mesasQueSuman(mesas, personas, maxMesas = 4) {
  const orden = [...mesas].sort((a, b) => a.numero - b.numero);
  const ids = new Set();
  for (let i = 0; i < orden.length; i++) {
    let suma = 0;
    for (let j = i; j < orden.length && j - i < maxMesas; j++) {
      if (!orden[j].disponible) break;
      if (j > i && orden[j].numero !== orden[j - 1].numero + 1) break;
      suma += orden[j].capacidad;
      const n = j - i + 1;
      if (n < 2 || suma < personas || personas < n) continue;
      const sinPrimera = suma - orden[i].capacidad;
      const sinUltima = suma - orden[j].capacidad;
      if (sinPrimera >= personas || sinUltima >= personas) continue; // sobra una mesa
      for (let k = i; k <= j; k++) ids.add(orden[k].id);
    }
  }
  return ids;
}

async function cargarMesas() {
  if (!restauranteActual) return;
  mesaElegida = null;
  mesasCombo = [];
  $("resumen").classList.add("hidden");
  const fecha = $("res-fecha").value,
    hora = $("res-hora").value;
  const grid = $("mesas-grid");
  if (!fecha || !hora) {
    grid.innerHTML = "";
    $("mesas-info").textContent =
      "Elige fecha y hora para ver las mesas libres.";
    return;
  }
  const personas = Number($("res-personas").value) || 1;
  try {
    const { restaurante: r, mesas } = await api(
      `/restaurantes/${restauranteActual}/mesas?inicio=${fecha}T${hora}`,
    );
    $("mesas-titulo").textContent = r.nombre;
    $("mesas-info").innerHTML =
      `Valor de la reserva: <strong>${money(r.valor_reserva)}</strong> · Duración: ${r.duracion_min} min. En SAVORIA no se procesa ningún pago.`;
    if (!mesas.length) {
      grid.innerHTML =
        '<p class="info-line">Este restaurante aún no tiene mesas registradas.</p>';
      return;
    }
    const combinar = $("res-combinar").checked;
    const suman = combinar ? mesasQueSuman(mesas, personas) : null;
    if (combinar && !suman.size) {
      $("mesas-info").innerHTML +=
        `<br><span class="form-error">No hay mesas contiguas libres que sumen ${personas} personas en ese horario.</span>`;
    } else if (combinar) {
      $("mesas-info").innerHTML +=
        `<br>Se habilitaron las mesas contiguas que juntas alcanzan para ${personas} personas. Elige las que quieras combinar.`;
    }
    grid.innerHTML = mesas
      .map((m) => {
        const cabe = combinar ? suman.has(m.id) : m.capacidad >= personas;
        const libre = m.disponible && cabe;
        const motivo = !m.disponible
          ? "Ocupada en ese horario"
          : !cabe
            ? combinar
              ? "No forma un grupo contiguo que alcance para tu grupo"
              : "No alcanza para tu grupo"
            : `Reservar mesa ${m.numero}`;
        return `<button class="mesa ${libre ? "disponible" : "ocupada"}" ${libre ? "" : "disabled"} title="${motivo}"
                data-id="${m.id}" data-num="${m.numero}" data-cap="${m.capacidad}">
                ${m.numero}<small><i class="fa-solid fa-user"></i> ${m.capacidad}</small></button>`;
      })
      .join("");
    grid
      .querySelectorAll(".mesa.disponible")
      .forEach((b) =>
        b.addEventListener("click", () =>
          $("res-combinar").checked ? elegirMesaCombo(b, r) : elegirMesa(b, r),
        ),
      );
  } catch (ex) {
    showToast(esc(ex.message), "error");
  }
}

/* CLIENTE: RESERVAR MESA */
function elegirMesa(btn, r) {
  document
    .querySelectorAll("#mesas-grid .mesa")
    .forEach((b) => b.classList.remove("sel"));
  btn.classList.add("sel");
  $("btn-confirmar").disabled = false;
  mesaElegida = Number(btn.dataset.id);
  const personas = $("res-personas").value;
  $("resumen-texto").innerHTML =
    `Mesa <strong>${btn.dataset.num}</strong> (hasta ${btn.dataset.cap} personas) en <strong>${esc(r.nombre)}</strong><br>` +
    `${fechaHora($("res-fecha").value + "T" + $("res-hora").value)} · ${personas} persona(s) · valor de la reserva ${money(r.valor_reserva)}`;
  $("resumen").classList.remove("hidden");
}

/* CLIENTE: COMBINAR MESAS CONTIGUAS */
function elegirMesaCombo(btn, r) {
  const id = Number(btn.dataset.id);
  const i = mesasCombo.findIndex((m) => m.id === id);
  if (i >= 0) mesasCombo.splice(i, 1);
  else
    mesasCombo.push({
      id,
      num: Number(btn.dataset.num),
      cap: Number(btn.dataset.cap),
    });
  mesasCombo.sort((a, b) => a.num - b.num);
  document
    .querySelectorAll("#mesas-grid .mesa")
    .forEach((b) =>
      b.classList.toggle(
        "sel",
        mesasCombo.some((m) => m.id === Number(b.dataset.id)),
      ),
    );
  mesaElegida = mesasCombo.length === 1 ? mesasCombo[0].id : null;

  const resumen = $("resumen");
  if (!mesasCombo.length) return resumen.classList.add("hidden");
  const personas = Number($("res-personas").value) || 1;
  const cap = mesasCombo.reduce((a, m) => a + m.cap, 0);
  const contiguas = mesasCombo.every(
    (m, k) => k === 0 || m.num === mesasCombo[k - 1].num + 1,
  );
  const nums = mesasCombo.map((m) => m.num).join(", ");
  let aviso = "";
  if (!contiguas) aviso = "Las mesas deben ser contiguas (números consecutivos).";
  else if (mesasCombo.length > 4) aviso = "Puedes combinar máximo 4 mesas.";
  else if (cap < personas) aviso = `Capacidad insuficiente: ${cap} de ${personas} personas.`;
  else if (personas < mesasCombo.length) aviso = "Necesitas al menos una persona por mesa.";

  $("resumen-texto").innerHTML =
    `Mesa${mesasCombo.length > 1 ? "s" : ""} <strong>${nums}</strong> (hasta ${cap} personas) en <strong>${esc(r.nombre)}</strong><br>` +
    `${fechaHora($("res-fecha").value + "T" + $("res-hora").value)} · ${personas} persona(s) · valor de la reserva ${money(r.valor_reserva)}` +
    (aviso ? `<br><span class="form-error">${aviso}</span>` : "");
  $("btn-confirmar").disabled = !!aviso;
  resumen.classList.remove("hidden");
}

async function confirmarReserva() {
  const combinando = mesasCombo.length > 1;
  if (!mesaElegida && !combinando) return;
  const btn = $("btn-confirmar");
  btn.disabled = true;
  try {
    await api("/reservas", {
      method: "POST",
      body: {
        ...(combinando
          ? { mesa_ids: mesasCombo.map((m) => m.id) }
          : { mesa_id: mesaElegida }),
        inicio: `${$("res-fecha").value}T${$("res-hora").value}`,
        personas: Number($("res-personas").value),
      },
    });
    showToast('<i class="fa-solid fa-circle-check"></i> Reserva confirmada');
    navTo("cliente-reservas");
  } catch (ex) {
    showToast(esc(ex.message), "error");
    cargarMesas(); // por si alguien tomó la mesa justo antes
  } finally {
    btn.disabled = false;
  }
}

/* CLIENTE: MIS RESERVAS (HU06) */
async function cargarMisReservas() {
  const tb = $("tabla-mis-reservas");
  tb.innerHTML = '<tr><td colspan="5">Cargando…</td></tr>';
  try {
    const lista = await api("/reservas/mias");
    tb.innerHTML = lista.length
      ? lista
          .map(
            (r) => `
      <tr>
        <td>${esc(r.restaurante)}</td><td>${etiquetaMesa(r.mesa)}</td><td>${fechaHora(r.inicio)}</td><td>${r.personas}</td>
        <td>${estadoBadge(r)}${r.estado === "cancelada" ? `<div class="muted">${esc(r.motivo_cancelacion || "")}</div>` : ""}</td>
      </tr>`,
          )
          .join("")
      : '<tr><td colspan="5">Aún no tienes reservas. Elige un restaurante para empezar.</td></tr>';
  } catch (ex) {
    tb.innerHTML = `<tr><td colspan="5" class="form-error">${esc(ex.message)}</td></tr>`;
  }
}

/* DUEÑO: RESTAURANTE (HU08, HU09, HU11) */
let miRestaurante = null;

async function cargarMiRestaurante() {
  try {
    const { restaurante: r } = await api("/mi-restaurante");
    miRestaurante = r;
    $("rest-aviso").textContent = r
      ? ""
      : "Aún no has registrado tu restaurante. Complétalo para que los clientes puedan verlo.";
    $("rest-nombre").value = r?.nombre || "";
    $("rest-ubicacion").value = r?.ubicacion || "";
    $("rest-descripcion").value = r?.descripcion || "";
    $("rest-precio").value = r ? Number(r.valor_reserva) : "";
    $("rest-duracion").value = r?.duracion_min || 90;
    $("rest-error").textContent = "";
  } catch (ex) {
    showToast(esc(ex.message), "error");
  }
}

/* GUARDAR RESTAURANTE */
async function guardarRestaurante(e) {
  e.preventDefault();
  const err = $("rest-error");
  err.textContent = "";
  try {
    const { restaurante } = await api("/mi-restaurante", {
      method: "PUT",
      body: {
        nombre: $("rest-nombre").value,
        ubicacion: $("rest-ubicacion").value,
        descripcion: $("rest-descripcion").value,
        valor_reserva:
          $("rest-precio").value === "" ? NaN : Number($("rest-precio").value),
        duracion_min: Number($("rest-duracion").value),
      },
    });
    miRestaurante = restaurante;
    $("rest-aviso").textContent = "";
    showToast('<i class="fa-solid fa-circle-check"></i> Restaurante guardado');
  } catch (ex) {
    err.textContent = ex.message;
  }
}

/* DUEÑO: MESAS (HU10) */
async function cargarMesasDueno() {
  const grid = $("dueno-floor-grid");
  try {
    const { restaurante, mesas } = await api("/mi-restaurante");
    $("mesas-dueno-aviso").textContent = restaurante
      ? ""
      : 'Primero registra tu restaurante en "Mi restaurante".';
    grid.innerHTML = mesas
      .map(
        (m) =>
          `<button class="mesa disponible" type="button" title="Mesa ${m.numero}">${m.numero}<small><i class="fa-solid fa-user"></i> ${m.capacidad}</small></button>`,
      )
      .join("");
  } catch (ex) {
    showToast(esc(ex.message), "error");
  }
}

/* AGREGAR MESA */
async function agregarMesa() {
  try {
    const m = await api("/mi-restaurante/mesas", {
      method: "POST",
      body: { capacidad: Number($("nueva-capacidad").value) },
    });
    showToast(
      `<i class="fa-solid fa-circle-check"></i> Mesa ${m.numero} agregada`,
    );
    cargarMesasDueno();
  } catch (ex) {
    showToast(esc(ex.message), "error");
  }
}

/* DUEÑO: RESERVAS (HU12, HU13) */
async function cargarReservasDueno() {
  const tb = $("tabla-reservas-dueno");
  tb.innerHTML = '<tr><td colspan="6">Cargando…</td></tr>';
  try {
    const lista = await api("/mi-restaurante/reservas");
    tb.innerHTML = lista.length
      ? lista
          .map(
            (r) => `
      <tr>
        <td>${esc(r.cliente)}</td><td>${etiquetaMesa(r.mesa)}</td><td>${fechaHora(r.inicio)}</td><td>${r.personas}</td>
        <td>${estadoBadge(r)}</td>
        <td>${
          r.estado === "activa"
            ? `<button class="btn-danger" onclick="cancelarReserva(${r.id})"><i class="fa-solid fa-ban"></i> Cancelar</button>`
            : "—"
        }</td>
      </tr>`,
          )
          .join("")
      : '<tr><td colspan="6">Todavía no hay reservas en tu restaurante.</td></tr>';
  } catch (ex) {
    tb.innerHTML = `<tr><td colspan="6" class="form-error">${esc(ex.message)}</td></tr>`;
  }
}

/* CANCELAR RESERVA */
// HU13: el dueño cancela cualquier reserva de su restaurante; la mesa queda libre al instante
async function cancelarReserva(id) {
  const motivo = prompt(
    'Motivo de la cancelación (el cliente lo verá en "Mis reservas"):',
    "Cancelada por el restaurante",
  );
  if (motivo === null) return;
  try {
    await api(`/reservas/${id}/cancelar`, {
      method: "PATCH",
      body: { motivo },
    });
    showToast(
      '<i class="fa-solid fa-circle-check"></i> Reserva cancelada. La mesa quedó libre.',
    );
    cargarReservasDueno();
  } catch (ex) {
    showToast(esc(ex.message), "error");
  }
}

/* GRÁFICAS DE BARRAS SIMPLES (sin librerías) */
function barras(cont, filas, vacio) {
  const max = Math.max(1, ...filas.map((f) => f.valor));
  cont.innerHTML = filas.length
    ? filas
        .map(
          (f) => `
      <div class="bar-row${f.pico ? " pico" : ""}">
        <span class="bar-label">${esc(f.etiqueta)}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${Math.round((100 * f.valor) / max)}%"></span></span>
        <span class="bar-val">${esc(f.texto ?? f.valor)}</span>
      </div>`,
        )
        .join("")
    : `<p class="info-line">${vacio}</p>`;
}

const horaTxt = (h) => String(h).padStart(2, "0") + ":00";
const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const statCard = (icono, valor, etiqueta) => `
  <div class="stat-card">
    <span class="stat-icon"><i class="fa-solid ${icono}"></i></span>
    <span class="stat-num">${esc(valor)}</span>
    <span class="stat-label">${esc(etiqueta)}</span>
  </div>`;

/* CLIENTE: ESTADÍSTICAS GENERALES (HU07) */
async function cargarStatsGenerales() {
  try {
    const d = await api("/estadisticas/generales");
    barras(
      $("stats-ranking"),
      d.restaurantes_mas_reservados.map((r) => ({
        etiqueta: r.restaurante,
        valor: r.reservas,
        texto: `${r.reservas} reservas · ${r.ocupacion_pct}% ocupación`,
      })),
      "Aún no hay reservas para comparar.",
    );
    const tope = Math.max(0, ...d.horarios_mas_demandados.map((h) => h.reservas));
    barras(
      $("stats-horas"),
      d.horarios_mas_demandados.map((h) => ({
        etiqueta: horaTxt(h.hora),
        valor: h.reservas,
        pico: h.reservas === tope && tope > 0,
      })),
      "Aún no hay reservas para comparar.",
    );
  } catch (ex) {
    showToast(esc(ex.message), "error");
  }
}

/* DUEÑO: ESTADÍSTICAS DE MI RESTAURANTE (HU14) */
async function cargarStatsDueno() {
  try {
    const d = await api("/mi-restaurante/estadisticas");
    if (!d.restaurante) {
      $("dstats-aviso").textContent = 'Primero registra tu restaurante en "Mi restaurante".';
      $("dstats-cards").innerHTML = "";
      barras($("dstats-horas"), [], "Sin datos todavía.");
      barras($("dstats-dias"), [], "Sin datos todavía.");
      return;
    }
    $("dstats-aviso").textContent = "";
    $("dstats-cards").innerHTML =
      statCard("fa-calendar-check", d.reservas_activas, "Reservas activas") +
      statCard("fa-ban", d.reservas_canceladas, "Reservas canceladas") +
      statCard("fa-users", d.personas, "Personas esperadas") +
      statCard("fa-chair", `${d.ocupacion_pct}%`, "Aprovechamiento de las mesas reservadas") +
      statCard("fa-door-open", `${d.mesas_reservadas_hoy}/${d.total_mesas}`, "Mesas reservadas hoy");
    const tope = Math.max(0, ...d.por_hora.map((h) => h.reservas));
    barras(
      $("dstats-horas"),
      d.por_hora.map((h) => ({ etiqueta: horaTxt(h.hora), valor: h.reservas, pico: h.reservas === tope && tope > 0 })),
      "Aún no tienes reservas.",
    );
    barras(
      $("dstats-dias"),
      d.por_dia.map((x) => ({ etiqueta: DIAS[x.dia], valor: x.reservas })),
      "Aún no tienes reservas.",
    );
  } catch (ex) {
    showToast(esc(ex.message), "error");
  }
}

/* ADMIN: PANEL GENERAL (HU16) */
async function cargarPanelAdmin() {
  try {
    const d = await api("/admin/resumen");
    $("admin-cards").innerHTML =
      statCard("fa-store", d.restaurantes_activos, "Restaurantes activos") +
      statCard("fa-users", d.clientes_registrados, "Clientes registrados") +
      statCard("fa-calendar-check", d.reservas_activas, "Reservas activas") +
      statCard("fa-ban", d.reservas_canceladas, "Reservas canceladas");
  } catch (ex) {
    showToast(esc(ex.message), "error");
  }
}

/* ADMIN: BALANCES POR RESTAURANTE (HU15) */
async function cargarBalancesAdmin() {
  const tb = $("tabla-balances");
  tb.innerHTML = '<tr><td colspan="7">Cargando…</td></tr>';
  try {
    const lista = await api("/admin/balances");
    tb.innerHTML = lista.length
      ? lista
          .map(
            (b) => `
      <tr>
        <td>${esc(b.restaurante)}</td><td>${b.mesas}</td><td>${b.reservas_activas}</td>
        <td>${b.reservas_canceladas}</td><td>${b.personas}</td><td>${b.ocupacion_pct}%</td>
        <td>${money(b.valor_reservas_activas)}</td>
      </tr>`,
          )
          .join("")
      : '<tr><td colspan="7">Todavía no hay restaurantes registrados.</td></tr>';
  } catch (ex) {
    tb.innerHTML = `<tr><td colspan="7" class="form-error">${esc(ex.message)}</td></tr>`;
  }
}