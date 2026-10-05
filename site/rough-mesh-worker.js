const versionQuery = self.location.search || '';

let modulePromise = null;

function roughModule() {
  if (!modulePromise) {
    const url = new URL('./rough-mesh-geometry.js', self.location.href);
    url.search = versionQuery;
    modulePromise = import(url.href);
  }
  return modulePromise;
}

self.onmessage = async (event) => {
  const { id, generation, tasks, reportProgress = false } = event.data || {};
  if (!id || !Array.isArray(tasks)) return;

  try {
    const { roughMeshDataFromPreparedCap } = await roughModule();
    const results = [];
    const transfer = [];

    for (let index = 0; index < tasks.length; index++) {
      const task = tasks[index],
        data = roughMeshDataFromPreparedCap(task.geometry || {});
      results.push({
        taskId: task.taskId,
        data: {
          positions: data.positions,
          normals: data.normals,
          roughBorderPositions: data.roughBorderPositions,
          metadata: data.metadata,
        },
      });
      transfer.push(data.positions.buffer, data.normals.buffer, data.roughBorderPositions.buffer);
      if (reportProgress) {
        self.postMessage({
          id,
          type: 'progress',
          generation,
          completed: index + 1,
          total: tasks.length,
        });
      }
    }

    self.postMessage(
      {
        id,
        type: 'done',
        generation,
        results,
      },
      transfer,
    );
  } catch (error) {
    self.postMessage({
      id,
      type: 'error',
      generation,
      message: error?.message || String(error || 'Unknown rough mesh worker error'),
    });
  }
};
