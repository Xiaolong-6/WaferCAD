import { KLAYOUT_SAMPLES, sampleById } from '../sample-layouts.js';

export function createMaskImportController({
  root = document,
  getMaskTransform,
  setMaskTransform,
  manualMicron,
  formatLengthField,
  formatNumericField,
  xyUnitLabel,
  importLayoutBuffer,
  openLayoutFile,
  renderMask,
  status,
  fetchImpl = fetch,
}) {
  const $ = (id) => root.getElementById(id);

  function populateSampleLayouts() {
    const select = $('sampleMaskSelect');
    if (!select || select.options.length > 1) return;
    for (const sample of KLAYOUT_SAMPLES) {
      const option = root.createElement('option');
      option.value = sample.id;
      option.textContent = sample.label;
      select.append(option);
    }
  }

  function syncTransformInputs() {
    const transform = getMaskTransform();
    $('maskOffsetX').value = formatLengthField(transform.x);
    $('maskOffsetY').value = formatLengthField(transform.y);
    $('maskOffsetXUnit').textContent = xyUnitLabel();
    $('maskOffsetYUnit').textContent = xyUnitLabel();
    $('maskScale').value = formatNumericField(transform.scale, 6);
    $('maskRotation').value = formatNumericField(transform.rotation, 3);
  }

  async function openSample(event) {
    const sample = sampleById(event.target.value);
    if (!sample) return;
    try {
      status(`Reading ${sample.label}…`);
      const response = await fetchImpl(sample.path);
      if (!response.ok) throw new Error(`sample request failed (${response.status})`);
      await importLayoutBuffer(await response.arrayBuffer(), sample.path, sample.label);
    } catch (error) {
      console.error(error);
      status(`Layout import failed: ${error.message}`);
    } finally {
      event.target.value = '';
    }
  }

  async function openFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    await openLayoutFile(file);
    event.target.value = '';
  }

  function updateTransform() {
    setMaskTransform({
      x: manualMicron($('maskOffsetX').value || 0),
      y: manualMicron($('maskOffsetY').value || 0),
      scale: Math.max(1e-8, Number($('maskScale').value) || 1),
      rotation: Number($('maskRotation').value) || 0,
    });
    renderMask();
  }

  function bind() {
    populateSampleLayouts();
    $('sampleMaskSelect').onchange = openSample;
    $('gdsInput').onchange = openFile;

    for (const id of ['maskOffsetX', 'maskOffsetY', 'maskScale', 'maskRotation']) {
      $(id).oninput = updateTransform;
      $(id).addEventListener('change', syncTransformInputs);
    }
  }

  return { bind, populateSampleLayouts, syncTransformInputs, updateTransform };
}
