// ============================================================
// STOCKIA - Configuración global y utilidades
// ============================================================

// ⚠️ REEMPLAZA ESTOS VALORES CON TUS CREDENCIALES DE SUPABASE
const SUPABASE_URL = 'https://stockia-dani.pages.dev/login';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhcWF1Y2VmZXlyeGN5ZWhycmVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NzI5OTUsImV4cCI6MjA5MDE0ODk5NX0.AhX_emKBhnBabdRBP4Rn0g4ubxYl3pxuk9Rf-tiM03g';

// Inicializar cliente Supabase
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// AUTH - Verificar sesión y rol
// ============================================================
async function verificarSesion(rolRequerido = null) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    window.location.href = '/login.html';
    return null;
  }

  const { data: perfil } = await sb.from('profiles').select('*').eq('id', session.user.id).single();

  if (!perfil || !perfil.activo) {
    await sb.auth.signOut();
    window.location.href = '/login.html';
    return null;
  }

  if (rolRequerido && perfil.rol !== rolRequerido) {
    mostrarAlerta('No tenés permisos para acceder a esta sección.', 'error');
    setTimeout(() => window.location.href = '/dashboard.html', 2000);
    return null;
  }

  return { session, perfil };
}

async function cerrarSesion() {
  await sb.auth.signOut();
  window.location.href = '/login.html';
}

// ============================================================
// UI - Alertas y notificaciones
// ============================================================
function mostrarAlerta(mensaje, tipo = 'info', duracion = 4000) {
  const alerta = document.createElement('div');
  alerta.className = `alerta alerta-${tipo}`;
  alerta.innerHTML = `
    <span class="alerta-icono">${tipo === 'exito' ? '✓' : tipo === 'error' ? '✗' : 'ℹ'}</span>
    <span>${mensaje}</span>
  `;
  document.body.appendChild(alerta);
  requestAnimationFrame(() => alerta.classList.add('visible'));
  setTimeout(() => {
    alerta.classList.remove('visible');
    setTimeout(() => alerta.remove(), 300);
  }, duracion);
}

function mostrarCargando(elemento, texto = 'Cargando...') {
  elemento.innerHTML = `<div class="cargando"><div class="spinner"></div><span>${texto}</span></div>`;
}

// ============================================================
// FORMATO - Utilidades de formato
// ============================================================
function formatoPeso(numero) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(numero || 0);
}

function formatoFecha(fecha) {
  if (!fecha) return '-';
  return new Date(fecha).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatoFechaHora(fecha) {
  if (!fecha) return '-';
  return new Date(fecha).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ============================================================
// MODAL - Sistema de modales
// ============================================================
function abrirModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.add('activo');
    document.body.style.overflow = 'hidden';
  }
}

function cerrarModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.remove('activo');
    document.body.style.overflow = '';
  }
}

// Cerrar modal al hacer click fuera
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('activo');
    document.body.style.overflow = '';
  }
});

// ============================================================
// NAV - Marcar pestaña activa
// ============================================================
function marcarNavActivo() {
  const pagina = window.location.pathname.split('/').pop();
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.remove('activo');
    if (link.getAttribute('href') === pagina) {
      link.classList.add('activo');
    }
  });
}
