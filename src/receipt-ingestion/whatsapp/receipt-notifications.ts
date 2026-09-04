export interface GroupClosedMessageInput {
  pageCount: number;
}

const SINGLE_PAGE = 1;

export const buildGroupClosedMessage = (
  input: GroupClosedMessageInput,
): string => {
  const noun = input.pageCount === SINGLE_PAGE ? 'foto' : 'fotos';
  return `Recibí tu boleta (${input.pageCount} ${noun}). Quedó guardada y pendiente de revisión.`;
};

export const buildNoOpenGroupMessage = (): string =>
  'No tengo ninguna boleta abierta. Envíame la foto primero.';
