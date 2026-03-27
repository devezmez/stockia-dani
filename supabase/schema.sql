-- ============================================================
-- STOCKIA - Script SQL completo para Supabase
-- ============================================================

-- Tabla de perfiles de usuario (extensión de auth.users)
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  nombre TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('admin', 'operador')),
  activo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de productos
CREATE TABLE public.productos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  precio NUMERIC(12,2) NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0,
  descripcion TEXT,
  activo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de movimientos de stock (log)
CREATE TABLE public.stock_movimientos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  producto_id UUID REFERENCES public.productos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'salida', 'ajuste')),
  cantidad INTEGER NOT NULL,
  motivo TEXT,
  usuario_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de clientes
CREATE TABLE public.clientes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  dni TEXT UNIQUE NOT NULL,
  telefono TEXT,
  direccion TEXT,
  activo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de ventas
CREATE TABLE public.ventas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE RESTRICT,
  fecha_venta TIMESTAMPTZ DEFAULT NOW(),
  usuario_id UUID REFERENCES auth.users(id),
  total_venta NUMERIC(12,2) DEFAULT 0,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de ítems de venta (una fila por producto vendido)
CREATE TABLE public.venta_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  venta_id UUID REFERENCES public.ventas(id) ON DELETE CASCADE,
  producto_id UUID REFERENCES public.productos(id) ON DELETE RESTRICT,
  cantidad INTEGER NOT NULL DEFAULT 1,
  precio_unitario NUMERIC(12,2) NOT NULL,
  forma_pago TEXT NOT NULL CHECK (forma_pago IN ('contado', 'semanal', 'quincenal', 'mensual')),
  cantidad_cuotas INTEGER DEFAULT 1,
  valor_cuota NUMERIC(12,2) DEFAULT 0,
  total_item NUMERIC(12,2) NOT NULL,
  deuda_restante NUMERIC(12,2) NOT NULL,
  estado TEXT DEFAULT 'activo' CHECK (estado IN ('activo', 'pagado', 'cancelado')),
  proxima_fecha_pago DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de pagos
CREATE TABLE public.pagos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  venta_item_id UUID REFERENCES public.venta_items(id) ON DELETE CASCADE,
  monto NUMERIC(12,2) NOT NULL,
  fecha_pago TIMESTAMPTZ DEFAULT NOW(),
  numero_cuota INTEGER,
  notas TEXT,
  usuario_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de configuración del sistema
CREATE TABLE public.configuracion (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- solo 1 fila
  email_resumen TEXT,
  nombre_negocio TEXT DEFAULT 'Stockia',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insertar fila de configuración por defecto
INSERT INTO public.configuracion (id) VALUES (1) ON CONFLICT DO NOTHING;

-- ============================================================
-- FUNCIONES Y TRIGGERS
-- ============================================================

-- Trigger: crear perfil automáticamente al registrar usuario
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, nombre, rol)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nombre', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'rol', 'operador')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Función: actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER productos_updated_at BEFORE UPDATE ON public.productos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER clientes_updated_at BEFORE UPDATE ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER venta_items_updated_at BEFORE UPDATE ON public.venta_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Función: registrar movimiento de stock al vender
CREATE OR REPLACE FUNCTION public.registrar_movimiento_venta()
RETURNS TRIGGER AS $$
BEGIN
  -- Descontar stock del producto
  UPDATE public.productos
  SET stock = stock - NEW.cantidad
  WHERE id = NEW.producto_id;

  -- Registrar en log
  INSERT INTO public.stock_movimientos (producto_id, tipo, cantidad, motivo, usuario_id)
  VALUES (NEW.producto_id, 'salida', NEW.cantidad, 'Venta #' || NEW.venta_id, 
    (SELECT usuario_id FROM public.ventas WHERE id = NEW.venta_id));

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_venta_item_created
  AFTER INSERT ON public.venta_items
  FOR EACH ROW EXECUTE FUNCTION public.registrar_movimiento_venta();

-- Función: actualizar deuda al registrar pago
CREATE OR REPLACE FUNCTION public.actualizar_deuda_pago()
RETURNS TRIGGER AS $$
DECLARE
  nueva_deuda NUMERIC;
BEGIN
  -- Restar el monto pagado de la deuda restante
  UPDATE public.venta_items
  SET 
    deuda_restante = GREATEST(0, deuda_restante - NEW.monto),
    estado = CASE 
      WHEN (deuda_restante - NEW.monto) <= 0 THEN 'pagado'
      ELSE 'activo'
    END,
    updated_at = NOW()
  WHERE id = NEW.venta_item_id
  RETURNING deuda_restante INTO nueva_deuda;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_pago_created
  AFTER INSERT ON public.pagos
  FOR EACH ROW EXECUTE FUNCTION public.actualizar_deuda_pago();

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venta_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracion ENABLE ROW LEVEL SECURITY;

-- Función helper para obtener rol del usuario actual
CREATE OR REPLACE FUNCTION public.get_user_rol()
RETURNS TEXT AS $$
  SELECT rol FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- POLICIES: Profiles
CREATE POLICY "Usuarios ven su propio perfil" ON public.profiles
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "Admins ven todos los perfiles" ON public.profiles
  FOR SELECT USING (get_user_rol() = 'admin');

CREATE POLICY "Admins crean perfiles" ON public.profiles
  FOR INSERT WITH CHECK (get_user_rol() = 'admin');

CREATE POLICY "Admins actualizan perfiles" ON public.profiles
  FOR UPDATE USING (get_user_rol() = 'admin');

-- POLICIES: Productos (todos los usuarios autenticados pueden ver y modificar)
CREATE POLICY "Usuarios autenticados ven productos" ON public.productos
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Usuarios autenticados crean productos" ON public.productos
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Usuarios autenticados actualizan productos" ON public.productos
  FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "Solo admins eliminan productos" ON public.productos
  FOR DELETE USING (get_user_rol() = 'admin');

-- POLICIES: Stock movimientos
CREATE POLICY "Usuarios autenticados ven movimientos" ON public.stock_movimientos
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Sistema inserta movimientos" ON public.stock_movimientos
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- POLICIES: Clientes
CREATE POLICY "Usuarios autenticados ven clientes" ON public.clientes
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Usuarios autenticados crean clientes" ON public.clientes
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Usuarios autenticados actualizan clientes" ON public.clientes
  FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "Solo admins eliminan clientes" ON public.clientes
  FOR DELETE USING (get_user_rol() = 'admin');

-- POLICIES: Ventas
CREATE POLICY "Usuarios autenticados ven ventas" ON public.ventas
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Usuarios autenticados crean ventas" ON public.ventas
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Solo admins cancelan ventas" ON public.ventas
  FOR UPDATE USING (get_user_rol() = 'admin');

-- POLICIES: Venta items
CREATE POLICY "Usuarios autenticados ven items" ON public.venta_items
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Usuarios autenticados crean items" ON public.venta_items
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Usuarios autenticados actualizan items" ON public.venta_items
  FOR UPDATE USING (auth.uid() IS NOT NULL);

-- POLICIES: Pagos
CREATE POLICY "Usuarios autenticados ven pagos" ON public.pagos
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Usuarios autenticados registran pagos" ON public.pagos
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- POLICIES: Configuración
CREATE POLICY "Admins ven configuracion" ON public.configuracion
  FOR SELECT USING (get_user_rol() = 'admin');

CREATE POLICY "Admins actualizan configuracion" ON public.configuracion
  FOR UPDATE USING (get_user_rol() = 'admin');

-- ============================================================
-- DATOS DE EJEMPLO (opcional, comentar en producción)
-- ============================================================

-- El primer admin debe crearse desde Supabase Auth Dashboard
-- o mediante la función de registro con rol admin en metadata
