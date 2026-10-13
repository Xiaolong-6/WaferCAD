// Display conversion only. Canonical geometry and worker parameters stay in physical µm.
import { fromMicron, toMicron, unitMeta } from '../../units.js';
export function createDisplayUnits(getState) {
  const key = () => getState()?.xyDisplayUnit || 'um';
  const formatValue = (value) => {
    const digits = key() === 'nm' ? 1 : key() === 'mm' ? 7 : 4;
    return String(Number(Number(value).toFixed(digits)));
  };
  return {
    key,
    label: () => unitMeta(key()).label,
    formatValue,
    format: (value) => formatValue(fromMicron(value, key())),
    canonicalInput: (value) => String(fromMicron(value, key())),
    parse: (value) => toMicron(value, key()),
    toDisplay: (value) => fromMicron(value, key()),
    labelText: (label) => label.replace(/µm/g, unitMeta(key()).label),
  };
}
// Convert typed polygon vertices on a unit switch, including drafts in an open editor.
// Retain punctuation and invalid tokens so validation remains with the Draw controller.
export function convertPolygonPointUnits(text, previous, unit) {
  return text.replace(
    /(^|[,\s])([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)(?=$|[,\s])/gm,
    (match, separator, value) => {
      const physical = toMicron(value, previous);
      const converted = fromMicron(physical, unit);
      // Reject overflow rather than introducing Infinity into an editable mask
      // vertex. The Draw controller remains responsible for input validation.
      return Number.isFinite(physical) && Number.isFinite(converted)
        ? separator + String(converted)
        : match;
    },
  );
}
export function syncDisplayUnitFields(root, unit) {
  for (const control of root.querySelectorAll('[data-display-length]')) {
    const previous = control.dataset.displayLength;
    if (previous === unit) continue;
    if (control.value !== '' && Number.isFinite(Number(control.value))) {
      const physical = toMicron(control.value, previous);
      const converted = fromMicron(physical, unit);
      if (Number.isFinite(physical) && Number.isFinite(converted))
        control.value = String(converted);
    }
    control.dataset.displayLength = unit;
    control.step = unit === 'nm' ? '0.1' : unit === 'mm' ? '0.0000001' : '0.0001';
    const label = control.closest('label')?.querySelector('.wc-label');
    if (label) label.textContent = label.textContent.replace(/µm|nm|mm/g, unitMeta(unit).label);
  }
  for (const control of root.querySelectorAll('[data-display-points]')) {
    const previous = control.dataset.displayPoints;
    if (previous === unit) continue;
    control.value = convertPolygonPointUnits(control.value, previous, unit);
    control.dataset.displayPoints = unit;
    const label = control.closest('label')?.querySelector('.wc-label');
    if (label) label.textContent = label.textContent.replace(/µm|nm|mm/g, unitMeta(unit).label);
  }
}
