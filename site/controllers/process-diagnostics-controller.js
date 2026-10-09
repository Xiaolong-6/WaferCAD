function textNode(doc, tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  node.textContent = text;
  return node;
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '0';
  if (Math.abs(value) < 0.0001 || Math.abs(value) >= 1e8) return value.toExponential(3);
  return Number(value.toPrecision(6)).toLocaleString('en-US', { maximumFractionDigits: 7 });
}

function locationText(finding) {
  const values = [];
  if (finding.box) {
    const { minX, minY, maxX, maxY } = finding.box;
    values.push(
      `XY [${formatNumber(minX)}, ${formatNumber(maxX)}] × [${formatNumber(minY)}, ${formatNumber(maxY)}] µm`,
    );
  }
  if (Number.isFinite(finding.z0) && Number.isFinite(finding.z1))
    values.push(`Z [${formatNumber(finding.z0)}, ${formatNumber(finding.z1)}] µm`);
  if (Number.isFinite(finding.overlapAreaUm2))
    values.push(`overlap ${formatNumber(finding.overlapAreaUm2)} µm²`);
  if (Number.isFinite(finding.areaUm2))
    values.push(`uncovered ${formatNumber(finding.areaUm2)} µm²`);
  return values.join(' · ');
}

export function createProcessDiagnosticsController({ root = document, getModel }) {
  const $ = (id) => root.getElementById(id);
  const button = $('diagnosticsAnalyzeBtn');
  const results = $('diagnosticsResults');
  const status = $('diagnosticsStatus');
  let reportModel = null;
  let reportRevision = null;
  let jobModel = null;
  let jobRevision = null;
  let worker = null;
  let runId = 0;

  function signature(model) {
    return [model.revision, model.processRevision].join(':');
  }

  function stale() {
    const model = getModel();
    return reportModel !== model || reportRevision !== signature(model);
  }

  function render(report) {
    results.replaceChildren();
    const doc = root;
    const summary = textNode(
      doc,
      'div',
      'diagnostics-summary',
      `${report.errors} geometry error(s) · ${report.warnings} inspection warning(s) · ${report.gapCount} Z gap(s)`,
    );
    results.append(summary);
    const metrics = textNode(doc, 'div', 'diagnostics-metrics', '');
    for (const [label, value] of [
      ['Material volume', `${formatNumber(report.totalVolumeUm3)} µm³`],
      ['Material regions', formatNumber(report.regions)],
      ['Array instances', formatNumber(report.instanceCount)],
      ['Gap volume', `${formatNumber(report.gapVolumeUm3)} µm³`],
      ['XY through-voids', formatNumber(report.voidCount)],
      ['Numerical XY slits', formatNumber(report.crackCount)],
      ['Appearances', `${formatNumber(report.appearanceSegments)} render-only segments`],
    ]) {
      const item = textNode(doc, 'div', 'diagnostics-metric', '');
      item.append(textNode(doc, 'span', '', label), textNode(doc, 'strong', '', value));
      metrics.append(item);
    }
    results.append(metrics);
    const coverage =
      report.scope === 'array-templates'
        ? 'Array report: material volumes and region counts are weighted across all instances. XY ownership is checked inside each referenced template; seams between adjacent instances were not checked. Coordinates for array findings identify a representative instance.'
        : 'Full canonical model: XY ownership and Z intervals inspected.';
    results.append(textNode(doc, 'p', 'diagnostics-note', coverage));
    if (!report.checks.xyVoidClassification) {
      results.append(
        textNode(
          doc,
          'p',
          'diagnostics-caution',
          'XY void/crack scan incomplete or skipped due to geometry complexity. No claim is made about missing coverage.',
        ),
      );
    }
    if (!report.checks.xyOverlapWithinTemplate) {
      results.append(
        textNode(
          doc,
          'p',
          'diagnostics-caution',
          'Incomplete XY overlap scan: the complexity budget or a polygon error prevented complete verification. No clean geometry claim is made.',
        ),
      );
    }
    results.append(textNode(doc, 'h4', 'diagnostics-subtitle', 'Materials'));
    const layerList = textNode(doc, 'div', 'diagnostics-layer-list', '');
    for (const layer of report.layers) {
      const item = textNode(doc, 'div', 'diagnostics-layer', '');
      item.append(
        textNode(doc, 'span', 'diagnostics-layer-name', layer.name),
        textNode(doc, 'span', '', `${formatNumber(layer.volumeUm3)} µm³`),
        textNode(
          doc,
          'small',
          '',
          `Z thickness ${formatNumber(layer.minThicknessUm)}–${formatNumber(layer.maxThicknessUm)} µm`,
        ),
      );
      layerList.append(item);
    }
    if (!report.layers.length) layerList.append(textNode(doc, 'p', '', 'No material regions.'));
    results.append(layerList);

    results.append(textNode(doc, 'h4', 'diagnostics-subtitle', 'Findings'));
    const findings = textNode(doc, 'div', 'diagnostics-findings', '');
    for (const finding of report.findings) {
      const item = textNode(doc, 'div', `diagnostics-finding diagnostics-${finding.severity}`, '');
      item.append(textNode(doc, 'strong', '', finding.title));
      item.append(textNode(doc, 'p', '', finding.detail));
      const location = locationText(finding);
      if (location) item.append(textNode(doc, 'small', '', location));
      if (finding.occurrences > 1) {
        item.append(
          textNode(
            doc,
            'small',
            '',
            `${finding.occurrences} occurrences (representative bounds shown)`,
          ),
        );
      }
      findings.append(item);
    }
    if (!report.findings.length) {
      findings.append(
        textNode(
          doc,
          'p',
          'diagnostics-note',
          'No issues detected by the implemented checks. This does not validate the intended recipe or fabrication physics.',
        ),
      );
    }
    if (report.omittedFindings) {
      findings.append(
        textNode(
          doc,
          'p',
          'diagnostics-caution',
          `${report.omittedFindings} additional finding groups omitted from this bounded report.`,
        ),
      );
    }
    results.append(findings);
    results.append(
      textNode(
        doc,
        'p',
        'diagnostics-note',
        'Material volume is a sum over canonical intervals; invalid overlapping owners can double-count. A Z gap is an observation, not automatically a defect. Rough/Pyramid appearances and Implant/Electrical annotations are not solved physical microgeometry. No process chemistry, intentional connectivity or expected-thickness rule is inferred.',
      ),
    );
  }

  function releaseWorker() {
    if (!worker) return;
    worker.terminate();
    worker = null;
    jobModel = null;
    jobRevision = null;
    button.disabled = false;
  }

  function onModelRendered() {
    if (worker && (getModel() !== jobModel || signature(getModel()) !== jobRevision)) {
      runId += 1;
      releaseWorker();
      status.textContent = 'Model changed during analysis. Run Analyze again.';
    }
    if (reportModel && stale()) {
      status.textContent = 'Model changed. Results are out of date; analyze again.';
      results.classList.add('diagnostics-stale');
    }
  }

  function analyze() {
    runId += 1;
    const id = runId;
    releaseWorker();
    const model = getModel();
    const revision = signature(model);
    jobModel = model;
    jobRevision = revision;
    button.disabled = true;
    status.textContent = 'Analyzing canonical geometry…';
    results.classList.add('diagnostics-stale');
    try {
      const url = new URL('../process-diagnostics-worker.js', import.meta.url);
      url.search = new URL(import.meta.url).search;
      worker = new Worker(url);
      worker.onmessage = ({ data }) => {
        if (data?.id !== id) return;
        const current = getModel();
        releaseWorker();
        if (current !== model || signature(current) !== revision) {
          status.textContent = 'Model changed during analysis. Run Analyze again.';
          return;
        }
        if (data.type === 'done') {
          reportModel = model;
          reportRevision = signature(model);
          render(data.report);
          results.classList.remove('diagnostics-stale');
          status.textContent =
            data.report.checks.xyOverlapWithinTemplate && data.report.checks.xyVoidClassification
              ? 'Analysis complete · read-only'
              : 'Analysis partial · some geometry checks incomplete';
        } else {
          status.textContent = `Analysis failed: ${data.message || 'Unknown error'}`;
        }
      };
      worker.onerror = (error) => {
        if (id !== runId) return;
        releaseWorker();
        status.textContent = `Analysis failed: ${error.message || 'Worker error'}`;
      };
      worker.postMessage({ id, model });
    } catch (error) {
      releaseWorker();
      status.textContent = `Analysis unavailable: ${error.message}`;
    }
  }

  return {
    bind() {
      button?.addEventListener('click', analyze);
    },
    onModelRendered,
    dispose: releaseWorker,
  };
}
