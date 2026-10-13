// Uses the shared Process Task lifecycle: progress, Abort, and result transfer.
const versionQuery = self.location.search || '';

self.onmessage = async (event) => {
  const { id, data, captures, warnings, historicalSections, historicalFailures } = event.data || {};
  if (!id) return;
  try {
    self.postMessage({ id, type: 'progress', stage: 'Generating offline report pages…' });
    const { buildProcessReportArchive } = await import(
      new URL(`./process-report.js${versionQuery}`, self.location.href).href
    );
    const report = buildProcessReportArchive(data, {
      captures,
      warnings,
      historicalSections,
      historicalFailures,
    });
    self.postMessage({ id, type: 'progress', stage: 'Packaging report files…' });
    const arrayBuffer = await report.blob.arrayBuffer();
    self.postMessage(
      {
        id,
        type: 'done',
        arrayBuffer,
        filename: report.filename,
        stepCount: report.stepCount,
        imageCount: report.imageCount,
        historicalImageCount: report.historicalImageCount,
        fileCount: report.fileCount,
      },
      [arrayBuffer],
    );
  } catch (error) {
    self.postMessage({
      id,
      type: 'error',
      message: error?.message || String(error || 'Report export failed.'),
    });
  }
};
