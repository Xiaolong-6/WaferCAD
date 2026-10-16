// Portable, versioned and provenance-complete Assembly Workspace .wafercad.
// This is intentionally distinct from a v15 single-product Bond baseline.
// Source wafers occur once in the graph; active geometry is derived on import.
import { MAX_PROJECT_FILE_BYTES, DOWNLOAD_URL_REVOKE_DELAY_MS } from './project-io.js';
import { validateBondedAssemblyProject } from './wafer-assembly.js';
import { assemblyVariantProject, validateAssemblyVariantGraph } from './wafer-assembly-variants.js';

export const ASSEMBLY_WORKSPACE_FORMAT = 'WaferCAD-assembly-workspace';
export const ASSEMBLY_WORKSPACE_VERSION = 1;

export function parseAssemblyWorkspace(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid Assembly Workspace container.');
  }
  if (
    value.format !== ASSEMBLY_WORKSPACE_FORMAT ||
    value.version !== ASSEMBLY_WORKSPACE_VERSION
  ) {
    throw new Error('Unsupported Assembly Workspace format or version.');
  }
  if (
    Object.keys(value).length !== 3 ||
    !Object.keys(value).every((key) => ['format', 'version', 'variantGraph'].includes(key))
  ) {
    throw new Error('Assembly Workspace container has unrecognized fields.');
  }
  // The graph validator rebuilds every Bond branch and post-Bond Process
  // timeline. An invalid Recipe checksum, fork prefix or source aborts import.
  const graph = structuredClone(validateAssemblyVariantGraph(value.variantGraph));
  const project = assemblyVariantProject(graph);
  validateBondedAssemblyProject(project);
  return { graph, project };
}

export function serializeAssemblyWorkspace(graph, maxBytes = MAX_PROJECT_FILE_BYTES) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || maxBytes > MAX_PROJECT_FILE_BYTES) {
    throw new Error('Invalid Assembly Workspace size budget.');
  }
  const container = {
    format: ASSEMBLY_WORKSPACE_FORMAT,
    version: ASSEMBLY_WORKSPACE_VERSION,
    variantGraph: structuredClone(validateAssemblyVariantGraph(graph)),
  };
  // Full physical replay and source validation before any export bytes exist.
  parseAssemblyWorkspace(container);
  const text = JSON.stringify(container);
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new Error('Assembly Workspace exceeds the project-file size limit.');
  }
  return text;
}

export async function readAssemblyWorkspaceFile(file) {
  if (!file || !/\.wafercad$/i.test(file.name || '')) {
    throw new Error('Select an Assembly Workspace .wafercad file.');
  }
  if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > MAX_PROJECT_FILE_BYTES) {
    throw new Error('Assembly Workspace exceeds the project-file size limit.');
  }
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error('Assembly Workspace file is not valid JSON.');
  }
  if (parsed?.format !== ASSEMBLY_WORKSPACE_FORMAT) {
    throw new Error('Selected file is not an Assembly Workspace container.');
  }
  return parseAssemblyWorkspace(parsed);
}

export function downloadAssemblyWorkspace(
  graph,
  filename = 'wafercad-assembly-workspace.wafercad',
) {
  const text = serializeAssemblyWorkspace(graph);
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_URL_REVOKE_DELAY_MS);
  return { requested: true, filename, bytes: blob.size, format: ASSEMBLY_WORKSPACE_FORMAT };
}
