# Import and Export

[Home](Home) · [Examples and Modeling Limits](Examples-and-Modeling-Limits)

## Project format

~~~mermaid
flowchart LR
  Mask["File GDS/OAS or Draw"] --> Workspace[WaferCAD workspace]
  Workspace --> Project["Export .wafercad"]
  Project --> Restore[Open/import project]
  Workspace --> MaskExport["Mask export SVG/GDS/OAS"]
  Workspace --> ViewExport["Section/Main SVG, 3D PNG or GLB"]
~~~

*The portable project includes more than the exported mask or a single rendered view.*

WaferCAD exports portable `.wafercad` JSON projects, including vector material stacks, layers, masks, process history, variants, annotations, view settings, and Recipe. The current project schema is v14, with optional typed Recipe metadata. Compact files use a 0.1 nm grid; Export automatically falls back to lossless encoding when compact storage would alter physical Z/depth/profile lengths in current or restorable History states, or invalidate geometry. Autosave and Recovery remain lossless. Project schema is versioned and old formats are migrated only when supported; invalid files are rejected rather than silently loaded.

## Mask import

Open GDSII or OASIS with hierarchical Cells and Layer/Datatype selections. File source and Draw source remain separate. Imported coordinates are physical; a mask does not automatically fit the substrate.

## Mask export

Export SVG, GDSII or OASIS from the active Mask view. Select export scope as appropriate; **Mask ROI** restricts the geometry exported. When editing Draw shapes, verify the chosen source before exporting.

## View and geometry export

- **Main/Section** provide schematic SVG exports.
- **3D PNG** captures the inspected view.
- **GLB** exports the visible physical inspection geometry and respects an active Main ROI.
- GLB can embed deterministic rough/pyramid relief. Export mesh quality is constrained by a triangle budget and is not a TCAD mesh.

## Persistence safety

Save and Open validate project content, including size and geometry. The local Recovery cache is convenient for continuing browser work but cannot replace a downloaded project backup.

## Version compatibility

Some storage optimizations, especially canonical translation arrays, need newer readers. If an older build rejects a project, update the application; do not try to remove required array metadata manually.
