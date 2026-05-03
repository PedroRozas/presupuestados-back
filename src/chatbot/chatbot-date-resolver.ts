export type ResolvedPeriod =
  | { type: 'month'; year: number; month: number; label: string }
  | { type: 'range'; from: string; to: string; label: string }
  | { type: 'ambiguous'; question: string };

const MONTHS: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

const QUARTERS: Record<string, [number, number]> = {
  primer: [1, 3],
  primero: [1, 3],
  segundo: [4, 6],
  tercer: [7, 9],
  tercero: [7, 9],
  cuarto: [10, 12],
};

export class ChatbotDateResolver {
  resolve(text: string, now = new Date()): ResolvedPeriod | null {
    const normalized = this.normalize(text);
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    if (
      /\b(este|actual)\s+mes\b|\bmes\s+(actual|en curso)\b/.test(normalized)
    ) {
      return this.month(currentYear, currentMonth, 'este mes');
    }

    if (/\bmes\s+pasado\b|\bultimo\s+mes\b/.test(normalized)) {
      const previous = new Date(currentYear, currentMonth - 2, 1);
      return this.month(
        previous.getFullYear(),
        previous.getMonth() + 1,
        'mes pasado',
      );
    }

    const lastMonthsMatch = normalized.match(
      /\bultimos?\s+(\d{1,2})\s+meses\b/,
    );
    if (lastMonthsMatch) {
      const count = Math.min(Math.max(Number(lastMonthsMatch[1]), 1), 12);
      const start = new Date(currentYear, currentMonth - count, 1);
      const end = new Date(currentYear, currentMonth, 0);
      return {
        type: 'range',
        from: this.formatDate(start),
        to: this.formatDate(end),
        label: `ultimos ${count} meses incluyendo el mes actual`,
      };
    }

    const quarterMatch = normalized.match(
      /\b(primer|primero|segundo|tercer|tercero|cuarto)\s+trimestre(?:\s+(?:de|del)\s+(\d{4}))?\b/,
    );
    if (quarterMatch) {
      const quarter = QUARTERS[quarterMatch[1]];
      if (!quarter) return null;
      const year = quarterMatch[2] ? Number(quarterMatch[2]) : currentYear;
      const [fromMonth, toMonth] = quarter;
      const from = new Date(year, fromMonth - 1, 1);
      const to = new Date(year, toMonth, 0);
      return {
        type: 'range',
        from: this.formatDate(from),
        to: this.formatDate(to),
        label: `${quarterMatch[1]} trimestre ${year}`,
      };
    }

    for (const [name, month] of Object.entries(MONTHS)) {
      const monthMatch = normalized.match(
        new RegExp(`\\b${name}(?:\\s+(?:de|del)?\\s*(\\d{4}))?\\b`),
      );
      if (monthMatch) {
        const year = monthMatch[1] ? Number(monthMatch[1]) : currentYear;
        return this.month(year, month, `${name} ${year}`);
      }
    }

    if (/\b(ese|aquel)\s+mes\b/.test(normalized)) {
      return {
        type: 'ambiguous',
        question: '¿A qué mes te refieres? Por ejemplo: mayo 2026.',
      };
    }

    return null;
  }

  private normalize(text: string) {
    return text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  private month(year: number, month: number, label: string): ResolvedPeriod {
    return { type: 'month', year, month, label };
  }

  private formatDate(date: Date) {
    return date.toISOString().split('T')[0];
  }
}
