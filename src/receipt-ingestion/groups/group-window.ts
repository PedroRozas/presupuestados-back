const MILLISECONDS_PER_SECOND = 1000;

export interface GroupWindowInput {
  lastImageAt: Date | null;
  receivedAt: Date;
  windowSeconds: number;
}

export const isWithinGroupWindow = (input: GroupWindowInput): boolean => {
  if (!input.lastImageAt) return false;
  const elapsedMs = input.receivedAt.getTime() - input.lastImageAt.getTime();
  return elapsedMs <= input.windowSeconds * MILLISECONDS_PER_SECOND;
};
