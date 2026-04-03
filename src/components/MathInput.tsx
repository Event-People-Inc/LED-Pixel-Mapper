import { useEffect, useState } from 'react';
import { evalMathExpr } from '../utils/mathInput';

interface MathInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'type' | 'value'> {
  value: number | string | undefined;
  /** Called with the evaluated result string on commit (blur or Enter). */
  onChange: (value: string) => void;
  /** Allow decimal results (e.g. for watt values). Default: false (integer). */
  allowDecimal?: boolean;
}

/**
 * Drop-in replacement for <input type="number"> that evaluates math expressions.
 * Type "320+320" → Enter/blur → shows "640" and fires onChange("640").
 * Invalid expressions revert to the last committed value.
 */
export default function MathInput({
  value,
  onChange,
  onBlur,
  onKeyDown,
  allowDecimal = false,
  ...rest
}: MathInputProps) {
  const toStr = (v: number | string | undefined) =>
    v === undefined || v === null ? '' : String(v);

  const [raw, setRaw] = useState(toStr(value));
  const [focused, setFocused] = useState(false);

  // Sync display value when prop changes from outside (e.g. selecting a different tile)
  useEffect(() => {
    if (!focused) setRaw(toStr(value));
  }, [value, focused]);

  const commit = () => {
    const trimmed = raw.trim();
    if (trimmed === '') { onChange(''); return; }

    const result = evalMathExpr(trimmed);
    if (result !== null) {
      const out = allowDecimal
        ? String(Math.round(result * 100) / 100)
        : String(result); // evalMathExpr already rounds to integer
      setRaw(out);
      onChange(out);
    } else {
      // Not a valid expression — revert to last committed value from prop
      setRaw(toStr(value));
    }
  };

  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      value={raw}
      onChange={(e) => {
        const v = e.target.value;
        setRaw(v);
        // Fire onChange immediately for plain numbers so parent state stays current
        // (math expressions like "320+320" still only evaluate on blur/Enter)
        const isPlainNumber = allowDecimal
          ? /^-?\d*\.?\d*$/.test(v.trim())
          : /^-?\d*$/.test(v.trim());
        if (isPlainNumber) onChange(v);
      }}
      onFocus={(e) => {
        setFocused(true);
        rest.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        commit();
        onBlur?.(e);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          commit();
          (e.target as HTMLInputElement).blur();
        }
        onKeyDown?.(e);
      }}
    />
  );
}
