// Shape only: the check digit is not verified, and a well-formed CURP can still belong to nobody.
const CURP_RE = /^[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[A-Z0-9][0-9]$/;

/** Uppercase and strip all whitespace. */
export function normalizeCurp(input: string): string {
  return input.toUpperCase().replace(/\s+/g, '');
}

export function isValidCurp(input: string): boolean {
  return typeof input === 'string' && CURP_RE.test(normalizeCurp(input));
}
