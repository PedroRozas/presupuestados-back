import { z } from 'zod';

export const normalizationOutputSchema = z.object({
  decisions: z.array(
    z.object({
      key: z.string().min(1),
      candidate_id: z.string().nullable(),
    }),
  ),
});

export type NormalizationOutput = z.infer<typeof normalizationOutputSchema>;

export class NormalizationOutputInvalidError extends Error {
  constructor(detail: string) {
    super(`normalization_output_invalid: ${detail}`);
    this.name = 'NormalizationOutputInvalidError';
  }
}

const parseJson = (rawText: string): unknown => {
  try {
    return JSON.parse(rawText) as unknown;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new NormalizationOutputInvalidError(`json: ${reason}`);
  }
};

export const parseNormalizationOutput = (
  rawText: string,
): NormalizationOutput => {
  const result = normalizationOutputSchema.safeParse(parseJson(rawText));
  if (!result.success) {
    throw new NormalizationOutputInvalidError(result.error.message);
  }
  return result.data;
};
