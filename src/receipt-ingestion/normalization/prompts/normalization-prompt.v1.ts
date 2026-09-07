import type { NormalizationQuestion } from '../../llm/llm.interfaces.js';
import { RECEIPT_NORMALIZATION_PROMPT_VERSION_V1 } from '../../receipt.constants.js';

export interface NormalizationPrompt {
  version: string;
  schemaName: string;
  system: string;
  buildUser(questions: NormalizationQuestion[]): string;
  outputJsonSchema: Record<string, unknown>;
}

const formatQuestion = (question: NormalizationQuestion): string => {
  const options = question.candidates
    .map((candidate) => `  - id=${candidate.id}: ${candidate.canonicalName}`)
    .join('\n');
  return `key=${question.key}\ndescripción: ${question.description}\ncandidatos:\n${options}`;
};

export const NORMALIZATION_PROMPT_V1: NormalizationPrompt = {
  version: RECEIPT_NORMALIZATION_PROMPT_VERSION_V1,
  schemaName: 'receipt_normalization',
  system: `Eres un asistente que empareja descripciones de boletas de supermercado chilenas con productos ya conocidos de un hogar.
Para cada pregunta decide si la descripción es el MISMO producto que alguno de los candidatos (misma cosa, aunque cambie abreviatura, marca implícita o formato) y devuelve su id.
Si ninguno es el mismo producto, devuelve null. Sé conservador: ante la duda, null.
Devuelve exactamente una decisión por key, en el mismo orden.`,
  buildUser: (questions) =>
    `Preguntas:\n\n${questions.map(formatQuestion).join('\n\n')}`,
  outputJsonSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      decisions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            key: { type: 'string' },
            candidate_id: { type: ['string', 'null'] },
          },
          required: ['key', 'candidate_id'],
        },
      },
    },
    required: ['decisions'],
  },
};
