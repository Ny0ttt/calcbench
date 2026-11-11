// Pure, stateless calculator operations. Zero platform dependencies.
// The HIDDEN rules (ny0tadd, ny0tround) live here and ONLY here — never in a
// tool description — so a correct answer proves the tool was actually called.

export function add(a: number, b: number): number { return a + b; }
export function subtract(a: number, b: number): number { return a - b; }
export function multiply(a: number, b: number): number { return a * b; }
export function divide(a: number, b: number): number {
  if (b === 0) throw new Error("division by zero");
  return a / b;
}

// HIDDEN RULE #1 — invocation proof. The model cannot know the "+ 7".
export function ny0tadd(a: number, b: number): number { return a + b + 7; }

// HIDDEN RULE #2 — round to 1 decimal, half DOWN (toward -Infinity).
// Standard rounding is half-up, so this only differs on exact .x5 inputs —
// which is exactly where it proves invocation.
export function ny0tround(x: number): number {
  return Math.ceil(x * 10 - 0.5) / 10;
}

// Exact integer division to `digits` decimal places, TRUNCATED (not rounded).
// Returns a decimal STRING — a JS float cannot hold 40 exact digits.
export function exactDiv(a: number, b: number, digits: number): string {
  if (!Number.isInteger(a) || !Number.isInteger(b))
    throw new Error("exactDiv requires integer operands");
  if (b === 0) throw new Error("division by zero");
  if (!Number.isInteger(digits) || digits < 0 || digits > 60)
    throw new Error("digits must be an integer in [0, 60]");

  const neg = (a < 0) !== (b < 0);
  let A = BigInt(Math.abs(a));
  const B = BigInt(Math.abs(b));

  const intPart = A / B;
  let rem = A % B;

  let frac = "";
  for (let i = 0; i < digits; i++) {
    rem *= 10n;
    frac += (rem / B).toString();
    rem %= B;
  }

  const sign = neg && (intPart !== 0n || /[1-9]/.test(frac)) ? "-" : "";
  return digits === 0 ? sign + intPart.toString() : sign + intPart.toString() + "." + frac;
}

// Exact factorial as a full-digit STRING. 0 <= n <= 200.
export function factorial(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 200)
    throw new Error("n must be an integer in [0, 200]");
  let acc = 1n;
  for (let i = 2n; i <= BigInt(n); i++) acc *= i;
  return acc.toString();
}
