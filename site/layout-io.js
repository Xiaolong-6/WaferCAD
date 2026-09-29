import { flattenGDS, parseGDS } from './gds.js';
import { isOASIS, parseOAS } from './oasis.js';

export async function parseLayoutFile(arrayBuffer, filename = '') {
  const oasisByMagic = isOASIS(arrayBuffer);
  const oasisByName = /\.(?:oas|oasis)$/i.test(filename);

  let parsed;
  let format;
  if (oasisByMagic || oasisByName) {
    parsed = await parseOAS(arrayBuffer);
    format = 'OASIS';
  } else {
    parsed = parseGDS(arrayBuffer);
    format = 'GDSII';
  }

  const layout = flattenGDS(parsed, parsed.root);
  layout.name = filename || format + ' layout';
  layout.units = parsed.units || layout.units;
  return { format, parsed, layout };
}
