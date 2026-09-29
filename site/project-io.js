import { validateProjectFile } from "./project-schema.js";

const MAX_PROJECT_FILE_BYTES = 64 * 1024 * 1024;

export function downloadProject(project, filename = "wafercad-project.json") {
  validateProjectFile(project);
  const blob = new Blob([JSON.stringify(project)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function readProjectFile(file) {
  if (!file) throw new Error("No project file selected.");
  if (file.size > MAX_PROJECT_FILE_BYTES) {
    throw new Error("Project file is larger than the 64 MB safety limit.");
  }

  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error("Project file is not valid JSON.");
  }

  return validateProjectFile(parsed);
}
