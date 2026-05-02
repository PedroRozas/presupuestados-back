---
trigger: always_on
---

## 1. Directivas Principales

- **Cero Procedimientos Almacenados:** Queda estrictamente prohibido el uso de `supabase.rpc()`. Toda la lógica de negocio existente en funciones de PL/pgSQL debe ser traducida a métodos puros de TypeScript [1].
- **Capa de Aplicación:** La lógica de negocio reside EXCLUSIVAMENTE en los `Services` de NestJS. Los `Controllers` solo deben manejar la validación de la petición (DTOs) y el enrutamiento.
- **Consultas Secuenciales:** Dado que no usaremos RPCs, las transacciones complejas deben implementarse de manera secuencial en NestJS, asegurando la consistencia de los datos (por ejemplo, validar si existe un registro antes de hacer un `INSERT` o un `UPDATE`) [1].

## 2. Stack Tecnológico y Patrones

- **TypeScript Estricto:** Uso obligatorio de tipos de datos, interfaces y DTOs para todas las transacciones de base de datos. Se debe activar `strict: true` en `tsconfig.json`.
- **Inyección de Dependencias (DI):** Aprovechar el sistema de DI de NestJS. Crear un módulo específico para Supabase (`SupabaseService`) que se inyecte en los demás servicios.
- **Supabase Client:** Utilizar `@supabase/supabase-js` exclusivamente con métodos del query builder (`.select()`, `.insert()`, `.update()`, `.delete()`).

## 3. Reglas Críticas de Negocio y Modelado de Datos

- **Asignación de Gastos (REGLA DE ORO):** Al insertar o modificar registros en la tabla `expenses`, los campos **`paid_by`** y **`assigned_user_id`** DEBEN ser referenciados con el `id` (UUID) proveniente de la tabla **`family_members`** [2].
- **Prohibición de ID Auth:** NUNCA se debe usar el `id` de autenticación de Supabase (el que reside en `profiles` o `auth.uid()`) para las columnas financieras `paid_by` y `assigned_user_id` de la tabla `expenses` [2]. El ID de auth (`owner_id`) solo sirve para auditoría o como FK secundaria [2, 3].
- **Estructura Relacional:**
  - `profiles` contiene la configuración de usuario (`couple_id`, `default_split_method`, `is_premium`) [2].
  - `family_members` actúa como puente de transacción, enlazando un `couple_id` con un `linked_user_id` [2].

## 4. Traducción de Lógica Específica

- **Cálculo Proporcional:** Para los gastos donde `split_method` es igual a un método proporcional (ej. porcentaje según ingresos), el agente debe consultar secuencialmente la tabla `incomes`, cruzar el `user_id` (que apunta a `family_members`) en el mes especificado por la columna `date` del gasto, y calcular matemáticamente la división en TypeScript [1, 2].
- **Gastos Recurrentes Históricos:** Al editar un gasto con `is_recurring = true`, el sistema no debe sobrescribir todo. Debe actualizar el `recurrence_end_date` del registro antiguo al momento actual (cerrando el ciclo) y generar un nuevo `INSERT` con los valores editados y sin fecha de finalización (`recurrence_end_date = NULL`) [1, 4-6].
