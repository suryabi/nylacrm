import * as React from "react";
import { Input } from "./input";

/**
 * <DecimalInput />
 * Drop-in replacement for an <Input type="number" />-style numeric field that
 * gracefully handles decimal entry without the usual gotchas.
 *
 * Why this exists:
 * - Native <input type="number"> drops trailing dots ("2."), eats leading
 *   zeros, and triggers spinner UI we don't want.
 * - Hand-rolled regex inputs across the app frequently:
 *     a) capped decimals at 2 places (`\d{0,2}`), making 3+ dp fields silently
 *        ignore the third keystroke ("wiped");
 *     b) called parseFloat() on every keystroke, wiping intermediate states
 *        like "2." (becomes 2) before the user can finish typing.
 *
 * This component:
 * - Accepts string OR number `value`; renders raw value as-is so trailing
 *   dots / leading zeros / leading dots ("0.5", ".5", "2.") all stick while
 *   typing.
 * - Validates each keystroke against a regex; rejected keystrokes are simply
 *   dropped (state unchanged, no flicker).
 * - Returns the raw STRING via onChange. Parent is responsible for
 *   parseFloat() at submit time — never mid-type.
 * - Defaults to unlimited decimals; pass `maxDecimals={n}` to cap.
 * - Sets `inputMode="decimal"` so mobile keyboards show the numeric pad.
 *
 * Usage:
 *   <DecimalInput
 *     value={form.price}
 *     onChange={(v) => setForm({ ...form, price: v })}
 *     placeholder="0.00"
 *     className="text-right"
 *   />
 *
 *   // submit-time
 *   const num = parseFloat(form.price) || 0;
 */
const DecimalInput = React.forwardRef(function DecimalInput(
  { value, onChange, maxDecimals, allowNegative = false, className, ...rest },
  ref
) {
  const regex = React.useMemo(() => {
    const decPart = maxDecimals !== undefined && maxDecimals !== null
      ? `\\d{0,${maxDecimals}}`
      : "\\d*";
    const sign = allowNegative ? "-?" : "";
    return new RegExp(`^${sign}\\d*\\.?${decPart}$`);
  }, [maxDecimals, allowNegative]);

  const display =
    value === null || value === undefined || value === "" ? "" : String(value);

  const handleChange = (e) => {
    const v = e.target.value;
    // Accept empty (lets users clear field) or strings matching the regex.
    if (v === "" || regex.test(v)) {
      onChange?.(v);
    }
  };

  return (
    <Input
      ref={ref}
      type="text"
      inputMode="decimal"
      value={display}
      onChange={handleChange}
      className={className}
      {...rest}
    />
  );
});

export { DecimalInput };
