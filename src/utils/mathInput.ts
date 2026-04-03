/**
 * Safely evaluate a simple math expression entered by the user.
 * Only digits, decimal points, spaces, and the operators + - * / ( ) are allowed.
 * Returns the rounded integer result, or null if the expression is invalid.
 *
 * Examples:
 *   "1920/2"     → 960
 *   "320 * 3"    → 960
 *   "1080 + 64"  → 1144
 *   "(640+320)/2" → 480
 *   "abc"        → null
 */
export function evalMathExpr(raw: string): number | null {
  const expr = raw.trim().replace(/\s+/g, '');
  if (expr === '') return null;
  // Whitelist: only digits, decimal, basic operators, and parentheses
  if (!/^[\d.+\-*/()]+$/.test(expr)) return null;
  // Guard against empty parens, double operators, etc.
  if (/[+\-*/]{2,}/.test(expr)) return null;
  try {
    // eslint-disable-next-line no-new-func
    const result = new Function(`"use strict"; return (${expr})`)() as unknown;
    if (typeof result !== 'number' || !isFinite(result)) return null;
    return Math.round(result);
  } catch {
    return null;
  }
}
