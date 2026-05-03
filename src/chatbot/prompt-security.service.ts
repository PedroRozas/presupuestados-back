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
        /\b(ignore|forget|discard)\s+(previous|above|all|your)\s+instructions?\b/i,
      reason: 'instruction_override',
    },
    {
      pattern:
        /\b(ignora|olvida|descarta)\s+(las\s+)?(instrucciones|reglas|indicaciones)\b/i,
      reason: 'instruction_override',
    },
    {
      pattern: /\b(system|developer)\s+(prompt|message|instructions?)\b/i,
      reason: 'prompt_disclosure',
    },
    {
      pattern: /\b(prompt|mensaje)\s+(del\s+)?(sistema|desarrollador)\b/i,
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
        /\b(muestra|revela|lista|imprime|expone)\s+.*\b(ids?|uuids?|tokens?|secretos?|claves?)\b/i,
      reason: 'secret_or_id_disclosure',
    },
    {
      pattern: /\bact\s+as\s+(?!.*financial)/i,
      reason: 'role_override',
    },
    {
      pattern: /\bactua\s+como\s+(?!.*financier)/i,
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

  analyze(text: string): PromptSecurityResult {
    const normalized = this.normalize(text);

    for (const item of this.blockPatterns) {
      if (item.pattern.test(normalized)) {
        return { decision: 'block', normalized, reason: item.reason };
      }
    }

    for (const item of this.warnPatterns) {
      if (item.pattern.test(normalized)) {
        return { decision: 'warn', normalized, reason: item.reason };
      }
    }

    return { decision: 'allow', normalized };
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
      .split('')
      .filter((char) => {
        const code = char.charCodeAt(0);
        return code > 31 && code !== 127;
      })
      .join('')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 1000);
  }
}
