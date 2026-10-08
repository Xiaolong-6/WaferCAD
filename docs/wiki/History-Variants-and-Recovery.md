# History, Variants and Recovery

[Home](Home) · [Import and Export](Import-and-Export)

## History and snapshots

Each successful geometric Process step advances the model and may carry a replay descriptor. History enables revisiting saved states and comparing intermediate Section/3D views. **Record** inserts metadata into the chronological process without changing geometry. Named snapshots are inspection bookmarks; they should not substitute for actual fabrication steps.

## Variants

A Variant is a branch of the process lineage. A new path can preserve earlier History rather than destructively overwriting it. The same substrate can be the root of multiple fabrication alternatives.

When replacing a Base that already has history, the UI offers a choice to preserve the previous Main as a restorable Variant, clear history, or cancel. Clearing cannot be interpreted as archiving.

Clean History browsing preserves the Variant HEAD and does not create Recovery records. Genuine edits made while inspecting a historical Step remain protected before navigation or replacement. Recipe `snapshot()` is a structural bookmark change and participates in autosave even without a geometry operation.

## Save, Recovery and Export

- **Save** creates a local browser Recovery checkpoint.
- **Recovery** loads or manages locally stored checkpoints.
- **Export** writes a portable project file, generally `.wafercad`.
- **Import/Open** loads an exported project after schema validation.

A local browser cache is not guaranteed durable against storage clearance, browser-profile changes or device failure. Keep exported project files for archival research.

## Multi-tab editing

Two tabs can have different edit states. Watch for unsaved changes or takeover warnings before refreshing or switching tabs; export an independent copy before potentially destructive operations.

## Recipe and geometry replays

A saved Recipe runs real geometry operations again. Do not assume that running a Recipe twice is idempotent. Select the Base-rebuild option for a clean comparison when appropriate.
