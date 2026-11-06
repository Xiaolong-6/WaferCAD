// RGB parsing for the Section Layers appearance editor. No model mutations.
export function hexToRgb(hex) {
  if (typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex)) return null;
  return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
}

export function parseRgbChannel(channel) {
  if (typeof channel === 'number') {
    return Number.isInteger(channel) && channel >= 0 && channel <= 255 ? channel : null;
  }
  if (typeof channel !== 'string' || !/^\d{1,3}$/.test(channel.trim())) return null;
  const value = Number(channel.trim());
  return value <= 255 ? value : null;
}

export function rgbToHex(channels) {
  if (!Array.isArray(channels) || channels.length !== 3) return null;
  const values = channels.map(parseRgbChannel);
  if (values.some((value) => value === null)) return null;
  return (
    '#' +
    values
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}
