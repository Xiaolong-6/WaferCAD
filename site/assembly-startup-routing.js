// Route Welcome imports by project ownership, never by filename alone.
// Full-workspace containers and bonded v15 projects must not be handed to the
// ordinary single-wafer snapshot/autosave writer.
export const ASSEMBLY_EDITOR_STARTUP_URL =
  './app.html?assemblyPreview=1&bondEdit=1&start=staged';
export const STANDARD_WORKSTATION_STARTUP_URL = './app.html?start=staged';

export function projectStartupTarget(document) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    return STANDARD_WORKSTATION_STARTUP_URL;
  }
  if (
    document.format === 'WaferCAD-assembly-workspace' ||
    (Object.hasOwn(document, 'waferAssembly') && document.waferAssembly != null)
  ) {
    // Even malformed assembly-like data must fail closed in its dedicated
    // validator, rather than silently migrating to ordinary History.
    return ASSEMBLY_EDITOR_STARTUP_URL;
  }
  return STANDARD_WORKSTATION_STARTUP_URL;
}

export async function welcomeProjectStartupTarget(file) {
  if (!file || !/\.wafercad$/i.test(file.name || '')) {
    return STANDARD_WORKSTATION_STARTUP_URL;
  }
  try {
    return projectStartupTarget(JSON.parse(await file.text()));
  } catch {
    // Preserve the existing normal Workstation error for malformed JSON.
    // Never guess Assembly semantics from a filename alone.
    return STANDARD_WORKSTATION_STARTUP_URL;
  }
}

export async function openStagedAssemblyProject(
  readStagedFile,
  readAssemblyFile,
) {
  const staged = await readStagedFile();
  if (!staged || staged.kind !== 'project' || !staged.file) {
    throw new Error('The staged Assembly file is unavailable; return to Welcome and retry.');
  }
  // This does not consume the staged file. Validation, editor creation,
  // Recovery writer setup and rendering must all succeed before deletion.
  return readAssemblyFile(staged.file, undefined, { allowStandalone: true });
}
