export const XY_UNITS = Object.freeze({
  nm: Object.freeze({ label: 'nm', fromMicron: 1000, toMicron: 0.001 }),
  um: Object.freeze({ label: 'µm', fromMicron: 1, toMicron: 1 }),
  mm: Object.freeze({ label: 'mm', fromMicron: 0.001, toMicron: 1000 }),
});

export function unitMeta(unit) {
  return XY_UNITS[unit] || XY_UNITS.um;
}

export function toMicron(value, unit = 'um') {
  return Number(value) * unitMeta(unit).toMicron;
}

export function fromMicron(value, unit = 'um') {
  return Number(value) * unitMeta(unit).fromMicron;
}

export function convertXY(value, fromUnit = 'um', toUnit = 'um') {
  return fromMicron(toMicron(value, fromUnit), toUnit);
}

export function formatXY(valueMicron, unit = 'um', digits = 3) {
  const value = fromMicron(valueMicron, unit);
  const abs = Math.abs(value);
  if (abs === 0) return '0';
  if (abs >= 10000) return Number(value.toFixed(0)).toLocaleString('en-US', { useGrouping: false });
  if (abs >= 100) return Number(value.toFixed(1)).toString();
  if (abs >= 1) return Number(value.toFixed(2)).toString();
  return Number(value.toPrecision(digits)).toString();
}

export function roundMicronToTenthNanometre(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return number;
  const rounded = Math.round(number * 10000) / 10000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function formatLengthInput(valueMicron, unit = 'um') {
  const roundedMicron = roundMicronToTenthNanometre(valueMicron);
  if (!Number.isFinite(roundedMicron)) return '';
  const value = fromMicron(roundedMicron, unit);
  const decimals = unit === 'nm' ? 1 : unit === 'mm' ? 7 : 4;
  return value
    .toFixed(decimals)
    .replace(/\.0+$/, '')
    .replace(/(\.\d*?)0+$/, '$1');
}
