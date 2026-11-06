// RGB parsing for the Section Layers appearance editor. No model mutations.
export function hexToRgb(hex) {
  if (typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex)) return null;
  return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
}

export function rgbToHex(channels) {
  if (!Array.isArray(channels) || channels.length !== 3) return null;
  const values = channels.map((channel) => {
    if (typeof channel === 'number') return channel;
    if (typeof channel !== 'string' || !/^\d{1,3}$/.test(channel.trim())) return NaN;
    return Number(channel.trim());
  });
  if (values.some((value) => !Number.isInteger(value) || value < 0 || value > 255))
    return null;
  return '#' + values.map((value) => value.toString(16).padStart(2, '0')).join('').toUpperCase();
}
