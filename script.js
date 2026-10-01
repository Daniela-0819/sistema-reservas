function selectRole(role) {
  document.getElementById('landing').classList.remove('active');
  document.getElementById('app-shell').classList.add('active');

  document.querySelectorAll('.sidebar').forEach(s => s.classList.remove('active'));
  document.getElementById('sidebar-' + role).classList.add('active');

  const labels = { cliente: 'Cliente', dueno: 'Dueño', admin: 'Administrador' };
  document.getElementById('role-badge').textContent = labels[role];

  const defaultScreen = {
    cliente: 'cliente-restaurantes',
    dueno: 'dueno-registrar',
    admin: 'admin-stats'
  };
  showScreen(defaultScreen[role]);
}

function showScreen(id) {
  document.querySelectorAll('.content-screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function backToRoles() {
  document.getElementById('app-shell').classList.remove('active');
  document.getElementById('landing').classList.add('active');
}