# CLAUDE.md

Instrucciones para Claude al trabajar en mis proyectos. Este archivo define cómo quiero colaborar, qué priorizar y cómo comunicarme con el asistente.

---

## Idioma

Responde siempre en **español**, salvo que el contexto del proyecto exija inglés (nombres de variables, comentarios en código, documentación técnica pública, etc.).

---

## Stack principal

- **Frontend / Web:** React, Next.js, TypeScript
- **Backend:** Node.js, Express, TypeScript
- **Mobile:** Flutter (Dart)
- **Lenguajes base:** TypeScript / JavaScript, Python (data / ML)

Cuando no se especifique stack, asumir TypeScript como lenguaje por defecto para web/backend y Flutter para mobile.

---

## Prioridades al escribir código

1. **Código limpio sobre código rápido.** Prefiero soluciones legibles y mantenibles. Evitar hacks o atajos que generen deuda técnica innecesaria.
2. **Tipado estricto.** En TypeScript, usar tipos explícitos. Evitar `any` salvo justificación.
3. **Separación de responsabilidades.** Funciones y componentes con una sola responsabilidad clara.
4. **Nombres descriptivos.** Variables, funciones y componentes deben describir su propósito sin necesidad de comentarios extra.
5. **Manejo de errores explícito.** No dejar try/catch vacíos ni ignorar errores silenciosamente.

---

## Convenciones de estilo

Las convenciones varían por proyecto. Al inicio de cada proyecto nuevo, indicaré las reglas específicas (linter, formatter, estructura de carpetas, etc.). Mientras no se indiquen, seguir las siguientes como base:

- **TypeScript/JS:** ESLint + Prettier con configuración estándar. Comillas simples, sin punto y coma, 2 espacios de indentación.
- **React/Next.js:** Componentes funcionales con hooks. Evitar class components.
- **Flutter:** Seguir las guías oficiales de Dart/Flutter. `const` donde sea posible.
- **Commits:** Conventional Commits (`feat:`, `fix:`, `refactor:`, `chore:`, etc.).

---

## Cómo proponer cambios al código

Adaptar según el contexto:

- **Cambio puntual o pequeño:** mostrar solo el diff o el bloque afectado.
- **Refactor o cambio estructural:** reescribir el bloque completo con contexto suficiente.
- **Decisión no obvia:** explicar brevemente el razonamiento antes del código.

No pedir confirmación antes de mostrar el código salvo que el cambio sea destructivo o irreversible.

---

## Feedback y revisión de código

Quiero **feedback directo y honesto**. Si algo está mal diseñado, es poco eficiente o viola buenas prácticas, decirlo claramente y proponer la alternativa.

- Señalar problemas específicos, no generales.
- Si hay múltiples formas de resolver algo, presentar las opciones con sus trade-offs.
- No suavizar críticas innecesariamente. Prefiero saber qué está mal que recibir validación vacía.

---

## Lo que Claude NO debe hacer

- Generar código con `TODO` sin explicación de qué falta.
- Asumir librerías o dependencias sin preguntar si no están mencionadas en el contexto.
- Reescribir código funcional sin que se lo pida.
- Agregar comentarios obvios que repiten lo que el código ya dice.
- Dar respuestas con excesivo padding o frases de relleno antes de llegar al punto.

---

## Contexto por proyecto

Al comenzar a trabajar en un proyecto específico, proporcionaré:

- Descripción del proyecto y su objetivo
- Stack y dependencias clave
- Convenciones de estilo del proyecto
- Restricciones o decisiones de arquitectura relevantes

Claude debe pedirme este contexto si no está disponible y lo necesita para dar una respuesta útil.

---

## Notas generales

- Si una pregunta es ambigua, hacer **una sola pregunta de aclaración**, la más importante.
- Respuestas concisas por defecto. Más detalle solo si es necesario o lo pido.
- Si detecto que una instrucción de este archivo entra en conflicto con el contexto del proyecto, indicármelo.
