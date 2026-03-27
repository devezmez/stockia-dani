// ============================================================
// STOCKIA - Edge Function: Resumen semanal por email
// Archivo: supabase/functions/resumen-semanal/index.ts
//
// Deploy: supabase functions deploy resumen-semanal
// Programar en Supabase Dashboard > Edge Functions > Cron:
//   0 8 * * 1   (todos los lunes a las 8 AM)
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
    // Cliente con service_role para acceso total
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Obtener email de configuración
    const { data: config } = await supabase
      .from('configuracion')
      .select('email_resumen, nombre_negocio')
      .single()

    if (!config?.email_resumen) {
      return new Response(JSON.stringify({ error: 'No hay email configurado.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const nombreNegocio = config.nombre_negocio || 'Stockia'

    // ---- Recopilar datos ----
    const ahora = new Date()
    const haceUnaSemana = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000)

    // Productos con stock bajo
    const { data: productosStockBajo } = await supabase
      .from('productos')
      .select('nombre, stock, precio')
      .eq('activo', true)
      .lt('stock', 5)
      .order('stock')

    // Todos los productos activos
    const { data: todosProductos } = await supabase
      .from('productos')
      .select('stock')
      .eq('activo', true)

    const stockTotal = todosProductos?.reduce((a, p) => a + (p.stock || 0), 0) || 0

    // Ventas de la semana
    const { data: ventasSemana } = await supabase
      .from('ventas')
      .select('total_venta')
      .gte('created_at', haceUnaSemana.toISOString())

    const totalVentasSemana = ventasSemana?.reduce((a, v) => a + Number(v.total_venta || 0), 0) || 0
    const cantidadVentasSemana = ventasSemana?.length || 0

    // Deudas activas
    const { data: deudasActivas } = await supabase
      .from('venta_items')
      .select('deuda_restante, proxima_fecha_pago, productos(nombre), ventas(clientes(nombre))')
      .eq('estado', 'activo')
      .gt('deuda_restante', 0)
      .order('proxima_fecha_pago')

    const deudaTotal = deudasActivas?.reduce((a, d) => a + Number(d.deuda_restante || 0), 0) || 0

    // Cobros vencidos (próxima fecha menor a hoy)
    const cobrosVencidos = deudasActivas?.filter(d =>
      d.proxima_fecha_pago && new Date(d.proxima_fecha_pago) < ahora
    ) || []

    // ---- Construir HTML del email ----
    const formatoPeso = (n: number) =>
      new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)

    const formatoFecha = (f: string) =>
      new Date(f).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })

    const emailHTML = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: Arial, sans-serif; background: #F3F4F6; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { background: #1F3A8A; color: white; padding: 28px 32px; }
    .header h1 { margin: 0; font-size: 24px; }
    .header p { margin: 6px 0 0; opacity: 0.8; font-size: 14px; }
    .content { padding: 28px 32px; }
    .stat-row { display: flex; gap: 12px; margin-bottom: 20px; }
    .stat-box { flex: 1; background: #F3F4F6; border-radius: 8px; padding: 16px; text-align: center; }
    .stat-value { font-size: 24px; font-weight: 800; color: #1F3A8A; }
    .stat-label { font-size: 12px; color: #6B7280; margin-top: 4px; }
    .section-title { font-size: 16px; font-weight: 700; color: #111827; margin: 24px 0 12px; padding-bottom: 8px; border-bottom: 2px solid #E5E7EB; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th { background: #F9FAFB; padding: 10px 12px; text-align: left; color: #6B7280; font-size: 12px; text-transform: uppercase; }
    td { padding: 10px 12px; border-bottom: 1px solid #F3F4F6; }
    .alerta { background: #FEF2F2; border: 1px solid #FECACA; border-radius: 8px; padding: 12px 16px; font-size: 14px; color: #DC2626; }
    .footer { background: #F9FAFB; padding: 16px 32px; text-align: center; font-size: 12px; color: #9CA3AF; }
    .verde { color: #059669; font-weight: 700; }
    .rojo { color: #DC2626; font-weight: 700; }
  </style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>📦 Stockia — Resumen Semanal</h1>
    <p>${nombreNegocio} · Semana del ${formatoFecha(haceUnaSemana.toISOString())} al ${formatoFecha(ahora.toISOString())}</p>
  </div>

  <div class="content">

    <div class="stat-row">
      <div class="stat-box">
        <div class="stat-value">${cantidadVentasSemana}</div>
        <div class="stat-label">Ventas esta semana</div>
      </div>
      <div class="stat-box">
        <div class="stat-value">${formatoPeso(totalVentasSemana)}</div>
        <div class="stat-label">Total facturado</div>
      </div>
      <div class="stat-box">
        <div class="stat-value rojo">${formatoPeso(deudaTotal)}</div>
        <div class="stat-label">Deuda total</div>
      </div>
    </div>

    <div style="font-size:15px;padding:12px 0">📦 <strong>Stock total:</strong> ${stockTotal.toLocaleString('es-AR')} unidades en inventario</div>

    ${cobrosVencidos.length > 0 ? `
    <div class="alerta">
      ⚠️ <strong>${cobrosVencidos.length} cobro${cobrosVencidos.length > 1 ? 's' : ''} vencido${cobrosVencidos.length > 1 ? 's' : ''}</strong> sin registrar pago.
    </div>
    ` : ''}

    ${productosStockBajo && productosStockBajo.length > 0 ? `
    <div class="section-title">⚡ Productos con stock bajo</div>
    <table>
      <thead><tr><th>Producto</th><th>Stock</th><th>Precio</th></tr></thead>
      <tbody>
        ${productosStockBajo.map(p => `
          <tr>
            <td>${p.nombre}</td>
            <td class="${p.stock === 0 ? 'rojo' : 'rojo'}">${p.stock === 0 ? '❌ Sin stock' : `⚡ ${p.stock}`}</td>
            <td>${formatoPeso(p.precio)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    ` : '<div class="section-title">✅ Stock sin alertas</div><p style="color:#059669;font-size:14px">Todos los productos tienen stock suficiente.</p>'}

    ${deudasActivas && deudasActivas.length > 0 ? `
    <div class="section-title">💳 Deudas activas (top 10)</div>
    <table>
      <thead><tr><th>Cliente</th><th>Producto</th><th>Deuda</th><th>Próximo pago</th></tr></thead>
      <tbody>
        ${deudasActivas.slice(0, 10).map(d => `
          <tr>
            <td><strong>${d.ventas?.clientes?.nombre || '-'}</strong></td>
            <td>${d.productos?.nombre || '-'}</td>
            <td class="rojo">${formatoPeso(d.deuda_restante)}</td>
            <td class="${d.proxima_fecha_pago && new Date(d.proxima_fecha_pago) < ahora ? 'rojo' : ''}">
              ${d.proxima_fecha_pago ? formatoFecha(d.proxima_fecha_pago) : '-'}
              ${d.proxima_fecha_pago && new Date(d.proxima_fecha_pago) < ahora ? ' ⚠️ VENCIDO' : ''}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    ` : ''}

  </div>

  <div class="footer">
    Este resumen fue generado automáticamente por Stockia · ${new Date().toLocaleString('es-AR')}
  </div>
</div>
</body>
</html>
    `

    // ---- Enviar email con Resend ----
    // Necesitás: https://resend.com (plan gratuito disponible)
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

    if (!RESEND_API_KEY) {
      console.log('RESEND_API_KEY no configurada. Email HTML generado pero no enviado.')
      return new Response(JSON.stringify({
        ok: true,
        mensaje: 'Resumen generado. Configurá RESEND_API_KEY para envío automático.',
        preview_html: emailHTML
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: `Stockia <resumen@${Deno.env.get('EMAIL_DOMAIN') || 'stockia.app'}>`,
        to: [config.email_resumen],
        subject: `📦 Stockia — Resumen semanal ${new Date().toLocaleDateString('es-AR')}`,
        html: emailHTML
      })
    })

    const emailData = await emailResponse.json()

    if (!emailResponse.ok) {
      throw new Error(`Error Resend: ${JSON.stringify(emailData)}`)
    }

    return new Response(JSON.stringify({
      ok: true,
      mensaje: `Resumen enviado a ${config.email_resumen}`,
      resend_id: emailData.id
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error en resumen-semanal:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
