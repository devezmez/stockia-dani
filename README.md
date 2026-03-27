# 📦 Stockia — Tu inventario, bajo control.

Sistema SaaS de gestión de inventario, clientes y ventas con cuotas.

## 🗂️ Estructura del proyecto

```
stockia/
├── login.html          — Pantalla de inicio de sesión
├── dashboard.html      — Panel principal con estadísticas
├── productos.html      — Gestión de productos y stock
├── clientes.html       — Gestión de clientes
├── ventas.html         — Registro de ventas y pagos
├── admin.html          — Panel de administración (solo admin)
├── css/
│   └── global.css      — Estilos compartidos
├── js/
│   └── global.js       — Utilidades y config de Supabase
├── img/
│   └── logo.svg        — Logo vectorial
└── supabase/
    ├── schema.sql       — Script completo de base de datos
    └── functions/
        └── resumen-semanal/
            └── index.ts — Edge Function (email semanal)
```

---

## 🚀 Guía de instalación

### 1. Crear proyecto en Supabase

1. Ir a [supabase.com](https://supabase.com) → Nuevo proyecto
2. Anotar:
   - **Project URL**: `https://XXXXX.supabase.co`
   - **Anon Key**: en Settings > API

### 2. Ejecutar el schema SQL

1. Ir a **SQL Editor** en Supabase
2. Pegar el contenido de `supabase/schema.sql`
3. Ejecutar ▶️

### 3. Configurar credenciales

Editar `js/global.js` y reemplazar:

```javascript
const SUPABASE_URL = 'https://TU_PROYECTO.supabase.co';
const SUPABASE_ANON_KEY = 'TU_ANON_KEY';
```

También hacer lo mismo en `login.html` (tiene su propio snippet de Supabase).

### 4. Crear el primer usuario Admin

Opción A — Desde Supabase Dashboard:
1. Ir a **Authentication > Users > Invite user**
2. Creá el usuario con email y contraseña
3. Luego en **SQL Editor** ejecutar:
```sql
UPDATE public.profiles 
SET rol = 'admin', nombre = 'Tu Nombre'
WHERE email = 'tu@email.com';
```

Opción B — Desde SQL:
```sql
-- Esto requiere que el usuario ya exista en auth.users
UPDATE public.profiles SET rol = 'admin' WHERE email = 'admin@tunegocio.com';
```

### 5. Subir a GitHub + Cloudflare Pages

```bash
git init
git add .
git commit -m "Stockia v1.0 inicial"
git remote add origin https://github.com/TU_USUARIO/stockia.git
git push -u origin main
```

En **Cloudflare Pages**:
1. Nuevo proyecto → Conectar con GitHub
2. Seleccionar repo `stockia`
3. Build settings: sin build command, output dir: `/` (raíz)
4. Deploy 🚀

---

## 📧 Configurar envío de emails semanales

### Instalar Supabase CLI

```bash
npm install -g supabase
supabase login
supabase link --project-ref TU_PROJECT_REF
```

### Registrarse en Resend

1. Ir a [resend.com](https://resend.com) (plan gratuito: 3.000 emails/mes)
2. Crear API Key
3. Verificar tu dominio (o usar el dominio de prueba)

### Deploy de la Edge Function

```bash
supabase functions deploy resumen-semanal
```

### Configurar variables de entorno

En Supabase Dashboard > Settings > Edge Functions > Secrets:

```
RESEND_API_KEY=re_xxxxxxxxxxxx
EMAIL_DOMAIN=tunegocio.com
```

### Programar el cron

En Supabase Dashboard > Database > Extensions, habilitar `pg_cron`.

Luego en SQL Editor:

```sql
-- Ejecutar todos los lunes a las 8 AM (UTC-3 = 11 AM UTC)
SELECT cron.schedule(
  'resumen-semanal',
  '0 11 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://TU_PROYECTO.supabase.co/functions/v1/resumen-semanal',
    headers := '{"Authorization": "Bearer TU_ANON_KEY"}'::jsonb
  );
  $$
);
```

---

## 🔐 Seguridad implementada

- ✅ RLS (Row Level Security) en todas las tablas
- ✅ RBAC: Admin vs Operador con políticas distintas
- ✅ Validación de sesión en cada página
- ✅ Verificación de usuario activo/inactivo
- ✅ Usuarios inactivos son bloqueados al login
- ✅ Solo admins pueden eliminar datos y acceder al panel admin

## 💡 Tecnologías

| Capa | Tecnología |
|------|-----------|
| Frontend | HTML + CSS + JavaScript puro |
| Backend / DB | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Hosting | Cloudflare Pages |
| Emails | Supabase Edge Functions + Resend |
| Fuente | Inter (Google Fonts) |

---

## 📱 Responsive

El sistema está optimizado para:
- 📱 Móvil (360px+)
- 📟 Tablet (768px+)
- 💻 Desktop (1024px+)
- 🖥️ Pantallas grandes (1400px+)

Diseño pensado para usuarios mayores: texto grande, botones amplios, navegación clara.
