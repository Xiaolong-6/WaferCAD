import assert from 'node:assert/strict';
import test from 'node:test';

import { historyOperationLabel } from '../history-operation-label.js';

test('History labels resolve renamed material and annotation entities by stable id', () => {
  const model = {
    layers: [
      { id: 'base', name: 'Base' },
      { id: 'layer-6', name: 'ITO' },
    ],
    implants: [{ id: 'implant-1', name: 'B contact' }],
    electricalRegions: [{ id: 'electrical-1', name: 'Inversion channel' }],
  };

  assert.equal(
    historyOperationLabel(
      {
        operation: {
          kind: 'add',
          label: 'Deposit Layer 6 · Directional · 0.2 µm',
          name: 'Layer 6',
          growth: 'direct',
          thickness: 0.2,
        },
        entityRefs: { resultLayerId: 'layer-6' },
      },
      model,
    ),
    'Deposit ITO · Directional · 0.2 µm',
  );

  assert.equal(
    historyOperationLabel(
      {
        operation: {
          kind: 'grow',
          label: 'Extend Layer 6 · Conformal · 0.05 µm',
          name: 'Layer 6',
          growth: 'conformal',
          thickness: 0.05,
        },
        entityRefs: { targetLayerId: 'layer-6' },
      },
      model,
    ),
    'Extend ITO · Conformal · 0.05 µm',
  );

  assert.equal(
    historyOperationLabel(
      {
        operation: {
          kind: 'implant',
          label: 'Implant Implant 1 · 0.1 µm',
          name: 'Implant 1',
          thickness: 0.1,
        },
        entityRefs: { resultImplantId: 'implant-1' },
      },
      model,
    ),
    'Implant B contact · 0.1 µm',
  );

  assert.equal(
    historyOperationLabel(
      {
        operation: {
          kind: 'electrical',
          label: 'Electrical Region 1 · inversion · 0.02 µm',
          name: 'Region 1',
          electricalRegionType: 'inversion',
          thickness: 0.02,
        },
        entityRefs: { resultElectricalRegionId: 'electrical-1' },
      },
      model,
    ),
    'Electrical Inversion channel · inversion · 0.02 µm',
  );
});

test('History label falls back to the recorded text when the referenced entity is unavailable', () => {
  const node = {
    operation: {
      kind: 'add',
      label: 'Deposit Legacy layer · Directional · 0.2 µm',
      name: 'Legacy layer',
      growth: 'direct',
      thickness: 0.2,
    },
    entityRefs: { resultLayerId: 'missing-layer' },
  };
  assert.equal(
    historyOperationLabel(node, { layers: [], implants: [], electricalRegions: [] }),
    'Deposit Legacy layer · Directional · 0.2 µm',
  );
});
