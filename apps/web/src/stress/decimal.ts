export type Decimal = { coefficient: bigint; scale: number };

const DECIMAL_PATTERN = /^(\d{1,400})(?:\.(\d{1,400}))?$/;

export function parseDecimal(value: string): Decimal {
  const match = DECIMAL_PATTERN.exec(value);
  if (!match) throw new Error("decimal");
  const fraction = match[2] ?? "";
  const coefficient = BigInt(`${match[1]}${fraction}`);
  return normalize({ coefficient, scale: fraction.length });
}

export function multiplyDecimal(left: Decimal, right: Decimal): Decimal {
  return normalize({
    coefficient: left.coefficient * right.coefficient,
    scale: left.scale + right.scale,
  });
}

export function sumDecimals(values: Decimal[]): Decimal {
  let result: Decimal = { coefficient: 0n, scale: 0 };
  for (const value of values) {
    const scale = Math.max(result.scale, value.scale);
    result = normalize({
      coefficient:
        result.coefficient * 10n ** BigInt(scale - result.scale) +
        value.coefficient * 10n ** BigInt(scale - value.scale),
      scale,
    });
  }
  return result;
}

export function decimalToString(value: Decimal): string {
  const normalized = normalize(value);
  const digits = normalized.coefficient.toString();
  if (normalized.scale === 0) return digits;
  const padded = digits.padStart(normalized.scale + 1, "0");
  return `${padded.slice(0, -normalized.scale)}.${padded.slice(-normalized.scale)}`;
}

export function decimalIsOne(value: Decimal): boolean {
  const normalized = normalize(value);
  return normalized.coefficient === 1n && normalized.scale === 0;
}

export function decimalIsZero(value: Decimal): boolean {
  return normalize(value).coefficient === 0n;
}

function normalize(value: Decimal): Decimal {
  let { coefficient, scale } = value;
  while (scale > 0 && coefficient % 10n === 0n) {
    coefficient /= 10n;
    scale -= 1;
  }
  return { coefficient, scale };
}
