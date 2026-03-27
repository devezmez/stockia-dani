// ============================================================
// STOCKIA - Edge Function: crear-usuario
// Archivo: supabase/functions/crear-usuario/index.ts
//
// Deploy: supabase functions deploy crear-usuario
//
// Esta función usa service_role para crear usuarios en Auth
// desde el panel de admin sin exponer la service_role key
// en el frontend.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Verificar que quien llama es un admin autenticado
    //    usando su token JWT (anon key del frontend)
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Cliente con el JWT del usuario que hace la petición
    const supabaseCliente = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    // Verificar sesión y rol
    const { data: { user }, error: authError } = await supabaseCliente.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Sesión inválida' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data: perfil } = await supabaseCliente
      .from('profiles')
      .select('rol')
      .eq('id', user.id)
      .single()

    if (!perfil || perfil.rol !== 'admin') {
      return new Response(JSON.stringify({ error: 'Solo los administradores pueden crear usuarios' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 2. Leer el body con los datos del nuevo usuario
    const { nombre, email, password, rol } = await req.json()

    if (!nombre || !email || !password || !rol) {
      return new Response(JSON.stringify({ error: 'Faltan campos obligatorios' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (!['admin', 'operador'].includes(rol)) {
      return new Response(JSON.stringify({ error: 'Rol inválido' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (password.length < 8) {
      return new Response(JSON.stringify({ error: 'La contraseña debe tener al menos 8 caracteres' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 3. Crear el usuario usando service_role (admin API)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: nuevoUsuario, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // confirmado automáticamente, sin email de verificación
      user_metadata: { nombre, rol }
    })

    if (createError) {
      // Mensajes de error amigables
      let mensaje = 'Error al crear el usuario'
      if (createError.message.includes('already registered') || createError.message.includes('already been registered')) {
        mensaje = 'Ya existe un usuario con ese email'
      } else if (createError.message.includes('invalid email')) {
        mensaje = 'El email ingresado no es válido'
      }
      return new Response(JSON.stringify({ error: mensaje }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 4. El trigger on_auth_user_created crea el perfil automáticamente.
    //    Pero por las dudas, lo actualizamos directamente para asegurar nombre y rol.
    await supabaseAdmin
      .from('profiles')
      .update({ nombre, rol })
      .eq('id', nuevoUsuario.user.id)

    return new Response(JSON.stringify({
      ok: true,
      mensaje: `Usuario "${nombre}" creado correctamente`,
      usuario_id: nuevoUsuario.user.id
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('Error en crear-usuario:', err)
    return new Response(JSON.stringify({ error: 'Error interno del servidor' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
