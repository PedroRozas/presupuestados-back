import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { GoogleGenAI } from "npm:@google/genai";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
serve(async (req)=>{
  // 0. Gestión de CORS (Preflight)
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    // ---------------------------------------------------------
    // 1. INICIO VERIFICACIÓN DE SEGURIDAD Y PREMIUM
    // ---------------------------------------------------------
    // Obtener el header de autorización
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Falta cabecera de autorización');
    }
    const token = authHeader.replace('Bearer ', '');
    // Crear cliente de Supabase
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: {
        headers: {
          Authorization: authHeader
        }
      }
    });
    // Obtener usuario autenticado
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({
        error: 'No autenticado',
        details: userError?.message
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // VERIFICACIÓN PREMIUM
    const { data: profile, error: profileError } = await supabaseClient.from('profiles').select('is_premium').eq('id', user.id).single();
    if (profileError || !profile?.is_premium) {
      return new Response(JSON.stringify({
        error: 'Acceso denegado',
        message: 'Esta función requiere suscripción premium'
      }), {
        status: 403,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // ---------------------------------------------------------
    // FIN VERIFICACIÓN - EL USUARIO ES PREMIUM
    // ---------------------------------------------------------
    // 2. Procesamiento del Archivo (Lógica Original)
    const formData = await req.formData();
    const file = formData.get('file');
    // Leer targetDate de formData o usar hoy
    const targetDateParam = formData.get('targetDate');
    const today = targetDateParam ? String(targetDateParam) : new Date().toISOString().split('T')[0];
    if (!file || !(file instanceof File)) {
      throw new Error('No se ha subido ningún archivo válido.');
    }
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) throw new Error('Falta GEMINI_API_KEY en Secrets.');
    // 3. Preparar archivo (Base64)
    const arrayBuffer = await file.arrayBuffer();
    const base64Data = btoa(new Uint8Array(arrayBuffer).reduce((data, byte)=>data + String.fromCharCode(byte), ''));
    // 4. Inicializar el cliente Gemini
    const ai = new GoogleGenAI({
      apiKey
    });
    // 5. Prompt de Contabilidad
    const promptText = `
      Actúa como experto contable. Analiza la imagen o documento PDF.
      La fecha objetivo para estos gastos es: ${today}.
      
      Extrae GASTOS (ignora abonos, sueldos y transferencias recibidas).
      
      Monto: TOTAL FINAL del gasto (con propina si aplica). Entero sin puntos.
      Fecha: Usa esta fecha: ${today} en YYYY-MM-DD".
      Descripción: Nombre del comercio limpio (ej: "Jumbo", "Uber") siempre debe ser con la primera letra mayuscula solamente, aqui agrega la fecha de la compra YYYY-MM-DD.
      Categoria: Clasifica el gasto (ej: Supermercado, Restaurante, Transporte, Salud, Hogar).
      
      OUTPUT JSON EXACTO:
      { "expenses": [{ "date": "YYYY-MM-DD", "description": "X, (YYYY-MM-DD )", "amount": 0, "category": "X" }] }
    `;
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: promptText
            },
            {
              inlineData: {
                mimeType: file.type,
                data: base64Data
              }
            }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json"
      }
    });
    // 6. Obtener resultado y Parsear
    const resultText = response.text;
    let parsedData;
    try {
      if (!resultText) throw new Error("La IA devolvió una respuesta vacía");
      // Limpieza preventiva por si acaso
      const cleanJson = resultText.replace(/```json|```/g, '').trim();
      parsedData = JSON.parse(cleanJson);
    } catch (e) {
      // Fallback simple o re-throw
      parsedData = {
        expenses: []
      };
      console.error("Error parseando JSON de Gemini:", resultText);
    }
    return new Response(JSON.stringify(parsedData), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 200
    });
  } catch (error) {
    console.error("Error en Edge Function:", error);
    return new Response(JSON.stringify({
      error: error.message || 'Error desconocido en el servidor'
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 400 // O 500 según prefieras
    });
  }
});


financial assist 

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GoogleGenAI } from "npm:@google/genai";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Falta cabecera de autorización");
    const token = authHeader.replace("Bearer ", "");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({
          error: "No autenticado",
          details: userError?.message,
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { data: profile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("is_premium")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.is_premium) {
      return new Response(
        JSON.stringify({
          error: "Acceso denegado",
          message: "Esta función requiere suscripción premium",
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { message, coupleId } = await req.json();
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    const since = twelveMonthsAgo.toISOString().split("T")[0];

    const [expensesResult, categoriesResult, budgetsResult] = await Promise.all(
      [
        supabaseClient
          .from("expenses")
          .select("amount, description, date, category_id")
          .eq("couple_id", coupleId)
          .eq("is_credit", false)
          .gte("date", since)
          .order("date", { ascending: false })
          .limit(300),

        supabaseClient.rpc("get_categories_rpc"),

        supabaseClient
          .from("budgets")
          .select("name, amount")
          .eq("couple_id", coupleId),
      ],
    );

    if (expensesResult.error) throw expensesResult.error;

    const categoriesMap = new Map(
      ((categoriesResult.data as any[]) || []).map((c) => [c.id, c.name]),
    );

    const expensesContext =
      expensesResult.data
        ?.map((e) => {
          const cat = categoriesMap.get(e.category_id) || "Varios";
          return `- ${e.date}: ${e.description} ($${e.amount}) [${cat}]`;
        })
        .join("\n") || "No hay gastos registrados.";

    const budgetsContext =
      budgetsResult.data?.map((b) => `- ${b.name}: $${b.amount}`).join("\n") ||
      "No hay presupuestos definidos.";

    const today = new Date().toISOString().split("T")[0];
    const systemPrompt = `
Eres "Presu", un asistente financiero personal experto, integrado en la app PresupuestaDos.
Solos debes responder en base a ayuda financiara del usuario, nada mas.
La fecha de hoy es ${today}. Responde siempre en español.

DATOS DEL USUARIO (últimos 12 meses):
--- GASTOS ---
${expensesContext}

--- PRESUPUESTOS ---
${budgetsContext}

INSTRUCCIONES CRÍTICAS:
- Muchos gastos tienen categoría "Varios" porque la funcionalidad de categorías se implementó recientemente.
  En esos casos, DEBES inferir la naturaleza del gasto leyendo la DESCRIPCIÓN (el nombre del comercio o concepto).
  Ejemplos de inferencia semántica que DEBES aplicar:
  * "McDonald's", "Burger King", "Sushi", "Restaurante", "Pizza" → Alimentación/Restaurante
  * "Jumbo", "Lider", "Walmart", "Unimarc" → Supermercado
  * "Uber", "Cabify", "Shell", "Copec", "Terpel" → Transporte/Combustible
  * "Netflix", "Spotify", "Disney+" → Suscripciones
  * "Farmacia", "Clinica", "Dr.", "Salud" → Salud
  * "Falabella", "Ripley", "H&M", "Zara" → Ropa
  Aplica este razonamiento semántico para responder preguntas por categoría aunque el campo categoría diga "Varios".

- Si el usuario pregunta por un mes específico, filtra los gastos por fecha correctamente.
- Si pregunta por totales, suma los montos del rango solicitado.
- Si los datos no son suficientes para responder, indícalo amablemente.
- Sé conciso y usa markdown (negritas, listas) cuando ayude a la claridad.
- NUNCA inventes montos ni fechas.
- Responde de manera amigable y con un consejo final para el usuario.

PREGUNTA DEL USUARIO: "${message}"
`;

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) throw new Error("Falta GEMINI_API_KEY en Secrets.");

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
    });

    const reply = response.text || "Lo siento, no pude generar una respuesta.";

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error en financial-assistant:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "Error desconocido en el servidor",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
