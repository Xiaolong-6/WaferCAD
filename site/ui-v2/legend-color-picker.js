// Presentation-only HSV picker for the Section Layers Custom RGB draft.
import { hexToRgb, parseRgbChannel, rgbToHex } from './legend-rgb.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function hsvToRgb(h, s, v) {
  const hue = ((h % 360) + 360) % 360;
  const chroma = clamp(s, 0, 1) * clamp(v, 0, 1);
  const secondary = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const offset = clamp(v, 0, 1) - chroma;
  const channels =
    hue < 60
      ? [chroma, secondary, 0]
      : hue < 120
        ? [secondary, chroma, 0]
        : hue < 180
          ? [0, chroma, secondary]
          : hue < 240
            ? [0, secondary, chroma]
            : hue < 300
              ? [secondary, 0, chroma]
              : [chroma, 0, secondary];
  return channels.map((channel) => Math.round((channel + offset) * 255));
}

export function rgbToHsv(rgb) {
  const [red, green, blue] = rgb.map((value) => value / 255);
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  let hue = 0;
  if (delta !== 0) {
    if (maximum === red) hue = ((green - blue) / delta) % 6;
    else if (maximum === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    hue = (((hue * 60) % 360) + 360) % 360;
  }
  return [hue, maximum ? delta / maximum : 0, maximum];
}

export function createLegendColorPickerState(initialHex) {
  const initial = hexToRgb(initialHex);
  if (!initial) throw new TypeError('Expected a six-digit HEX color');
  let color = rgbToHex(initial);
  let hsv = rgbToHsv(initial);
  return {
    get hex() {
      return color;
    },
    get hsv() {
      return [...hsv];
    },
    setHex(hex) {
      const rgb = hexToRgb(hex);
      if (!rgb) return false;
      color = rgbToHex(rgb);
      hsv = rgbToHsv(rgb);
      return true;
    },
    setHsv(hue, saturation, brightness) {
      hsv = [
        ((Number(hue) % 360) + 360) % 360,
        clamp(Number(saturation), 0, 1),
        clamp(Number(brightness), 0, 1),
      ];
      color = rgbToHex(hsvToRgb(...hsv));
      return color;
    },
  };
}

// The caller owns the draft transaction and its two-stage OK -> Apply lifecycle.
export function bindLegendColorPicker(picker, { onChange }) {
  const state = createLegendColorPickerState(picker.dataset.pickerColor);
  const field = picker.querySelector('[data-picker-field]');
  const fieldMarker = picker.querySelector('.v2-legend-picker-marker');
  const brightness = picker.querySelector('[data-picker-brightness]');
  const brightnessMarker = picker.querySelector('.v2-legend-picker-brightness-marker');
  const newPreview = picker.querySelector('[data-picker-new]');
  const currentPreview = picker.querySelector('[data-picker-current]');
  const hexInput = picker.querySelector('[data-picker-hex]');
  const rgbInputs = [...picker.querySelectorAll('[data-picker-channel]')];
  const ok = picker.querySelector('.v2-legend-picker-ok');
  currentPreview.style.backgroundColor = picker.dataset.pickerCurrent;

  const sync = (source = null) => {
    const [hue, saturation, value] = state.hsv;
    const opacity = (1 - value).toFixed(5);
    field.style.background =
      'linear-gradient(rgba(0,0,0,' +
      opacity +
      '),rgba(0,0,0,' +
      opacity +
      ')),linear-gradient(to top,#fff,transparent),linear-gradient(to right,#f00 0%,#ff0 16.667%,#0f0 33.333%,#0ff 50%,#00f 66.667%,#f0f 83.333%,#f00 100%)';
    fieldMarker.style.left = (hue / 360) * 100 + '%';
    fieldMarker.style.top = (1 - saturation) * 100 + '%';
    brightness.style.background =
      'linear-gradient(to bottom,' + rgbToHex(hsvToRgb(hue, saturation, 1)) + ',#000)';
    brightnessMarker.style.top = (1 - value) * 100 + '%';
    brightness.setAttribute('aria-valuenow', String(Math.round(value * 100)));
    brightness.setAttribute('aria-valuetext', Math.round(value * 100) + '%');
    newPreview.style.backgroundColor = state.hex;
    if (source !== 'rgb') {
      const values = hexToRgb(state.hex);
      rgbInputs.forEach((input, index) => {
        input.value = values[index];
      });
    }
    if (source !== 'hex') hexInput.value = state.hex;
    rgbInputs.forEach((input) => input.setAttribute('aria-invalid', 'false'));
    hexInput.setAttribute('aria-invalid', 'false');
    ok.disabled = false;
    onChange(state.hex);
  };

  const bindPointer = (surface, update) => {
    surface.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      surface.setPointerCapture(event.pointerId);
      update(event);
    });
    surface.addEventListener('pointermove', (event) => {
      if (surface.hasPointerCapture(event.pointerId)) update(event);
    });
  };
  bindPointer(field, (event) => {
    const rect = field.getBoundingClientRect();
    const hue = clamp((event.clientX - rect.left) / rect.width, 0, 1) * 359.999;
    const saturation = 1 - clamp((event.clientY - rect.top) / rect.height, 0, 1);
    state.setHsv(hue, saturation, state.hsv[2]);
    sync();
  });
  bindPointer(brightness, (event) => {
    const rect = brightness.getBoundingClientRect();
    state.setHsv(
      ...state.hsv.slice(0, 2),
      1 - clamp((event.clientY - rect.top) / rect.height, 0, 1),
    );
    sync();
  });
  field.addEventListener('keydown', (event) => {
    const [h, s, v] = state.hsv;
    const step = event.shiftKey ? 10 : 1;
    if (event.key === 'ArrowLeft') state.setHsv(h - step, s, v);
    else if (event.key === 'ArrowRight') state.setHsv(h + step, s, v);
    else if (event.key === 'ArrowUp') state.setHsv(h, s + step / 100, v);
    else if (event.key === 'ArrowDown') state.setHsv(h, s - step / 100, v);
    else return;
    event.preventDefault();
    sync();
  });
  brightness.addEventListener('keydown', (event) => {
    const [h, s, v] = state.hsv;
    const step = event.shiftKey ? 0.1 : 0.01;
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') state.setHsv(h, s, v + step);
    else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') state.setHsv(h, s, v - step);
    else if (event.key === 'Home') state.setHsv(h, s, 0);
    else if (event.key === 'End') state.setHsv(h, s, 1);
    else return;
    event.preventDefault();
    sync();
  });
  rgbInputs.forEach((input) =>
    input.addEventListener('input', () => {
      const values = rgbInputs.map((field) => parseRgbChannel(field.value));
      rgbInputs.forEach((field, index) =>
        field.setAttribute('aria-invalid', String(values[index] === null)),
      );
      if (values.some((value) => value === null)) {
        ok.disabled = true;
        return;
      }
      state.setHex(rgbToHex(values));
      sync('rgb');
    }),
  );
  hexInput.addEventListener('input', () => {
    if (!state.setHex(hexInput.value)) {
      hexInput.setAttribute('aria-invalid', 'true');
      ok.disabled = true;
      return;
    }
    sync('hex');
  });
  sync();
}
