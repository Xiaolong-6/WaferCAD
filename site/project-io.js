import { migrateProjectFile, validateProjectFile } from './project-schema.js';

export const MAX_PROJECT_FILE_BYTES = 64 * 1024 * 1024;

export function serializeProject(project, maxBytes = MAX_PROJECT_FILE_BYTES) {
  validateProjectFile(project);
  const text = JSON.stringify(project);
  const bytes = new TextEncoder().encode(text).byteLength;
  if (bytes > maxBytes) {
    throw new Error(
      `Project file would be larger than the ${Math.round(maxBytes / (1024 * 1024))} MB safety limit.`,
    );
  }
  return text;
}

export function downloadProject(project, filename = 'wafercad-project.json') {
  const text = serializeProject(project);
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function readProjectFile(file) {
  if (!file) throw new Error('No project file selected.');
  if (file.size > MAX_PROJECT_FILE_BYTES) {
    throw new Error('Project file is larger than the 64 MB safety limit.');
  }

  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error('Project file is not valid JSON.');
  }

  return validateProjectFile(migrateProjectFile(parsed));
}
