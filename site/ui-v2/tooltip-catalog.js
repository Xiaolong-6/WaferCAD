// Curated English copy for existing controls. Do not infer tooltips from every label.
(() => {
  const entries = Object.freeze({
    'shell.navigation': ['Workspace panel', 'Switch the editing panel without changing the current model.'],
    'shell.overview': ['Overview', 'Inspect multiple scientific views together.'],
    'shell.single': ['Single view', 'Show one scientific view at a time.'],
    'shell.split': ['Split views', 'Compare two scientific views side by side.'],
    'shell.view.main': ['Main', 'Inspect the plan view and set a process ROI or Section cut line.'],
    'shell.view.mask': ['Mask', 'Inspect imported or drawn mask geometry and its alignment.'],
    'shell.view.three': ['3D', 'Inspect the physical model in three dimensions.'],
    'shell.section': ['Section dock', 'Show or hide the physical A–B cross-section alongside the views.'],
    'shell.maximize': ['Maximize or restore', 'Expand this view or return it to the previous layout.'],
    'shell.panel.resize': ['Resize workflow panel', 'Drag to change panel width; use arrow keys when focused.'],
    'shell.section.resize': ['Resize Layers panel', 'Drag to change Layers width; use the left and right arrow keys when focused.'],
    'shell.more': ['More tools', 'Open the remaining tools that do not fit in this toolbar.'],
    'view.fit': ['Fit view', 'Fit the visible geometry inside this viewport.'],
    'view.pan': ['Pan', 'Drag to move the scientific view without changing the model.'],
    'view.zoom': ['Zoom', 'Drag to zoom the viewport. The physical model remains unchanged.'],
    'view.export': ['Export view', 'Export the currently displayed view using an available format.'],
    'main.face': ['Front / back view', 'Switch which substrate face is displayed in Main.'],
    'main.roi': ['Main ROI', 'Select a region of interest for inspection and process operations.'],
    'main.slice': ['Section A–B line', 'Draw or adjust the cut line used by the physical Section view.'],
    'main.slice.settings': ['Section line coordinates', 'Edit endpoints A and B with precise physical coordinates.'],
    'main.roi.settings': ['ROI settings', 'Edit the selected ROI shape, position and dimensions.'],
    'main.roi.clear': ['Clear Main ROI', 'Remove the Main region of interest without deleting material layers.'],
    'mask.source': ['Mask source', 'File uses imported mask geometry; Draw uses editable shapes made in WaferCAD.'],
    'mask.draw': ['Draw mask', 'Edit shapes in the Draw mask source; this does not modify an imported GDS/OAS file.'],
    'mask.draw.delete': ['Delete selected shape', 'Remove only the selected Draw shape. Select a shape first.'],
    'mask.draw.clear': ['Clear Draw shapes', 'Remove all shapes from the Draw mask source.'],
    'mask.draw.settings': ['Draw settings', 'Edit the selected mask shape and its geometry. Select a shape first.'],
    'mask.roi': ['Mask ROI', 'Choose a region within the Mask view for focused selection and export.'],
    'mask.roi.settings': ['Mask ROI settings', 'Precisely edit the mask ROI coordinates and dimensions.'],
    'mask.alignment': ['Mask alignment', 'Position, scale or rotate mask geometry relative to the substrate.'],
    'mask.opacity': ['Mask opacity', 'Adjust the visual mask overlay opacity without changing geometry.'],
    'mask.import': ['Import mask', 'Read layout geometry from a GDS/GDSII or OASIS file.'],
    'mask.cell': ['Select cell', 'Choose the active mask cell, including geometry in descendant cells.'],
    'mask.layer': ['Mask layer / datatype', 'Toggle mask geometry participation for this layer and datatype. Hover also highlights corresponding geometry.'],
    'three.rotate': ['Rotate 3D', 'Drag to orbit the camera around the physical structure.'],
    'three.pan': ['Pan 3D', 'Drag to translate the 3D camera target.'],
    'three.zoom': ['Zoom 3D', 'Drag vertically to zoom the 3D camera; wheel zoom remains available.'],
    'three.quality': (node) => [
      '3D render mode',
      node.getAttribute('aria-label') === 'Fast'
        ? 'Fast is active for responsive interaction. Switch to Quality for higher visual detail.'
        : 'Quality is active for higher visual detail. Switch to Fast for responsive interaction.',
    ],
    'three.opacity': ['3D opacity', 'Change visualization transparency without altering physical layers.'],
    'three.borders': ['3D borders', 'Show or hide structural edge outlines. Model geometry is unchanged.'],
    'three.export.glb': ['Export physical GLB', 'Download the 3D structure in physical metres.'],
    'three.export.png': ['Capture 3D PNG', 'Export a 3× raster image of the current 3D view.'],
    'section.zbreak': ['Z Break', 'Compress or expand displayed vertical gaps in Section. Physical geometry is unchanged.'],
    'section.scale': ['XZ scale', 'Adjust cross-section viewing proportions, not physical dimensions.'],
    'section.detail': ['Section Detail ROI', 'Inspect a smaller region of the cross-section at higher magnification.'],
    'section.borders': ['Section borders', 'Toggle visualization outlines without changing material interfaces.'],
    'section.layers': ['Section Layers', 'Inspect, hide, rename or recolor displayed layers and annotations.'],
    'section.visibility': ['Layer visibility', 'Show or hide this item in visualization; it is not deleted.'],
    'section.profile': ['Annotation depth profile', 'Choose a smooth profile or one following the underlying surface offset.'],
    'section.legend.palette': ['Layer color palette', 'Apply a color palette to visible structure layers.'],
    'process.face': (node) => {
      const choice = node.value;
      if (choice === 'both') return ['Both faces', 'Run the operation on the front, then the back. Deposit creates two separate material layers.'];
      if (choice === 'back') return ['Back face', 'Apply the selected operation to the back of the substrate.'];
      return ['Front face', 'Apply the selected operation to the front of the substrate.'];
    },
    'process.area': (node) => {
      if (node.value === 'invert') return ['Invert Mask', 'Apply outside selected mask geometry, within the current process domain.'];
      if (node.value === 'full') return ['Whole face', 'Apply across the entire selected substrate face.'];
      return ['Selected Mask', 'Apply within the selected mask geometry.'];
    },
    'process.operation': ['Process operation', 'Select how the next fabrication step modifies or annotates the model.'],
    'process.thickness': (node) => [
      'Thickness / depth',
      node.dataset.helpContext === 'etch'
        ? 'Enter etch depth in the active display units.'
        : 'Enter the thickness or process depth in the active display units.',
    ],
    'process.apply': ['Apply Process Step', 'Execute this operation on the model and record it in History.'],
    'process.form.undo': ['Undo form edit', 'Undo an uncommitted change to Process fields. The physical model is unchanged.'],
    'process.form.redo': ['Redo form edit', 'Redo an uncommitted change to Process fields. The physical model is unchanged.'],
    'process.mode.manual': ['Manual process', 'Configure and apply one process step at a time.'],
    'process.mode.recipe': ['Recipe', 'Build and execute a sequence of fabrication operations.'],
    'process.mode.code': ['Code', 'Edit the process recipe using its code representation.'],
    'process.mode.diagnostics': ['Geometry diagnostics', 'Inspect model geometry for potential structural issues.'],
    'process.record': ['Add to Recipe', 'Also record the manual operation as a recipe step.'],
    'process.growth': ['Growth mode', 'Choose the geometry construction policy for this material growth step.'],
    'process.transfer': ['Transfer mode', 'Choose how the new material is positioned or propagated.'],
    'process.profile': ['Etch profile', 'Directional follows the specified direction; isotropic removes material in all exposed directions.'],
    'process.surface': ['Surface morphology', 'Select smooth, stochastic rough or pyramid-like etch surfaces.'],
    'process.implant.tilt': ['Implant tilt', 'Set the lateral tilt angle of the implantation direction.'],
    'process.rough.feature': ['Feature XY', 'Set the mean lateral size of roughness features.'],
    'process.rough.featurecv': ['Feature size CV', 'Set the coefficient of variation of roughness feature size, in percent.'],
    'process.rough.height': ['Height mean', 'Set the mean roughness height or etch depth as defined by the selected morphology.'],
    'process.rough.heightcv': ['Height CV', 'Set the coefficient of variation of feature height, in percent.'],
    'process.rough.polarity': ['Roughness orientation', 'Use peaks for positive relief or inverted pits for negative relief.'],
    'process.rough.seed': ['Random seed', 'Control reproducibility of the generated roughness distribution.'],
    'process.liftoff': ['Sacrificial layer', 'Choose the sacrificial material that is removed during lift-off.'],
    'project.base.rebuild': ['Rebuild Base', 'Apply changes to substrate dimensions. Confirm any impact on the existing process history.'],
    'project.base.revert': ['Revert Base changes', 'Restore the previously retained Base configuration, where available.'],
    'project.save': ['Save project', 'Save the editable WaferCAD workspace as a project file.'],
    'project.export': ['Export project', 'Download a portable project or supported geometry export.'],
    'project.units': ['XYZ display units', 'Change how physical coordinates are displayed; geometry is stored in canonical units.'],
    'history.undo': ['Undo process change', 'Undo the most recent supported model change, not merely a form field edit.'],
    'history.redo': ['Redo process change', 'Restore the most recently undone model change.'],
    'history.restore': ['Restore Step', 'Inspect this saved historical process state. Subsequent Apply may create a Variant.'],
    'history.head': ['Return to Variant HEAD', 'Restore the latest saved Step on the current Variant.'],
    'history.variant': ['Create Variant', 'Branch a separate process continuation from this historical Step.'],
    'history.continue': ['Continue from Step', 'Make this Step the Variant HEAD and remove later Steps. Confirmation is required.'],
    'history.delete.step': ['Delete last Step', 'Delete the HEAD Step and return to the preceding saved state.'],
    'history.delete.bookmark': ['Delete bookmark', 'Remove the bookmark label. The underlying Step remains restorable.'],
    'history.bookmark': ['Bookmark', 'Save a named reference to the current model state.'],
    'history.more': ['History actions', 'Open actions available for this Step, Variant or bookmark.'],
    'history.branch.switch': ['Switch Variant', 'Restore the latest saved Step on the selected Variant.'],
    'recovery.restore': ['Restore recovery', 'Load the selected saved recovery checkpoint into the current workspace.'],
    'recovery.clear': ['Clear Recovery', 'Delete available recovery checkpoints. This does not delete exported project files.'],
    'recovery.takeover': ['Take over storage', 'Claim workspace persistence ownership from another browser tab.'],
  });
  window.WaferCadV2TooltipCatalog = Object.freeze({
    has(key) { return Object.hasOwn(entries, key); },
    resolve(key, node) {
      const entry = entries[key];
      if (!entry) return null;
      const value = typeof entry === 'function' ? entry(node) : entry;
      return value && value.length === 2 ? value : null;
    },
    keys: Object.freeze(Object.keys(entries)),
  });
})();
