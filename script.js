window.addEventListener('DOMContentLoaded', () => {
  // Nav
  gsap.from('.nav', { y: -24, opacity: 0, duration: 0.6, ease: 'power3.out' });

  // Hero en cascada
  const heroTl = gsap.timeline({ defaults: { ease: 'power3.out' } });
  heroTl
    .from('#hero-tag',   { y: -14, opacity: 0, duration: 0.55 }, '+=0.15')
    .from('#hero-title', { y: 36,  opacity: 0, duration: 0.7  }, '-=0.3')
    .from('#hero-sub',   { y: 22,  opacity: 0, duration: 0.55 }, '-=0.35')
    .from('#hero-ctas',  { y: 14,  opacity: 0, duration: 0.5  }, '-=0.3')
    .from('.hcard-1',    { y: 28, opacity: 0, duration: 0.5   }, '-=0.2')
    .from('.hcard-2',    { y: 28, opacity: 0, duration: 0.5   }, '-=0.35')
    .from('.hcard-3',    { y: 28, opacity: 0, duration: 0.5   }, '-=0.35');

  // Scroll: features, steps, stats, cta
  observeAndAnimate('.feat-card',  { y: 32, opacity: 0 });
  observeAndAnimate('.step',       { y: 24, opacity: 0 });
  observeAndAnimate('.stat-pill',  { y: 18, opacity: 0 });
  observeAndAnimate('.cta-banner h2, .cta-banner p, .cta-banner .btn-primary', { y: 18, opacity: 0 });

  // Contadores de la home al entrar en viewport
  observeCounters('.stat-pill-num');
});

/* ANIMACIONES AL HACER SCROLL */
function observeAndAnimate(selector, fromVars) {
  const els = document.querySelectorAll(selector);
  if (!els.length) return;

  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        gsap.from(entry.target, { ...fromVars, duration: 0.62, ease: 'power3.out', clearProps: 'all' });
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  els.forEach(el => io.observe(el));
}

function observeCounters(selector) {
  const els = document.querySelectorAll(selector);
  if (!els.length) return;

  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        animateSingleCounter(entry.target);
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.3 });

  els.forEach(el => io.observe(el));
}

function animateSingleCounter(el) {
  const target = parseInt(el.dataset.count, 10);
  const suffix = el.dataset.suffix || '';
  if (!target) return;
  const obj = { val: 0 };
  gsap.to(obj, {
    val: target,
    duration: 1.6,
    ease: 'power2.out',
    onUpdate() {
      const v = Math.round(obj.val);
      el.textContent = (v >= 1000 ? v.toLocaleString('es-CO') : v) + suffix;
    },
  });
}

/* MODAL DE LOGIN  */
function openLogin() {
  const overlay = document.getElementById('login-overlay');
  overlay.classList.add('active');

  gsap.fromTo('#login-modal',
    { scale: 0.9, opacity: 0, y: 20 },
    { scale: 1,   opacity: 1, y: 0, duration: 0.42, ease: 'back.out(1.5)' }
  );

  gsap.from('.modal-badge, .modal-header h2, .modal-header p', {
    y: 12, opacity: 0, stagger: 0.08, duration: 0.38, ease: 'power2.out', delay: 0.14,
  });

  gsap.from('.role-card', {
    y: 18, opacity: 0, stagger: 0.08, duration: 0.38, ease: 'power2.out', delay: 0.26,
  });
}

function closeLogin() {
  gsap.to('#login-modal', {
    scale: 0.92, opacity: 0, y: 14,
    duration: 0.28, ease: 'power2.in',
    onComplete: () => {
      document.getElementById('login-overlay').classList.remove('active');
      gsap.set('#login-modal', { clearProps: 'all' });
    }
  });
}

function closeLoginOutside(e) {
  if (e.target === document.getElementById('login-overlay')) closeLogin();
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeLogin();
});

/* SELECCIÓN DE ROL */
function selectRole(role) {
  closeLogin();

  setTimeout(() => {
    document.getElementById('home-page').classList.remove('active');
    document.getElementById('app-shell').classList.add('active');

    document.querySelectorAll('.sidebar').forEach(s => s.classList.remove('active'));
    document.getElementById('sidebar-' + role).classList.add('active');

    const labels = { cliente: 'Cliente', dueno: 'Dueño', admin: 'Administrador' };
    document.getElementById('role-badge').textContent = labels[role];

    const defaultScreen = {
      cliente: 'cliente-restaurantes',
      dueno:   'dueno-registrar',
      admin:   'admin-stats',
    };
    showScreen(defaultScreen[role]);

    const firstBtn = document.querySelector('#sidebar-' + role + ' button');
    if (firstBtn) firstBtn.classList.add('active-nav');

    gsap.from('.topbar', { y: -18, opacity: 0, duration: 0.42, ease: 'power3.out' });
    gsap.from('.sidebar.active button', { x: -14, opacity: 0, stagger: 0.06, duration: 0.38, ease: 'power2.out', delay: 0.12 });

  }, 320);
}

/* PANTALLAS */
function showScreen(id) {
  document.querySelectorAll('.content-screen').forEach(s => s.classList.remove('active'));
  const screen = document.getElementById(id);
  screen.classList.add('active');

  // Contadores animados
  screen.querySelectorAll('[data-count]').forEach(el => {
    const target = parseInt(el.dataset.count, 10);
    const prefix = el.dataset.prefix || '';
    const obj = { val: 0 };
    gsap.to(obj, {
      val: target,
      duration: 1.3,
      ease: 'power2.out',
      onUpdate() {
        const v = Math.round(obj.val);
        el.textContent = prefix + (v >= 1000 ? v.toLocaleString('es-CO') : v);
      },
    });
  });

  // Cards con stagger
  const cards = screen.querySelectorAll('.restaurant-card, .stat-card');
  if (cards.length) {
    gsap.from(cards, { y: 24, opacity: 0, duration: 0.48, stagger: 0.09, ease: 'power3.out', clearProps: 'all' });
  }
}

/* SIDEBAR */
function setActiveNav(btn) {
  btn.closest('.sidebar').querySelectorAll('button').forEach(b => b.classList.remove('active-nav'));
  btn.classList.add('active-nav');
}

/* BOTON VOLVER AL HOME */
function backToHome() {
  gsap.to('#app-shell', {
    opacity: 0, duration: 0.28, ease: 'power2.in',
    onComplete: () => {
      document.getElementById('app-shell').classList.remove('active');
      document.getElementById('home-page').classList.add('active');
      gsap.set('#app-shell', { opacity: 1 });

      gsap.from('#hero-tag, #hero-title, #hero-sub, #hero-ctas', {
        y: 18, opacity: 0, stagger: 0.07, duration: 0.45, ease: 'power3.out',
      });
    }
  });
}

/*RESERVAR MESA  */
function reservarMesa(btn, numero) {
  gsap.to(btn, {
    scale: 0.82, duration: 0.1, yoyo: true, repeat: 1, ease: 'power2.inOut',
    onComplete: () => {
      btn.classList.remove('disponible');
      btn.classList.add('ocupada');
      btn.disabled = true;

      gsap.fromTo(btn,
        { boxShadow: '0 0 0 0 rgba(242,200,208,0.7)' },
        { boxShadow: '0 0 0 22px rgba(242,200,208,0)', duration: 0.6, ease: 'power2.out' }
      );

      showToast('<i class="fa-solid fa-circle-check"></i> Mesa ' + numero + ' reservada con éxito');
    }
  });
}

/*AGREGAR MESA */
function agregarMesa() {
  const grid = document.getElementById('dueno-floor-grid');
  const num  = grid.querySelectorAll('.mesa').length + 1;
  const btn  = document.createElement('button');
  btn.className   = 'mesa disponible';
  btn.textContent = num;
  grid.appendChild(btn);
  gsap.from(btn, { scale: 0, opacity: 0, duration: 0.38, ease: 'back.out(1.8)' });
}

/* CANCELAR RESERVA */
function cancelarReserva(btn) {
  const row = btn.closest('tr');
  gsap.to(row, {
    opacity: 0, x: 16, duration: 0.32, ease: 'power2.in',
    onComplete: () => row.remove(),
  });
}

/* GUARDAR RESTAURANTE */
function guardarRestaurante(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  const orig = btn.innerHTML;
  btn.innerHTML = '<i class="fa-solid fa-check"></i> Guardado';
  btn.style.background = 'linear-gradient(135deg, #6db88a, #4a9a6a)';
  gsap.from(btn, { scale: 0.92, duration: 0.28, ease: 'back.out(1.7)' });
  setTimeout(() => { btn.innerHTML = orig; btn.style.background = ''; }, 2200);
}

/* TOAST-NOTIFICACION DE EXITO */
function showToast(msg) {
  const existing = document.getElementById('toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'toast';
  toast.innerHTML = msg;
  Object.assign(toast.style, {
    position:       'fixed',
    bottom:         '32px',
    right:          '32px',
    background:     'rgba(141,161,82,0.15)',
    backdropFilter: 'blur(20px)',
    border:         '1px solid rgba(141,161,82,0.3)',
    color:          '#a8bc6a',
    padding:        '14px 22px',
    borderRadius:   '12px',
    fontFamily:     "'DM Sans', sans-serif",
    fontWeight:     '600',
    fontSize:       '0.9rem',
    zIndex:         '9999',
    pointerEvents:  'none',
    boxShadow:      '0 8px 32px rgba(0,0,0,0.3)',
  });
  document.body.appendChild(toast);

  gsap.fromTo(toast,
    { y: 16, opacity: 0 },
    { y: 0,  opacity: 1, duration: 0.38, ease: 'power3.out' }
  );

  setTimeout(() => {
    gsap.to(toast, {
      y: 8, opacity: 0, duration: 0.3, ease: 'power2.in',
      onComplete: () => toast.remove(),
    });
  }, 3000);
}