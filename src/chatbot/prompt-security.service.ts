import { Injectable } from '@nestjs/common';

export type PromptSecurityDecision = 'allow' | 'warn' | 'block';

export interface PromptSecurityResult {
  decision: PromptSecurityDecision;
  normalized: string;
  reason?: string;
}

@Injectable()
export class PromptSecurityService {
  private readonly blockPatterns: Array<{ pattern: RegExp; reason: string }> = [
    {
      pattern:
        /\b(ignore|forget|discard)\s+(previous|above|all|your)(\s+\w+){0,3}\s+instructions?\b/i,
      reason: 'instruction_override',
    },
    {
      pattern:
        /\b(ignora|ignorar|olvida|olvidar|descarta|descartar)\s+((todas?|las|mis|tus)\s+){0,3}(instrucciones|reglas|indicaciones)\b/i,
      reason: 'instruction_override',
    },
    {
      pattern: /\b(system|developer)\s+(prompt|message|instructions?)\b/i,
      reason: 'prompt_disclosure',
    },
    {
      pattern:
        /\b(prompt|mensaje|instrucciones)\s+(del\s+)?(sistema|desarrollador|developer)\b/i,
      reason: 'prompt_disclosure',
    },
    {
      pattern: /\b(jailbreak|dan|developer mode|modo desarrollador)\b/i,
      reason: 'jailbreak',
    },
    {
      pattern:
        /\b(exfiltrate|reveal|show|print|list)\s+.*\b(ids?|uuids?|tokens?|secrets?|keys?)\b/i,
      reason: 'secret_or_id_disclosure',
    },
    {
      pattern:
        /\b(muestra|muestrame|revela|lista|imprime|expone)\s+.*\b(ids?|uuids?|tokens?|secretos?|claves?)\b/i,
      reason: 'secret_or_id_disclosure',
    },
    {
      pattern: /\bact\s+as\s+/i,
      reason: 'role_override',
    },
    {
      pattern: /\b(actua|actuar|comportate)\s+como\s+/i,
      reason: 'role_override',
    },
  ];

  private readonly warnPatterns: Array<{ pattern: RegExp; reason: string }> = [
    {
      pattern: /\b(base64|rot13|unicode|obfusca|obfuscate)\b/i,
      reason: 'obfuscation_signal',
    },
    {
      pattern: /\b(tool|function|schema|parametros?|arguments?)\b/i,
      reason: 'tooling_probe',
    },
  ];

  private readonly financePatterns = [
    /\b(gastos?|gaste|gastamos|gastado|ingresos?|sueldos?|presupuestos?)\b/i,
    /\b(cartolas?|boletas?|categorias?|deducciones?|deudas?|ahorros?)\b/i,
    /\b(pagos?|pagar|sobro|sobra|sobrara|restante|saldo|cashflow)\b/i,
    /\b(flujo\s+de\s+caja|tarjetas?|cuentas?|bancos?|transferencias?)\b/i,
    /\b(gastos?\s+comunes|prorrateo|proporcional|50\/50|mitad)\b/i,
    /\b(plata|dinero|lucas|monto|total|promedio)\b/i,
    /\b(comparar|resumen)\s+(de\s+)?(gastos?|ingresos?|presupuestos?|mes)\b/i,
  ];

  private readonly offTopicPatterns: Array<{
    pattern: RegExp;
    reason: string;
  }> = [
    {
      pattern:
        /\b(recetas?|cocina|cocinar|ingredientes?|preparacion|preparar|hornear|freir|hervir|asar|pastel|choclo|empanadas?|postres?|comida)\b/i,
      reason: 'non_financial_recipe',
    },
    {
      pattern:
        /\b(chistes?|bromas?|poemas?|cuentos?|canciones?|peliculas?|series?|libros?|juegos?)\b/i,
      reason: 'non_financial_entertainment',
    },
    {
      pattern: /\b(clima|noticias?|deportes?|horoscopo|politica)\b/i,
      reason: 'non_financial_general_request',
    },
    {
      pattern:
        /\b(codigo|programa|programar|script|sql|html|css|javascript|typescript|python)\b/i,
      reason: 'non_financial_technical_request',
    },
    {
      pattern:
        /\b(rutina|ejercicios?|entrenamiento|medico|diagnostico|salud|sintomas?)\b/i,
      reason: 'non_financial_health_request',
    },
    {
      pattern: /\b(viajes?|itinerario|hotel|vuelos?|turismo|restaurantes?)\b/i,
      reason: 'non_financial_travel_request',
    },
    {
      pattern:
        /\b(que\s+es|quien\s+es|explica|explicame|resumen\s+de|historia\s+de|dame\s+una|hazme\s+un[ao]?)\b/i,
      reason: 'non_financial_general_request',
    },
  ];

  analyze(text: string): PromptSecurityResult {
    const normalized = this.normalize(text);
    const canonical = this.toCanonicalText(normalized);

    for (const item of this.blockPatterns) {
      if (item.pattern.test(canonical)) {
        return { decision: 'block', normalized, reason: item.reason };
      }
    }

    for (const item of this.warnPatterns) {
      if (item.pattern.test(canonical)) {
        return { decision: 'warn', normalized, reason: item.reason };
      }
    }

    for (const item of this.offTopicPatterns) {
      if (
        item.pattern.test(canonical) &&
        !this.financePatterns.some((pattern) => pattern.test(canonical))
      ) {
        return { decision: 'block', normalized, reason: item.reason };
      }
    }

    return { decision: 'allow', normalized };
  }

  isOutOfScopeReason(reason?: string) {
    return reason?.startsWith('non_financial_') ?? false;
  }

  hasFinancialDomainSignal(text: string) {
    const canonical = this.toCanonicalText(this.normalize(text));
    return this.financePatterns.some((pattern) => pattern.test(canonical));
  }

  sanitizeOutput(text: string) {
    return text
      .replace(
        /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
        '[referencia interna]',
      )
      .replace(
        /\b(system|developer)\s+(prompt|message|instructions?)\b/gi,
        'instrucciones internas',
      )
      .replace(
        /\b(prompt|mensaje)\s+(del\s+)?(sistema|desarrollador)\b/gi,
        'instrucciones internas',
      )
      .trim();
  }

  normalize(text: string) {
    return text
      .normalize('NFKC')
      .replace(/\p{Cf}/gu, '')
      .replace(/\p{Cc}/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 1000);
  }

  private toCanonicalText(text: string) {
    return text
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase();
  }
}
