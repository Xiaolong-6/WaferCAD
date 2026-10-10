# UI v2 DOM contract — M0 inventory

Audited main: `dc2cb2dbd9a7dca36b38070dd168063541767a5e`. Generated with `node scripts/ui-contract-extract.mjs`; verify with `--check`.

This inventories the legacy entry at the recorded main revision. IDs/ARIA/data attributes come from app.html; references are textual candidates across site and scripts (vendor excluded). JavaScript operations use the locked ESLint Espree parser. Runtime-site counts include ui-v2 previews and prototypes and exclude test-only evidence; they are not legacy-only counts. Computed classes/IDs are patterns or unresolved operations, not fabricated concrete names. This does not establish v2 coverage or runtime reachability.

## Counts

- staticIds: 267
- uniqueStaticIds: 267
- dataAttributes: 40
- roleAttributes: 17
- ariaControls: 7
- dynamicClasses: 215
- dynamicClassPatterns: 2
- dynamicOperations: 1116
- dynamicIdDeclarations: 60
- unresolvedOperations: 14

Duplicate static IDs: none. Missing static aria-controls targets: none.

## Static IDs and referencing files

| ID                          | Element / type   | Source line / parent           | Referencing files (count / first two; complete list in contract.json)     |
| --------------------------- | ---------------- | ------------------------------ | ------------------------------------------------------------------------- |
| workstationBootStyle        | style            | 8 / head                       | 1: site/app.html                                                          |
| workstationBootScreen       | div              | 80 / body                      | 3: site/app.html, site/app.js, …                                          |
| workstationBootMessage      | span             | 83 / div                       | 1: site/app.html                                                          |
| welcomeHomeLink             | a                | 88 / div                       | 2: site/app.html, site/tests/welcome-navigation.test.mjs                  |
| mainPanel                   | section          | 102 / main                     | 25: site/app.html, site/app.js, …                                         |
| mainFaceLabel               | span             | 104 / div                      | 2: site/app.html, site/controllers/workspace-view-controller.js           |
| sectionControlsBtn          | button / button  | 106 / div                      | 9: site/app.html, site/controllers/main-canvas-controller.js, …           |
| focusEditor                 | details          | 116 / div                      | 11: site/app.html, site/app.js, …                                         |
| clearRoiBtn                 | button / button  | 146 / div                      | 4: site/app.html, site/controllers/main-canvas-controller.js, …           |
| roiEditor                   | div              | 155 / div                      | 5: site/app.html, site/controllers/roi-controller.js, …                   |
| roiShapeLabel               | strong           | 157 / div                      | 4: site/app.html, site/controllers/roi-controller.js, …                   |
| roiUnitLabel                | span             | 157 / div                      | 3: site/app.html, site/controllers/roi-controller.js, …                   |
| roiRectFields               | div              | 159 / roiEditor                | 2: site/app.html, site/controllers/roi-controller.js                      |
| roiWidth                    | input / number   | 161 / label                    | 9: site/app.html, site/controllers/roi-controller.js, …                   |
| roiHeight                   | input / number   | 164 / label                    | 6: site/app.html, site/controllers/roi-controller.js, …                   |
| roiCircleFields             | div              | 167 / roiEditor                | 2: site/app.html, site/controllers/roi-controller.js                      |
| roiRadius                   | input / number   | 169 / label                    | 4: site/app.html, site/controllers/roi-controller.js, …                   |
| roiSectorFields             | div              | 172 / roiEditor                | 2: site/app.html, site/controllers/roi-controller.js                      |
| roiStartAngle               | input / number   | 175 / label                    | 4: site/app.html, site/controllers/roi-controller.js, …                   |
| roiEndAngle                 | input / number   | 178 / label                    | 4: site/app.html, site/controllers/roi-controller.js, …                   |
| roiAnchorSelect             | select           | 184 / label                    | 3: site/app.html, site/controllers/roi-controller.js, …                   |
| roiX                        | input / number   | 193 / label                    | 5: site/app.html, site/controllers/roi-controller.js, …                   |
| roiY                        | input / number   | 194 / label                    | 4: site/app.html, site/controllers/roi-controller.js, …                   |
| mainPanBtn                  | button / button  | 199 / div                      | 7: site/app.html, site/controllers/main-canvas-controller.js, …           |
| mainZoomFit                 | button           | 208 / div                      | 6: site/app.html, site/controllers/workspace-actions-controller.js, …     |
| mainZoomOut                 | button           | 214 / div                      | 5: site/app.html, site/controllers/workspace-actions-controller.js, …     |
| mainZoomIn                  | button           | 221 / div                      | 6: site/app.html, site/controllers/workspace-actions-controller.js, …     |
| mainExportSvgBtn            | button / button  | 231 / div                      | 5: site/app.html, site/controllers/workspace-actions-controller.js, …     |
| mainMaxBtn                  | button / button  | 234 / div                      | 4: site/app.html, site/controllers/view-toolbar-controller.js, …          |
| mainCanvas                  | canvas           | 245 / mainPanel                | 25: site/app.html, site/app.js, …                                         |
| mainCoords                  | div              | 246 / mainPanel                | 4: site/app.html, site/controllers/main-canvas-controller.js, …           |
| sectionEndpointHandles      | div              | 247 / mainPanel                | 5: site/app.html, site/controllers/main-canvas-controller.js, …           |
| sectionCoordsPanel          | div              | 267 / mainPanel                | 9: site/app.html, site/controllers/section-controls-controller.js, …      |
| sectionCoordUnit            | span             | 276 / div                      | 2: site/app.html, site/controllers/section-controls-controller.js         |
| sectionAx                   | input / number   | 281 / div                      | 8: site/app.html, site/controllers/section-controls-controller.js, …      |
| sectionAy                   | input / number   | 282 / div                      | 6: site/app.html, site/controllers/section-controls-controller.js, …      |
| sectionBx                   | input / number   | 284 / div                      | 7: site/app.html, site/controllers/section-controls-controller.js, …      |
| sectionBy                   | input / number   | 285 / div                      | 7: site/app.html, site/controllers/section-controls-controller.js, …      |
| maskPanel                   | section          | 290 / main                     | 24: site/app.html, site/app.js, …                                         |
| maskCellLabel               | span             | 292 / div                      | 4: site/app.html, site/controllers/draw-mask-controller.js, …             |
| maskSourceToggleBtn         | select           | 296 / label                    | 7: site/app.html, site/controllers/draw-mask-controller.js, …             |
| maskRoiEditor               | details          | 305 / div                      | 9: site/app.html, site/controllers/mask-roi-controller.js, …              |
| clearMaskRoiBtn             | button / button  | 320 / div                      | 2: site/app.html, site/controllers/mask-roi-controller.js                 |
| maskRoiFields               | div              | 322 / div                      | 4: site/app.html, site/controllers/mask-roi-controller.js, …              |
| maskRoiShapeLabel           | strong           | 324 / div                      | 3: site/app.html, site/controllers/mask-roi-controller.js, …              |
| maskRoiUnitLabel            | span             | 325 / div                      | 3: site/app.html, site/controllers/mask-roi-controller.js, …              |
| maskRoiRectFields           | div              | 327 / maskRoiFields            | 2: site/app.html, site/controllers/mask-roi-controller.js                 |
| maskRoiSize                 | input / number   | 329 / label                    | 5: site/app.html, site/controllers/mask-roi-controller.js, …              |
| maskRoiRotation             | input / number   | 333 / label                    | 3: site/app.html, site/controllers/mask-roi-controller.js, …              |
| maskRoiCircleFields         | div              | 336 / maskRoiFields            | 2: site/app.html, site/controllers/mask-roi-controller.js                 |
| maskRoiRadius               | input / number   | 339 / label                    | 2: site/app.html, site/controllers/mask-roi-controller.js                 |
| maskRoiAnchorSelect         | select           | 344 / label                    | 2: site/app.html, site/controllers/mask-roi-controller.js                 |
| maskRoiX                    | input / number   | 353 / label                    | 3: site/app.html, site/controllers/mask-roi-controller.js, …              |
| maskRoiY                    | input / number   | 354 / label                    | 3: site/app.html, site/controllers/mask-roi-controller.js, …              |
| maskOpacityValue            | output           | 369 / label                    | 4: site/app.html, site/app.js, …                                          |
| maskOpacityRange            | input / range    | 371 / div                      | 7: site/app.html, site/app.js, …                                          |
| maskZoomFit                 | button           | 381 / div                      | 5: site/app.html, site/controllers/workspace-actions-controller.js, …     |
| maskZoomOut                 | button           | 387 / div                      | 3: site/app.html, site/controllers/workspace-actions-controller.js, …     |
| maskZoomIn                  | button           | 394 / div                      | 3: site/app.html, site/controllers/workspace-actions-controller.js, …     |
| maskExportControl           | details          | 403 / div                      | 5: site/app.html, site/controllers/workspace-actions-controller.js, …     |
| maskExportFilterGroup       | div              | 406 / div                      | 2: site/app.html, site/controllers/export-controller.js                   |
| maskExportCells             | select           | 409 / label                    | 5: site/app.html, site/controllers/export-controller.js, …                |
| maskExportLayers            | select           | 418 / label                    | 5: site/app.html, site/controllers/export-controller.js, …                |
| maskExportDrawNote          | p                | 426 / div                      | 2: site/app.html, site/controllers/export-controller.js                   |
| maskExportSvgBtn            | button / button  | 430 / div                      | 4: site/app.html, site/controllers/workspace-actions-controller.js, …     |
| maskExportGdsBtn            | button / button  | 431 / div                      | 5: site/app.html, site/controllers/workspace-actions-controller.js, …     |
| maskExportOasBtn            | button / button  | 432 / div                      | 3: site/app.html, site/controllers/workspace-actions-controller.js, …     |
| maskMaxBtn                  | button / button  | 439 / div                      | 3: site/app.html, site/controllers/view-toolbar-controller.js, …          |
| maskCanvas                  | canvas           | 450 / maskPanel                | 21: site/app.html, site/app.js, …                                         |
| maskCoords                  | div              | 451 / maskPanel                | 4: site/app.html, site/controllers/draw-mask-controller.js, …             |
| drawMaskToolbar             | div              | 452 / maskPanel                | 6: site/app.html, site/controllers/draw-mask-controller.js, …             |
| drawMaskDeleteBtn           | button / button  | 487 / drawMaskToolbar          | 2: site/app.html, site/controllers/draw-mask-controller.js                |
| drawMaskClearBtn            | button / button  | 488 / drawMaskToolbar          | 2: site/app.html, site/controllers/draw-mask-controller.js                |
| drawMaskHint                | span             | 489 / drawMaskToolbar          | 3: site/app.html, site/controllers/draw-mask-controller.js, …             |
| drawShapeEditor             | div              | 491 / maskPanel                | 6: site/app.html, site/controllers/draw-mask-controller.js, …             |
| drawShapeEditorTitle        | strong           | 498 / div                      | 3: site/app.html, site/controllers/draw-mask-controller.js, …             |
| drawShapeEditorClose        | button / button  | 499 / div                      | 3: site/app.html, site/controllers/draw-mask-controller.js, …             |
| drawShapeEditorBody         | div              | 508 / drawShapeEditor          | 2: site/app.html, site/controllers/draw-mask-controller.js                |
| drawShapeEditorApply        | button / button  | 510 / div                      | 3: site/app.html, site/controllers/draw-mask-controller.js, …             |
| drawShapeEditorDelete       | button / button  | 513 / div                      | 2: site/app.html, site/controllers/draw-mask-controller.js                |
| threePanel                  | section          | 518 / main                     | 29: site/app.html, site/app.js, …                                         |
| threeStats                  | span             | 520 / div                      | 4: site/app.html, site/app.js, …                                          |
| threeFastBtn                | select           | 524 / label                    | 7: site/app.html, site/app.js, …                                          |
| threeBorderControl          | label            | 539 / div                      | 7: site/app.html, site/style.css, …                                       |
| threeBorders                | input / checkbox | 544 / threeBorderControl       | 10: site/app.html, site/app.js, …                                         |
| threeOpacityValue           | output           | 548 / label                    | 3: site/app.html, site/app.js, …                                          |
| threeOpacityRange           | input / range    | 550 / div                      | 13: site/app.html, site/app.js, …                                         |
| fit3dBtn                    | button           | 560 / div                      | 9: site/app.html, site/controllers/workspace-actions-controller.js, …     |
| threeExportModelBtn         | button / button  | 569 / div                      | 7: site/app.html, site/controllers/workspace-actions-controller.js, …     |
| threeExportCancelBtn        | button / button  | 572 / div                      | 3: site/app.html, site/controllers/workspace-actions-controller.js, …     |
| threeExportPngBtn           | button / button  | 580 / div                      | 3: site/app.html, site/controllers/workspace-actions-controller.js, …     |
| threeMaxBtn                 | button / button  | 592 / div                      | 7: site/app.html, site/controllers/view-toolbar-controller.js, …          |
| threeHost                   | div              | 603 / threePanel               | 37: site/app.html, site/app.js, …                                         |
| toolPanel                   | section          | 606 / main                     | 13: site/app.html, site/style.css, …                                      |
| settingsTab                 | button / button  | 608 / div                      | 5: site/app.html, site/tests/function-panel-feedback.test.mjs, …          |
| baseTab                     | button / button  | 619 / div                      | 2: site/app.html, site/tests/issue-13-settings-ui.test.mjs                |
| maskTab                     | button / button  | 631 / div                      | 1: site/app.html                                                          |
| operationTab                | button / button  | 643 / div                      | 2: site/app.html, site/tests/function-panel-feedback.test.mjs             |
| snapshotsTab                | button / button  | 655 / div                      | 2: site/app.html, site/style.css                                          |
| snapshotCount               | span             | 665 / snapshotsTab             | 3: site/app.html, site/controllers/project-controller.js, …               |
| baseTools                   | section          | 670 / div                      | 6: site/app.html, site/tests/issue-13-settings-ui.test.mjs, …             |
| baseSummary                 | span             | 679 / div                      | 2: site/app.html, site/controllers/workspace-view-controller.js           |
| substrateShape              | div              | 682 / div                      | 3: site/app.html, site/controllers/base-controls-controller.js, …         |
| baseWidthUnit               | b                | 690 / span                     | 3: site/app.html, site/controllers/workspace-actions-controller.js, …     |
| baseWidth                   | input / number   | 691 / label                    | 9: site/app.html, site/controllers/base-controls-controller.js, …         |
| baseHeightUnit              | b                | 694 / span                     | 3: site/app.html, site/controllers/workspace-actions-controller.js, …     |
| baseHeight                  | input / number   | 695 / label                    | 7: site/app.html, site/controllers/base-controls-controller.js, …         |
| baseThicknessUnit           | b                | 704 / span                     | 4: site/app.html, site/controllers/workspace-actions-controller.js, …     |
| baseThickness               | input / number   | 705 / label                    | 9: site/app.html, site/controllers/base-controls-controller.js, …         |
| applyBaseBtn                | button           | 709 / div                      | 7: site/app.html, site/controllers/base-controls-controller.js, …         |
| revertBaseBtn               | button           | 710 / div                      | 3: site/app.html, site/app.js, …                                          |
| maskTools                   | section          | 715 / div                      | 5: site/app.html, site/tests/wiki-manual.test.mjs, …                      |
| maskSummary                 | span             | 724 / div                      | 4: site/app.html, site/controllers/workspace-view-controller.js, …        |
| maskFileControls            | div              | 726 / maskTools                | 4: site/app.html, site/controllers/draw-mask-controller.js, …             |
| gdsInput                    | input / file     | 731 / label                    | 6: site/app.html, site/controllers/mask-import-controller.js, …           |
| sampleMaskSelect            | select           | 737 / div                      | 4: site/app.html, site/controllers/mask-import-controller.js, …           |
| cellTree                    | div              | 749 / section                  | 4: site/app.html, site/controllers/mask-browser-controller.js, …          |
| maskLayerList               | div              | 753 / section                  | 6: site/app.html, site/controllers/mask-browser-controller.js, …          |
| maskOffsetXUnit             | b                | 760 / span                     | 2: site/app.html, site/controllers/mask-import-controller.js              |
| maskOffsetX                 | input / number   | 761 / label                    | 3: site/app.html, site/controllers/mask-import-controller.js, …           |
| maskOffsetYUnit             | b                | 764 / span                     | 2: site/app.html, site/controllers/mask-import-controller.js              |
| maskOffsetY                 | input / number   | 765 / label                    | 3: site/app.html, site/controllers/mask-import-controller.js, …           |
| maskScale                   | input / number   | 768 / label                    | 3: site/app.html, site/controllers/mask-import-controller.js, …           |
| maskRotation                | input / number   | 771 / label                    | 3: site/app.html, site/controllers/mask-import-controller.js, …           |
| maskDrawInfo                | div              | 776 / maskTools                | 4: site/app.html, site/controllers/draw-mask-controller.js, …             |
| operationTools              | section          | 784 / div                      | 9: site/app.html, site/controllers/process-panel-controller.js, …         |
| processInputMode            | div              | 792 / operationTools           | 2: site/app.html, site/controllers/process-recipe-controller.js           |
| manualProcessPane           | div              | 812 / operationTools           | 6: site/app.html, site/controllers/process-recipe-controller.js, …        |
| operationType               | select           | 817 / label                    | 19: site/app.html, site/controllers/process-panel-controller.js, …        |
| faceToggleBtn               | select           | 829 / label                    | 6: site/app.html, site/controllers/workspace-actions-controller.js, …     |
| processSummary              | span             | 836 / div                      | 3: site/app.html, site/controllers/process-panel-controller.js, …         |
| processParametersHeading    | strong           | 839 / div                      | 4: site/app.html, site/controllers/process-panel-controller.js, …         |
| operationAreaRow            | label            | 843 / div                      | 5: site/app.html, site/controllers/process-panel-controller.js, …         |
| operationArea               | select           | 845 / operationAreaRow         | 15: site/app.html, site/controllers/process-panel-controller.js, …        |
| transferModeRow             | label            | 851 / div                      | 2: site/app.html, site/controllers/process-panel-controller.js            |
| transferMode                | select           | 853 / transferModeRow          | 17: site/advanced-process-operations.js, site/app.html, …                 |
| etchProfileRow              | label            | 858 / div                      | 3: site/app.html, site/controllers/process-panel-controller.js, …         |
| etchProfile                 | select           | 864 / etchProfileRow           | 33: site/advanced-process-operations.js, site/app.html, …                 |
| etchSurfaceRow              | label            | 869 / div                      | 3: site/app.html, site/controllers/process-panel-controller.js, …         |
| etchSurfaceMode             | select           | 871 / etchSurfaceRow           | 9: site/app.html, site/controllers/process-panel-controller.js, …         |
| implantTiltRow              | label            | 877 / div                      | 3: site/app.html, site/controllers/process-panel-controller.js, …         |
| implantTilt                 | input / number   | 883 / implantTiltRow           | 8: site/app.html, site/bundled-example-history.js, …                      |
| layerNameRow                | label            | 889 / div                      | 3: site/app.html, site/controllers/process-panel-controller.js, …         |
| layerName                   | input            | 891 / layerNameRow             | 14: site/app.html, site/controllers/process-panel-controller.js, …        |
| targetLayerRow              | label            | 893 / div                      | 4: site/app.html, site/controllers/process-panel-controller.js, …         |
| targetLayer                 | select           | 895 / targetLayerRow           | 6: site/app.html, site/controllers/process-panel-controller.js, …         |
| etchTargetLayerRow          | label            | 897 / div                      | 3: site/app.html, site/controllers/process-panel-controller.js, …         |
| etchTargetLayer             | select           | 903 / etchTargetLayerRow       | 11: site/app.html, site/controllers/process-panel-controller.js, …        |
| liftoffTargetRow            | label            | 907 / div                      | 4: site/app.html, site/controllers/process-panel-controller.js, …         |
| liftoffTargetLayer          | select           | 909 / liftoffTargetRow         | 6: site/app.html, site/controllers/process-panel-controller.js, …         |
| liftoffTargetHint           | small            | 914 / liftoffTargetRow         | 3: site/app.html, site/controllers/process-panel-controller.js, …         |
| implantNameRow              | label            | 916 / div                      | 5: site/app.html, site/controllers/process-panel-controller.js, …         |
| implantName                 | input            | 918 / implantNameRow           | 6: site/app.html, site/controllers/process-panel-controller.js, …         |
| electricalNameRow           | label            | 920 / div                      | 4: site/app.html, site/controllers/process-panel-controller.js, …         |
| electricalName              | input            | 922 / electricalNameRow        | 7: site/app.html, site/controllers/process-panel-controller.js, …         |
| growthModeRow               | label            | 924 / div                      | 5: site/app.html, site/controllers/process-panel-controller.js, …         |
| growthMode                  | select           | 926 / growthModeRow            | 13: site/app.html, site/controllers/process-panel-controller.js, …        |
| operationThicknessRow       | label            | 931 / div                      | 6: site/app.html, site/controllers/process-panel-controller.js, …         |
| processThicknessLabel       | b                | 932 / span                     | 3: site/app.html, site/controllers/process-panel-controller.js, …         |
| operationThickness          | input / number   | 933 / operationThicknessRow    | 16: site/app.html, site/controllers/process-panel-controller.js, …        |
| operationThicknessUnit      | b                | 934 / operationThicknessRow    | 5: site/app.html, site/controllers/workspace-actions-controller.js, …     |
| electricalRegionParams      | div              | 938 / div                      | 3: site/app.html, site/controllers/process-panel-controller.js, …         |
| electricalRegionType        | select           | 944 / label                    | 19: site/app.html, site/bundled-example-history.js, …                     |
| electricalRegionSource      | select           | 957 / label                    | 17: site/app.html, site/bundled-example-history.js, …                     |
| recordProcessParams         | div              | 966 / div                      | 3: site/app.html, site/controllers/process-panel-controller.js, …         |
| recordProcessType           | select           | 969 / label                    | 8: site/app.html, site/controllers/process-panel-controller.js, …         |
| recordProcessLabel          | input            | 980 / label                    | 7: site/app.html, site/controllers/process-panel-controller.js, …         |
| recordTemperature           | input / number   | 984 / label                    | 7: site/app.html, site/controllers/process-panel-controller.js, …         |
| recordDuration              | input / number   | 994 / label                    | 7: site/app.html, site/controllers/process-panel-controller.js, …         |
| recordAmbient               | input            | 1005 / label                   | 6: site/app.html, site/controllers/process-panel-controller.js, …         |
| recordNote                  | input            | 1013 / label                   | 6: site/app.html, site/controllers/process-panel-controller.js, …         |
| roughFeatureRow             | label            | 1018 / div                     | 5: site/app.html, site/controllers/process-panel-controller.js, …         |
| roughFeatureLabel           | b                | 1023 / span                    | 3: site/app.html, site/controllers/process-panel-controller.js, …         |
| roughFeatureSize            | input / number   | 1024 / roughFeatureRow         | 8: site/app.html, site/controllers/process-panel-controller.js, …         |
| roughFeatureUnit            | b                | 1025 / roughFeatureRow         | 4: site/app.html, site/controllers/workspace-actions-controller.js, …     |
| roughFeatureCvRow           | label            | 1027 / div                     | 5: site/app.html, site/controllers/process-panel-controller.js, …         |
| roughFeatureCv              | input / number   | 1033 / roughFeatureCvRow       | 6: site/app.html, site/controllers/process-panel-controller.js, …         |
| roughHeightRow              | label            | 1046 / div                     | 5: site/app.html, site/controllers/process-panel-controller.js, …         |
| roughHeightLabel            | b                | 1051 / span                    | 3: site/app.html, site/controllers/process-panel-controller.js, …         |
| roughAmplitude              | input / number   | 1052 / roughHeightRow          | 8: site/app.html, site/controllers/process-panel-controller.js, …         |
| roughHeightUnit             | b                | 1053 / roughHeightRow          | 4: site/app.html, site/controllers/workspace-actions-controller.js, …     |
| roughHeightCvRow            | label            | 1055 / div                     | 5: site/app.html, site/controllers/process-panel-controller.js, …         |
| roughHeightCv               | input / number   | 1061 / roughHeightCvRow        | 6: site/app.html, site/controllers/process-panel-controller.js, …         |
| roughPolarityRow            | label            | 1074 / div                     | 3: site/app.html, site/controllers/process-panel-controller.js, …         |
| roughPolarity               | select           | 1080 / roughPolarityRow        | 7: site/app.html, site/controllers/process-panel-controller.js, …         |
| roughSeedRow                | label            | 1085 / div                     | 3: site/app.html, site/controllers/process-panel-controller.js, …         |
| roughSeed                   | input / number   | 1091 / roughSeedRow            | 4: site/app.html, site/controllers/process-panel-controller.js, …         |
| recipeRecordManual          | input / checkbox | 1106 / label                   | 5: site/app.html, site/controllers/process-recipe-controller.js, …        |
| applyOperationBtn           | button           | 1110 / div                     | 19: site/app.html, site/app.js, …                                         |
| undoBtn                     | button           | 1111 / div                     | 6: site/app.html, site/app.js, …                                          |
| redoBtn                     | button           | 1119 / div                     | 6: site/app.html, site/app.js, …                                          |
| processVisualGuide          | details          | 1128 / div                     | 5: site/app.html, site/controllers/process-panel-controller.js, …         |
| processGuideOperation       | span             | 1134 / strong                  | 2: site/app.html, site/controllers/process-panel-controller.js            |
| processGuideTitle           | strong           | 1141 / div                     | 3: site/app.html, site/controllers/process-panel-controller.js, …         |
| processGuideEffect          | span             | 1142 / div                     | 2: site/app.html, site/controllers/process-panel-controller.js            |
| processGuideLink            | a                | 1144 / processVisualGuide      | 5: site/app.html, site/controllers/process-panel-controller.js, …         |
| processGuideBefore          | div              | 1158 / div                     | 2: site/app.html, site/controllers/process-panel-controller.js            |
| processGuideAfter           | div              | 1163 / div                     | 2: site/app.html, site/controllers/process-panel-controller.js            |
| processGuideSummary         | p                | 1166 / processVisualGuide      | 2: site/app.html, site/controllers/process-panel-controller.js            |
| processGuideArea            | small            | 1167 / processVisualGuide      | 2: site/app.html, site/controllers/process-panel-controller.js            |
| operationNote               | p                | 1170 / processVisualGuide      | 3: site/app.html, site/controllers/process-panel-controller.js, …         |
| recipeProcessPane           | div              | 1176 / operationTools          | 4: site/app.html, site/controllers/process-recipe-controller.js, …        |
| geometryDiagnosticsPanel    | section          | 1177 / operationTools          | 3: site/app.html, site/controllers/process-recipe-controller.js, …        |
| geometryDiagnosticsTitle    | strong           | 1185 / div                     | 1: site/app.html                                                          |
| diagnosticsAnalyzeBtn       | button / button  | 1193 / div                     | 3: site/app.html, site/controllers/process-diagnostics-controller.js, …   |
| diagnosticsStatus           | p                | 1196 / div                     | 3: site/app.html, site/controllers/process-diagnostics-controller.js, …   |
| diagnosticsResults          | div              | 1204 / div                     | 3: site/app.html, site/controllers/process-diagnostics-controller.js, …   |
| snapshotsTools              | section          | 1209 / div                     | 6: site/app.html, site/workstation-ui.js, …                               |
| snapshotList                | div              | 1218 / div                     | 2: site/app.html, site/controllers/project-controller.js                  |
| settingsTools               | section          | 1222 / div                     | 8: site/app.html, site/tests/issue-13-settings-ui.test.mjs, …             |
| projectNameInput            | input / text     | 1232 / label                   | 11: site/app.html, site/app.js, …                                         |
| newProjectBtn               | button           | 1242 / div                     | 8: site/app.html, site/controllers/project-controller.js, …               |
| openProjectInput            | input / file     | 1246 / label                   | 17: site/app.html, site/controllers/project-controller.js, …              |
| saveProjectBtn              | button           | 1248 / div                     | 7: site/app.html, site/controllers/workspace-persistence-controller.js, … |
| exportProjectBtn            | button           | 1255 / div                     | 14: site/app.html, site/controllers/project-controller.js, …              |
| workspaceRecoverySelect     | select           | 1266 / label                   | 6: site/app.html, site/controllers/workspace-persistence-controller.js, … |
| workspaceRestoreBtn         | button / button  | 1270 / div                     | 4: site/app.html, site/controllers/workspace-persistence-controller.js, … |
| workspaceRecoveryClearBtn   | button / button  | 1273 / div                     | 5: site/app.html, site/controllers/workspace-persistence-controller.js, … |
| xyUnitSelect                | select           | 1291 / label                   | 10: site/app.html, site/controllers/workspace-actions-controller.js, …    |
| sectionPanel                | section          | 1302 / main                    | 22: site/app.html, site/app.js, …                                         |
| sectionMeta                 | span             | 1304 / div                     | 4: site/app.html, site/plan-renderers.js, …                               |
| sectionScaleModeBtn         | select           | 1308 / label                   | 8: site/app.html, site/controllers/workspace-actions-controller.js, …     |
| sectionCollapseAxisBtn      | button / button  | 1317 / div                     | 8: site/app.html, site/controllers/section-collapse-controller.js, …      |
| sectionBordersBtn           | button / button  | 1331 / div                     | 5: site/app.html, site/controllers/workspace-actions-controller.js, …     |
| sectionDetailRoiBtn         | button / button  | 1345 / div                     | 5: site/app.html, site/controllers/section-detail-roi-controller.js, …    |
| sectionExportSvgBtn         | button / button  | 1354 / div                     | 4: site/app.html, site/controllers/workspace-actions-controller.js, …     |
| sectionMaxBtn               | button / button  | 1359 / div                     | 5: site/app.html, site/controllers/view-toolbar-controller.js, …          |
| sectionBody                 | div              | 1370 / sectionPanel            | 5: site/app.html, site/controllers/section-collapse-controller.js, …      |
| sectionCanvas               | canvas           | 1371 / sectionBody             | 29: site/app.html, site/app.js, …                                         |
| sectionRange                | span             | 1372 / sectionBody             | 4: site/app.html, site/plan-renderers.js, …                               |
| sectionCollapseOverlay      | div              | 1373 / sectionBody             | 5: site/app.html, site/controllers/section-collapse-controller.js, …      |
| sectionCollapseEditor       | dialog           | 1374 / sectionCollapseOverlay  | 6: site/app.html, site/controllers/section-collapse-controller.js, …      |
| sectionCollapseClose        | button / button  | 1386 / div                     | 5: site/app.html, site/controllers/section-collapse-controller.js, …      |
| sectionCollapseEnabled      | input / checkbox | 1396 / label                   | 7: site/app.html, site/controllers/section-collapse-controller.js, …      |
| sectionCollapseRuler        | div              | 1404 / div                     | 2: site/app.html, site/controllers/section-collapse-controller.js         |
| sectionCollapseWindow       | div              | 1409 / sectionCollapseRuler    | 2: site/app.html, site/controllers/section-collapse-controller.js         |
| sectionCollapseTopHandle    | button / button  | 1410 / sectionCollapseRuler    | 3: site/app.html, site/controllers/section-collapse-controller.js, …      |
| sectionCollapseBottomHandle | button / button  | 1416 / sectionCollapseRuler    | 2: site/app.html, site/controllers/section-collapse-controller.js         |
| sectionCollapseTopInput     | input / number   | 1426 / label                   | 5: site/app.html, site/controllers/section-collapse-controller.js, …      |
| sectionCollapseBottomInput  | input / number   | 1435 / label                   | 3: site/app.html, site/controllers/section-collapse-controller.js, …      |
| sectionCollapseTopValue     | span             | 1443 / div                     | 3: site/app.html, site/controllers/section-collapse-controller.js, …      |
| sectionCollapseBottomValue  | span             | 1444 / div                     | 2: site/app.html, site/controllers/section-collapse-controller.js         |
| sectionCollapseSnap         | input / checkbox | 1447 / label                   | 2: site/app.html, site/controllers/section-collapse-controller.js         |
| sectionCollapseScaleLinked  | input / checkbox | 1456 / label                   | 5: site/app.html, site/controllers/section-collapse-controller.js, …      |
| sectionCollapseFrontScale   | input / number   | 1462 / label                   | 4: site/app.html, site/controllers/section-collapse-controller.js, …      |
| sectionCollapseBackScale    | input / number   | 1476 / label                   | 4: site/app.html, site/controllers/section-collapse-controller.js, …      |
| sectionDetailRoiOverlay     | div              | 1497 / sectionBody             | 6: site/app.html, site/controllers/section-detail-roi-controller.js, …    |
| sectionDetailInset          | div              | 1528 / sectionBody             | 6: site/app.html, site/controllers/section-detail-roi-controller.js, …    |
| sectionDetailInsetHead      | div              | 1529 / sectionDetailInset      | 3: site/app.html, site/controllers/section-detail-roi-controller.js, …    |
| sectionDetailZoom           | span             | 1536 / div                     | 4: site/app.html, site/controllers/section-detail-roi-controller.js, …    |
| sectionDetailShapeBtn       | button / button  | 1539 / div                     | 3: site/app.html, site/controllers/section-detail-roi-controller.js, …    |
| sectionDetailCloseBtn       | button / button  | 1547 / div                     | 3: site/app.html, site/controllers/section-detail-roi-controller.js, …    |
| sectionDetailInsetCanvas    | canvas           | 1558 / sectionDetailInset      | 4: site/app.html, site/controllers/section-detail-roi-controller.js, …    |
| layerLegend                 | aside            | 1560 / sectionBody             | 16: site/app.html, site/controllers/layer-legend-controller.js, …         |
| processTaskDialog           | div              | 1565 / body                    | 8: site/app.html, site/controllers/process-task-controller.js, …          |
| processTaskTitle            | strong           | 1567 / div                     | 3: site/app.html, site/controllers/process-task-controller.js, …          |
| processTaskElapsed          | span             | 1568 / div                     | 5: site/app.html, site/controllers/process-task-controller.js, …          |
| processTaskStage            | div              | 1570 / processTaskDialog       | 6: site/app.html, site/controllers/process-task-controller.js, …          |
| processTaskAbortBtn         | button / button  | 1571 / processTaskDialog       | 4: site/app.html, site/controllers/process-task-controller.js, …          |
| workspaceConflictDialog     | div              | 1573 / body                    | 4: site/app.html, site/controllers/workspace-persistence-controller.js, … |
| workspaceTakeOverBtn        | button / button  | 1586 / workspaceConflictDialog | 4: site/app.html, site/controllers/workspace-persistence-controller.js, … |
| statusBar                   | footer           | 1588 / body                    | 3: site/app.html, site/controllers/feedback-controller.js, …              |
| statusText                  | span             | 1589 / statusBar               | 36: site/app.html, site/controllers/feedback-controller.js, …             |
| workspaceSaveStatus         | span             | 1591 / span                    | 8: site/app.html, site/controllers/workspace-persistence-controller.js, … |
| safeReloadBtn               | button / button  | 1595 / span                    | 5: site/app.html, site/app.js, …                                          |
| safeReloadSeparator         | span             | 1596 / span                    | 2: site/app.html, site/app.js                                             |
| buildCommit                 | a                | 1605 / span                    | 4: site/app.html, site/controllers/build-controller.js, …                 |

## data-* / role / aria-controls

| Source line / element           | Attribute               | Value                 |
| ------------------------------- | ----------------------- | --------------------- |
| 80 / workstationBootScreen      | role                    | status                |
| 106 / sectionControlsBtn        | aria-controls           | sectionCoordsPanel    |
| 122 / button                    | data-tool               | rect                  |
| 130 / button                    | data-tool               | circle                |
| 138 / button                    | data-tool               | sector                |
| 234 / mainMaxBtn                | data-view-panel         | mainPanel             |
| 248 / button                    | data-endpoint           | a                     |
| 257 / button                    | data-endpoint           | b                     |
| 267 / sectionCoordsPanel        | data-view-popover-panel |                       |
| 314 / button                    | data-tool               | rect                  |
| 317 / button                    | data-tool               | circle                |
| 439 / maskMaxBtn                | data-view-panel         | maskPanel             |
| 453 / button                    | data-draw-tool          |                       |
| 456 / button                    | data-draw-tool          | rect                  |
| 459 / button                    | data-draw-tool          | circle                |
| 462 / button                    | data-draw-tool          | polygon               |
| 470 / button                    | data-draw-tool          | ring                  |
| 478 / button                    | data-draw-tool          | ring-sector           |
| 491 / drawShapeEditor           | data-view-popover-panel |                       |
| 592 / threeMaxBtn               | data-view-panel         | threePanel            |
| 607 / div                       | role                    | tablist               |
| 608 / settingsTab               | role                    | tab                   |
| 608 / settingsTab               | aria-controls           | settingsTools         |
| 608 / settingsTab               | data-tool-tab           | settings              |
| 619 / baseTab                   | role                    | tab                   |
| 619 / baseTab                   | aria-controls           | baseTools             |
| 619 / baseTab                   | data-tool-tab           | base                  |
| 631 / maskTab                   | role                    | tab                   |
| 631 / maskTab                   | aria-controls           | maskTools             |
| 631 / maskTab                   | data-tool-tab           | mask                  |
| 643 / operationTab              | role                    | tab                   |
| 643 / operationTab              | aria-controls           | operationTools        |
| 643 / operationTab              | data-tool-tab           | operation             |
| 655 / snapshotsTab              | role                    | tab                   |
| 655 / snapshotsTab              | aria-controls           | snapshotsTools        |
| 655 / snapshotsTab              | data-tool-tab           | snapshots             |
| 670 / baseTools                 | role                    | tabpanel              |
| 670 / baseTools                 | data-tab-panel          | base                  |
| 683 / button                    | data-shape              | rect                  |
| 684 / button                    | data-shape              | circle                |
| 715 / maskTools                 | role                    | tabpanel              |
| 715 / maskTools                 | data-tab-panel          | mask                  |
| 784 / operationTools            | role                    | tabpanel              |
| 784 / operationTools            | data-tab-panel          | operation             |
| 797 / button                    | data-process-input-mode | manual                |
| 805 / button                    | data-process-input-mode | recipe                |
| 808 / button                    | data-process-input-mode | diagnostics           |
| 1177 / geometryDiagnosticsPanel | role                    | region                |
| 1196 / diagnosticsStatus        | role                    | status                |
| 1209 / snapshotsTools           | role                    | tabpanel              |
| 1209 / snapshotsTools           | data-tab-panel          | snapshots             |
| 1222 / settingsTools            | role                    | tabpanel              |
| 1222 / settingsTools            | data-tab-panel          | settings              |
| 1317 / sectionCollapseAxisBtn   | aria-controls           | sectionCollapseEditor |
| 1359 / sectionMaxBtn            | data-view-panel         | sectionPanel          |
| 1374 / sectionCollapseEditor    | data-view-popover-panel |                       |
| 1503 / button                   | data-detail-handle      | nw                    |
| 1509 / button                   | data-detail-handle      | ne                    |
| 1515 / button                   | data-detail-handle      | sw                    |
| 1521 / button                   | data-detail-handle      | se                    |
| 1565 / processTaskDialog        | role                    | dialog                |
| 1573 / workspaceConflictDialog  | role                    | dialog                |
| 1588 / statusBar                | data-level              | passive               |
| 1588 / statusBar                | role                    | status                |

## Dynamic classes

| Class or computed pattern        | Runtime creation/state sites (count / first two; complete list in contract.json)                                     |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| active                           | 30: site/controllers/base-controls-controller.js:42, site/controllers/base-controls-controller.js:43, …              |
| cell-caret                       | 1: site/controllers/mask-browser-controller.js:173                                                                   |
| cell-count                       | 1: site/controllers/mask-browser-controller.js:200                                                                   |
| cell-name                        | 1: site/controllers/mask-browser-controller.js:185                                                                   |
| cell-row                         | 1: site/controllers/mask-browser-controller.js:168                                                                   |
| circle                           | 1: site/controllers/section-detail-roi-controller.js:168                                                             |
| collapse-disabled                | 1: site/controllers/section-collapse-controller.js:171                                                               |
| compact-btn                      | 6: site/controllers/process-recipe-controller.js:346, site/controllers/process-recipe-controller.js:591, …           |
| compact-hint                     | 2: site/controllers/process-recipe-controller.js:346, site/controllers/process-recipe-controller.js:609              |
| compact-select                   | 1: site/controllers/process-recipe-controller.js:346                                                                 |
| complete                         | 2: site/controllers/process-recipe-controller.js:979, site/controllers/process-recipe-controller.js:1356             |
| confirmation-action              | 1: site/controllers/confirmation-dialog-controller.js:87                                                             |
| confirmation-actions             | 1: site/controllers/confirmation-dialog-controller.js:18                                                             |
| confirmation-copy                | 1: site/controllers/confirmation-dialog-controller.js:18                                                             |
| confirmation-detail              | 1: site/controllers/confirmation-dialog-controller.js:18                                                             |
| confirmation-dialog              | 1: site/controllers/confirmation-dialog-controller.js:18                                                             |
| confirmation-overlay             | 1: site/controllers/confirmation-dialog-controller.js:16                                                             |
| danger                           | 1: site/controllers/confirmation-dialog-controller.js:87                                                             |
| diagnostics-stale                | 3: site/controllers/process-diagnostics-controller.js:190, site/controllers/process-diagnostics-controller.js:204, … |
| dragging                         | 9: site/controllers/section-collapse-controller.js:220, site/controllers/section-collapse-controller.js:221, …       |
| draw-shape-editor-help           | 1: site/controllers/draw-mask-controller.js:129                                                                      |
| draw-shape-editor-row            | 2: site/controllers/draw-mask-controller.js:68, site/controllers/draw-mask-controller.js:82                          |
| electrical-hidden                | 1: site/controllers/layer-legend-controller.js:517                                                                   |
| electrical-legend-name           | 1: site/controllers/layer-legend-controller.js:534                                                                   |
| electrical-legend-row            | 1: site/controllers/layer-legend-controller.js:520                                                                   |
| electrical-region-chip           | 1: site/controllers/layer-legend-controller.js:524                                                                   |
| electrical-row-wrap              | 1: site/controllers/layer-legend-controller.js:516                                                                   |
| empty-list                       | 3: site/controllers/mask-browser-controller.js:152, site/controllers/mask-browser-controller.js:220, …               |
| error                            | 3: site/welcome.js:51, site/welcome.js:348, …                                                                        |
| failed                           | 1: site/controllers/process-recipe-controller.js:980                                                                 |
| has-image                        | 1: site/welcome.js:238                                                                                               |
| has-project-preview              | 1: site/welcome.js:235                                                                                               |
| has-thumbnail                    | 1: site/welcome.js:98                                                                                                |
| hidden                           | 21: site/controllers/process-panel-controller.js:194, site/controllers/process-panel-controller.js:195, …            |
| hint                             | 2: site/controllers/process-recipe-controller.js:346, site/controllers/process-recipe-controller.js:609              |
| history-bookmark-row             | 1: site/controllers/project-controller.js:281                                                                        |
| history-bookmarks-group          | 1: site/controllers/project-controller.js:635                                                                        |
| history-bookmarks-list           | 1: site/controllers/project-controller.js:646                                                                        |
| history-bookmarks-summary        | 1: site/controllers/project-controller.js:638                                                                        |
| history-legacy-bookmark-list     | 1: site/controllers/project-controller.js:917                                                                        |
| history-legacy-bookmarks         | 1: site/controllers/project-controller.js:913                                                                        |
| history-legacy-restore           | 1: site/controllers/project-controller.js:922                                                                        |
| history-step-row                 | 1: site/controllers/project-controller.js:513                                                                        |
| history-step-wrap                | 1: site/controllers/project-controller.js:509                                                                        |
| history-tree-root                | 1: site/controllers/project-controller.js:897                                                                        |
| history-variant                  | 1: site/controllers/project-controller.js:831                                                                        |
| history-variant-body             | 1: site/controllers/project-controller.js:839                                                                        |
| history-variant-editor           | 1: site/controllers/project-controller.js:731                                                                        |
| history-variant-head             | 1: site/controllers/project-controller.js:702                                                                        |
| history-variant-name             | 1: site/controllers/project-controller.js:711                                                                        |
| history-variant-rename-trigger   | 1: site/controllers/project-controller.js:725                                                                        |
| history-variant-stats            | 1: site/controllers/project-controller.js:720                                                                        |
| history-variant-toggle           | 1: site/controllers/project-controller.js:706                                                                        |
| implant-gradient-chip            | 1: site/controllers/layer-legend-controller.js:444                                                                   |
| implant-hidden                   | 1: site/controllers/layer-legend-controller.js:437                                                                   |
| implant-legend-name              | 1: site/controllers/layer-legend-controller.js:454                                                                   |
| implant-legend-row               | 1: site/controllers/layer-legend-controller.js:440                                                                   |
| implant-row-wrap                 | 1: site/controllers/layer-legend-controller.js:436                                                                   |
| is-maximized                     | 2: site/controllers/view-maximize-controller.js:18, site/controllers/view-maximize-controller.js:21                  |
| is-restorable                    | 1: site/controllers/project-controller.js:615                                                                        |
| is-unavailable                   | 1: site/controllers/project-controller.js:627                                                                        |
| layer-absent                     | 1: site/controllers/layer-legend-controller.js:349                                                                   |
| layer-count                      | 1: site/controllers/mask-browser-controller.js:259                                                                   |
| layer-hidden                     | 1: site/controllers/layer-legend-controller.js:350                                                                   |
| layer-name                       | 1: site/controllers/mask-browser-controller.js:255                                                                   |
| layer-row                        | 1: site/controllers/mask-browser-controller.js:228                                                                   |
| layer-swatch                     | 1: site/controllers/mask-browser-controller.js:251                                                                   |
| legend-color-chip                | 3: site/controllers/layer-legend-controller.js:357, site/controllers/layer-legend-controller.js:444, …               |
| legend-head                      | 1: site/controllers/layer-legend-controller.js:288                                                                   |
| legend-name                      | 3: site/controllers/layer-legend-controller.js:370, site/controllers/layer-legend-controller.js:454, …               |
| legend-palette-chip              | 3: site/controllers/layer-legend-controller.js:414, site/controllers/layer-legend-controller.js:494, …               |
| legend-palette-grid              | 3: site/controllers/layer-legend-controller.js:410, site/controllers/layer-legend-controller.js:490, …               |
| legend-palette-select            | 1: site/controllers/layer-legend-controller.js:298                                                                   |
| legend-profile-editor            | 1: site/controllers/layer-legend-controller.js:237                                                                   |
| legend-profile-label             | 1: site/controllers/layer-legend-controller.js:239                                                                   |
| legend-profile-option            | 1: site/controllers/layer-legend-controller.js:257                                                                   |
| legend-profile-options           | 1: site/controllers/layer-legend-controller.js:241                                                                   |
| legend-profile-trigger           | 1: site/controllers/layer-legend-controller.js:231                                                                   |
| legend-random                    | 1: site/controllers/layer-legend-controller.js:324                                                                   |
| legend-row                       | 3: site/controllers/layer-legend-controller.js:353, site/controllers/layer-legend-controller.js:440, …               |
| legend-row-wrap                  | 3: site/controllers/layer-legend-controller.js:347, site/controllers/layer-legend-controller.js:436, …               |
| legend-title                     | 1: site/controllers/layer-legend-controller.js:291                                                                   |
| legend-tools                     | 1: site/controllers/layer-legend-controller.js:295                                                                   |
| legend-visibility                | 3: site/controllers/layer-legend-controller.js:390, site/controllers/layer-legend-controller.js:472, …               |
| loading                          | 3: site/welcome.js:50, site/welcome.js:348, …                                                                        |
| mini-btn                         | 2: site/workstation-ui.js:582, site/workstation-ui.js:588                                                            |
| open                             | 3: site/workstation-ui.js:221, site/workstation-ui.js:263, …                                                         |
| p-panel-head                     | 1: site/ui-v2/real-view-bridge.js:208                                                                                |
| p-sprite                         | 2: site/ui-v2/prototypes/a-full/source/prototype-icons.js:38, site/ui-v2/view-icons.js:55                            |
| p-view                           | 1: site/ui-v2/real-view-bridge.js:206                                                                                |
| p-view-head                      | 1: site/ui-v2/real-view-bridge.js:208                                                                                |
| param-field                      | 1: site/controllers/process-recipe-controller.js:527                                                                 |
| param-grid-2                     | 1: site/controllers/process-recipe-controller.js:685                                                                 |
| plan-pan-active                  | 1: site/controllers/main-canvas-controller.js:39                                                                     |
| preview                          | 1: site/controllers/section-detail-roi-controller.js:169                                                             |
| preview-panning                  | 2: site/app.js:1577, site/app.js:1596                                                                                |
| primary                          | 2: site/controllers/confirmation-dialog-controller.js:87, site/controllers/process-recipe-controller.js:346          |
| process-busy                     | 1: site/app.js:1126                                                                                                  |
| process-history-body             | 1: site/controllers/project-controller.js:524                                                                        |
| process-history-marker           | 1: site/controllers/project-controller.js:520                                                                        |
| process-history-row              | 1: site/controllers/project-controller.js:513                                                                        |
| quiet                            | 1: site/controllers/process-recipe-controller.js:668                                                                 |
| ready                            | 3: site/welcome.js:51, site/welcome.js:347, …                                                                        |
| recipe-add-row                   | 1: site/controllers/process-recipe-controller.js:346                                                                 |
| recipe-code-actions              | 1: site/controllers/process-recipe-controller.js:346                                                                 |
| recipe-code-editor               | 1: site/controllers/process-recipe-controller.js:346                                                                 |
| recipe-code-pane                 | 1: site/controllers/process-recipe-controller.js:346                                                                 |
| recipe-execution                 | 1: site/controllers/process-recipe-controller.js:346                                                                 |
| recipe-history-actions           | 1: site/controllers/process-recipe-controller.js:346                                                                 |
| recipe-mask-context              | 1: site/controllers/process-recipe-controller.js:580                                                                 |
| recipe-name-input                | 1: site/controllers/process-recipe-controller.js:346                                                                 |
| recipe-options-row               | 1: site/controllers/process-recipe-controller.js:346                                                                 |
| recipe-progress                  | 1: site/controllers/process-recipe-controller.js:346                                                                 |
| recipe-run-actions               | 1: site/controllers/process-recipe-controller.js:346                                                                 |
| recipe-start-mode                | 1: site/controllers/process-recipe-controller.js:346                                                                 |
| recipe-step-copy                 | 1: site/controllers/process-recipe-controller.js:965                                                                 |
| recipe-step-editor               | 1: site/controllers/process-recipe-controller.js:346                                                                 |
| recipe-step-editor-actions       | 1: site/controllers/process-recipe-controller.js:636                                                                 |
| recipe-step-editor-head          | 1: site/controllers/process-recipe-controller.js:614                                                                 |
| recipe-step-num                  | 1: site/controllers/process-recipe-controller.js:964                                                                 |
| recipe-step-operation-field      | 1: site/controllers/process-recipe-controller.js:680                                                                 |
| recipe-step-row                  | 1: site/controllers/process-recipe-controller.js:961                                                                 |
| recipe-step-state                | 1: site/controllers/process-recipe-controller.js:981                                                                 |
| recipe-step-type-select          | 1: site/controllers/process-recipe-controller.js:629                                                                 |
| recipe-steps-list                | 1: site/controllers/process-recipe-controller.js:346                                                                 |
| recipe-template-actions          | 1: site/controllers/process-recipe-controller.js:346                                                                 |
| recipe-template-preview          | 1: site/controllers/process-recipe-controller.js:346                                                                 |
| recipe-template-preview-steps    | 1: site/controllers/process-recipe-controller.js:346                                                                 |
| recipe-toolbar                   | 1: site/controllers/process-recipe-controller.js:346                                                                 |
| recipe-validation                | 1: site/controllers/process-recipe-controller.js:346                                                                 |
| recipe-validation-${…}           | 1: site/controllers/process-recipe-controller.js:1049                                                                |
| recipe-validation-header         | 1: site/controllers/process-recipe-controller.js:346                                                                 |
| recipe-view-mode                 | 1: site/controllers/process-recipe-controller.js:346                                                                 |
| recipe-workflow-label            | 1: site/controllers/process-recipe-controller.js:346                                                                 |
| root                             | 1: site/controllers/mask-browser-controller.js:168                                                                   |
| running                          | 2: site/controllers/process-recipe-controller.js:1342, site/controllers/process-recipe-controller.js:1355            |
| section-collapse-ruler-tick      | 1: site/controllers/section-collapse-controller.js:121                                                               |
| section-detail-drawing           | 1: site/controllers/section-detail-roi-controller.js:33                                                              |
| section-dock-collapsed           | 1: site/workstation-ui.js:353                                                                                        |
| section-editing                  | 1: site/controllers/section-controls-controller.js:50                                                                |
| segmented                        | 1: site/controllers/process-recipe-controller.js:346                                                                 |
| selected                         | 1: site/controllers/mask-browser-controller.js:228                                                                   |
| snapshot-branch-empty            | 1: site/controllers/project-controller.js:884                                                                        |
| snapshot-branch-group            | 1: site/controllers/project-controller.js:831                                                                        |
| snapshot-continuation-banner     | 1: site/controllers/project-controller.js:140                                                                        |
| snapshot-continuation-context    | 1: site/controllers/project-controller.js:152                                                                        |
| snapshot-continuation-hint       | 1: site/controllers/project-controller.js:159                                                                        |
| snapshot-inline-editor           | 2: site/controllers/project-controller.js:302, site/controllers/project-controller.js:731                            |
| snapshot-milestone-body          | 1: site/controllers/project-controller.js:293                                                                        |
| snapshot-milestone-marker        | 1: site/controllers/project-controller.js:287                                                                        |
| snapshot-milestone-row           | 1: site/controllers/project-controller.js:281                                                                        |
| snapshot-more-menu               | 1: site/controllers/project-controller.js:227                                                                        |
| snapshot-more-popover            | 1: site/controllers/project-controller.js:256                                                                        |
| snapshot-more-trigger            | 1: site/controllers/project-controller.js:230                                                                        |
| snapshot-return-head             | 1: site/controllers/project-controller.js:182                                                                        |
| snapshot-timeline-row            | 1: site/controllers/project-controller.js:284                                                                        |
| three-loading                    | 3: site/three-view.js:206, site/three-view.js:2411, …                                                                |
| three-unavailable                | 2: site/three-view.js:207, site/three-view.js:2510                                                                   |
| three-unavailable-card           | 1: site/three-view.js:226                                                                                            |
| unavailable                      | 1: site/controllers/mask-browser-controller.js:228                                                                   |
| v2-${…}                          | 1: site/ui-v2/overlay-manager.js:31                                                                                  |
| v2-native-toolbar                | 1: site/ui-v2/real-view-bridge.js:115                                                                                |
| v2-real-view                     | 1: site/ui-v2/real-view-bridge.js:206                                                                                |
| view-maximized                   | 1: site/controllers/view-maximize-controller.js:20                                                                   |
| view-overflow-secondary          | 1: site/controllers/view-toolbar-controller.js:55                                                                    |
| wc-button                        | 1: site/ui-v2/real-view-bridge.js:215                                                                                |
| wc-icon                          | 3: site/ui-v2/gallery.html:287, site/ui-v2/prototypes/a-full/source/prototype-icons.js:52, …                         |
| wc-tree-caret                    | 1: site/ui-v2/gallery.html:489                                                                                       |
| welcome-example-body             | 1: site/welcome.js:243                                                                                               |
| welcome-example-card             | 1: site/welcome.js:229                                                                                               |
| welcome-example-image            | 1: site/welcome.js:63                                                                                                |
| welcome-example-image-caption    | 1: site/welcome.js:76                                                                                                |
| welcome-example-preview-start    | 1: site/welcome.js:127                                                                                               |
| welcome-example-project-fallback | 1: site/welcome.js:63                                                                                                |
| welcome-example-project-frame    | 1: site/welcome.js:116                                                                                               |
| welcome-example-project-loading  | 1: site/welcome.js:111                                                                                               |
| welcome-example-project-preview  | 1: site/welcome.js:95                                                                                                |
| welcome-example-project-stage    | 1: site/welcome.js:101                                                                                               |
| welcome-example-source-row       | 1: site/welcome.js:197                                                                                               |
| welcome-example-sources          | 1: site/welcome.js:192                                                                                               |
| welcome-example-summary-link     | 1: site/welcome.js:255                                                                                               |
| welcome-example-tag-more         | 1: site/welcome.js:291                                                                                               |
| welcome-example-tags             | 1: site/welcome.js:281                                                                                               |
| welcome-example-title-link       | 1: site/welcome.js:248                                                                                               |
| welcome-example-view-tab         | 1: site/welcome.js:149                                                                                               |
| welcome-example-view-tabs        | 1: site/welcome.js:137                                                                                               |
| welcome-example-visual           | 1: site/welcome.js:233                                                                                               |
| welcome-project-preview          | 1: site/app.js:71                                                                                                    |
| wide                             | 1: site/controllers/draw-mask-controller.js:82                                                                       |
| workstation-boot                 | 1: site/app.js:1719                                                                                                  |
| workstation-compact-ui           | 1: site/workstation-ui.js:279                                                                                        |
| workstation-layout-tab           | 2: site/workstation-ui.js:397, site/workstation-ui.js:414                                                            |
| workstation-legend-open          | 3: site/workstation-ui.js:281, site/workstation-ui.js:663, …                                                         |
| workstation-rail                 | 1: site/workstation-ui.js:363                                                                                        |
| workstation-rail-button          | 1: site/workstation-ui.js:369                                                                                        |
| workstation-rail-spacer          | 1: site/workstation-ui.js:380                                                                                        |
| workstation-section-active       | 1: site/workstation-ui.js:214                                                                                        |
| workstation-section-collapse     | 1: site/workstation-ui.js:588                                                                                        |
| workstation-section-collapsed    | 1: site/workstation-ui.js:354                                                                                        |
| workstation-section-label        | 1: site/workstation-ui.js:555                                                                                        |
| workstation-section-layers       | 1: site/workstation-ui.js:582                                                                                        |
| workstation-split-view-menu      | 1: site/workstation-ui.js:478                                                                                        |
| workstation-split-view-option    | 1: site/workstation-ui.js:481                                                                                        |
| workstation-split-view-selector  | 1: site/workstation-ui.js:475                                                                                        |
| workstation-tool-close           | 1: site/workstation-ui.js:531                                                                                        |
| workstation-tool-flyout          | 1: site/workstation-ui.js:516                                                                                        |
| workstation-tool-head            | 1: site/workstation-ui.js:520                                                                                        |
| workstation-tool-head-spacer     | 1: site/workstation-ui.js:529                                                                                        |
| workstation-tool-position        | 1: site/workstation-ui.js:526                                                                                        |
| workstation-tool-scroll-tail     | 1: site/workstation-ui.js:568                                                                                        |
| workstation-top-meta             | 1: site/workstation-ui.js:436                                                                                        |
| workstation-top-spacer           | 1: site/workstation-ui.js:439                                                                                        |
| workstation-ui-v2                | 1: site/workstation-ui.js:622                                                                                        |
| workstation-view-stage           | 1: site/workstation-ui.js:449                                                                                        |
| workstation-view-tab             | 3: site/workstation-ui.js:397, site/workstation-ui.js:406, …                                                         |
| workstation-view-tabs            | 1: site/workstation-ui.js:393                                                                                        |
| workstation-viewbar              | 1: site/workstation-ui.js:390                                                                                        |

## Dynamic IDs

Concrete dynamic IDs also include all referencing files/lines in contract.json; repeated declarations are conditional creation sites, not a claim of simultaneous duplicate nodes.

| Pattern (blank = unresolved) | Creation site                                             | Element where known |
| ---------------------------- | --------------------------------------------------------- | ------------------- |
| confirmationDialogOverlay    | site/controllers/confirmation-dialog-controller.js:15     | see source          |
| confirmationDialog           | site/controllers/confirmation-dialog-controller.js:18     | section             |
| confirmationDialogTitle      | site/controllers/confirmation-dialog-controller.js:18     | strong              |
| confirmationDialogMessage    | site/controllers/confirmation-dialog-controller.js:18     | p                   |
| confirmationDialogDetail     | site/controllers/confirmation-dialog-controller.js:18     | p                   |
| confirmationDialogActions    | site/controllers/confirmation-dialog-controller.js:18     | div                 |
|                              | site/controllers/draw-mask-controller.js:72               | see source          |
| drawShapePoints              | site/controllers/draw-mask-controller.js:86               | see source          |
| drawShapeCx                  | site/controllers/draw-mask-controller.js:115              | input               |
| drawShapeCy                  | site/controllers/draw-mask-controller.js:116              | input               |
| drawShapeWidth               | site/controllers/draw-mask-controller.js:117              | input               |
| drawShapeHeight              | site/controllers/draw-mask-controller.js:118              | input               |
| drawShapeCx                  | site/controllers/draw-mask-controller.js:122              | input               |
| drawShapeCy                  | site/controllers/draw-mask-controller.js:123              | input               |
| drawShapeRadius              | site/controllers/draw-mask-controller.js:124              | input               |
| drawShapeCx                  | site/controllers/draw-mask-controller.js:134              | input               |
| drawShapeCy                  | site/controllers/draw-mask-controller.js:135              | input               |
| drawShapeInnerRadius         | site/controllers/draw-mask-controller.js:136              | input               |
| drawShapeOuterRadius         | site/controllers/draw-mask-controller.js:137              | input               |
| drawShapeStartDeg            | site/controllers/draw-mask-controller.js:141              | input               |
| drawShapeEndDeg              | site/controllers/draw-mask-controller.js:142              | input               |
| recipeNameInput              | site/controllers/process-recipe-controller.js:346         | input               |
| recipeTemplateSelect         | site/controllers/process-recipe-controller.js:346         | select              |
| recipeTemplatePreview        | site/controllers/process-recipe-controller.js:346         | div                 |
| recipeTemplatePreviewTitle   | site/controllers/process-recipe-controller.js:346         | strong              |
| recipeTemplatePreviewDetail  | site/controllers/process-recipe-controller.js:346         | span                |
| recipeTemplatePreviewSteps   | site/controllers/process-recipe-controller.js:346         | ol                  |
| recipeTemplatePreviewWarning | site/controllers/process-recipe-controller.js:346         | p                   |
| recipeTemplateCancelBtn      | site/controllers/process-recipe-controller.js:346         | button              |
| recipeTemplateLoadBtn        | site/controllers/process-recipe-controller.js:346         | button              |
| recipeUndoBtn                | site/controllers/process-recipe-controller.js:346         | button              |
| recipeRedoBtn                | site/controllers/process-recipe-controller.js:346         | button              |
| recipeStepsTab               | site/controllers/process-recipe-controller.js:346         | button              |
| recipeCodeTab                | site/controllers/process-recipe-controller.js:346         | button              |
| recipeStepsPane              | site/controllers/process-recipe-controller.js:346         | div                 |
| recipeStepsList              | site/controllers/process-recipe-controller.js:346         | div                 |
| recipeAddKind                | site/controllers/process-recipe-controller.js:346         | select              |
| recipeAddStepBtn             | site/controllers/process-recipe-controller.js:346         | button              |
| recipeStepEditor             | site/controllers/process-recipe-controller.js:346         | div                 |
| recipeCodePane               | site/controllers/process-recipe-controller.js:346         | div                 |
| recipeCodeEditor             | site/controllers/process-recipe-controller.js:346         | textarea            |
| recipeApplyCodeBtn           | site/controllers/process-recipe-controller.js:346         | button              |
| recipeFormatCodeBtn          | site/controllers/process-recipe-controller.js:346         | button              |
| recipeValidateBtn            | site/controllers/process-recipe-controller.js:346         | button              |
| recipeValidation             | site/controllers/process-recipe-controller.js:346         | div                 |
| recipeProgress               | site/controllers/process-recipe-controller.js:346         | div                 |
| recipeProgressLabel          | site/controllers/process-recipe-controller.js:346         | span                |
| recipeProgressCount          | site/controllers/process-recipe-controller.js:346         | span                |
| recipeProgressBar            | site/controllers/process-recipe-controller.js:346         | progress            |
| recipeRunSummary             | site/controllers/process-recipe-controller.js:346         | p                   |
| recipeRunStart               | site/controllers/process-recipe-controller.js:346         | select              |
| recipeRunToBtn               | site/controllers/process-recipe-controller.js:346         | button              |
| recipeRunAllBtn              | site/controllers/process-recipe-controller.js:346         | button              |
| recipeStopBtn                | site/controllers/process-recipe-controller.js:346         | button              |
| recipeStepOperation          | site/controllers/process-recipe-controller.js:628         | see source          |
|                              | site/controllers/process-recipe-controller.js:662         | see source          |
|                              | site/ui-v2/overlay-manager.js:32                          | see source          |
| v2-${…}-portal-content       | site/ui-v2/overlay-manager.js:95                          | see source          |
| p-icon-${…}                  | site/ui-v2/prototypes/a-full/source/prototype-icons.js:41 | see source          |
| p-icon-${…}                  | site/ui-v2/view-icons.js:58                               | see source          |

## Dynamic structure and dataset sites

Every innerHTML assignment, createElement call, className/classList state change, dataset access, helper-class invocation and append/prepend/replace operation is recorded with the complete source expression in contract.json. No inferred parent is asserted for computed assembly. Review helper calls with variable arguments and unresolved operations before migrating a domain.

| Runtime module                                              | Operation count | Kinds                                                                                                                                                               |
| ----------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| site/app.html                                               | 7               | createElement, append, dataset                                                                                                                                      |
| site/app.js                                                 | 12              | dataset, classList.add, classList.toggle, classList.remove                                                                                                          |
| site/controllers/base-controls-controller.js                | 6               | classList.remove, classList.add, dataset                                                                                                                            |
| site/controllers/confirmation-dialog-controller.js          | 9               | createElement, className, innerHTML, append, replaceChildren, dataset                                                                                               |
| site/controllers/draw-mask-controller.js                    | 22              | createElement, className, append, replaceChildren, dataset, classList.toggle                                                                                        |
| site/controllers/export-controller.js                       | 8               | createElement, append, replaceChildren                                                                                                                              |
| site/controllers/feedback-controller.js                     | 1               | dataset                                                                                                                                                             |
| site/controllers/layer-legend-controller.js                 | 88              | createElement, className, classList.toggle, append, innerHTML                                                                                                       |
| site/controllers/main-canvas-controller.js                  | 2               | classList.toggle                                                                                                                                                    |
| site/controllers/mask-browser-controller.js                 | 30              | innerHTML, createElement, className, append                                                                                                                         |
| site/controllers/mask-import-controller.js                  | 2               | createElement, append                                                                                                                                               |
| site/controllers/mask-roi-controller.js                     | 3               | classList.remove, dataset, classList.toggle                                                                                                                         |
| site/controllers/process-diagnostics-controller.js          | 28              | createElement, className, replaceChildren, append, classList.add, classList.remove                                                                                  |
| site/controllers/process-panel-controller.js                | 29              | innerHTML, replaceChildren, dataset, classList.toggle                                                                                                               |
| site/controllers/process-recipe-controller.js               | 70              | createElement, className, dataset, innerHTML, replaceChildren, helper.make, append, classList.toggle, classList.add, classList.remove                               |
| site/controllers/project-controller.js                      | 125             | innerHTML, createElement, className, dataset, append, classList.add                                                                                                 |
| site/controllers/roi-controller.js                          | 3               | classList.remove, dataset, classList.toggle                                                                                                                         |
| site/controllers/section-collapse-controller.js             | 17              | dataset, createElement, className, append, classList.toggle, classList.remove, classList.add                                                                        |
| site/controllers/section-controls-controller.js             | 2               | classList.toggle                                                                                                                                                    |
| site/controllers/section-detail-roi-controller.js           | 7               | classList.toggle, classList.add, classList.remove, dataset                                                                                                          |
| site/controllers/tool-tabs-controller.js                    | 7               | dataset, classList.toggle                                                                                                                                           |
| site/controllers/view-maximize-controller.js                | 7               | classList.remove, classList.toggle, classList.add, dataset                                                                                                          |
| site/controllers/view-toolbar-controller.js                 | 7               | append, insertBefore, createElement, className, dataset                                                                                                             |
| site/controllers/workspace-persistence-controller.js        | 9               | dataset, replaceChildren, append                                                                                                                                    |
| site/controllers/workspace-view-controller.js               | 2               | classList.toggle, dataset                                                                                                                                           |
| site/index.html                                             | 6               | createElement, append                                                                                                                                               |
| site/plan-renderers.js                                      | 27              | createElement, dataset, classList.toggle                                                                                                                            |
| site/project-io.js                                          | 2               | createElement, append                                                                                                                                               |
| site/section-editor.js                                      | 5               | classList.remove, dataset, classList.add                                                                                                                            |
| site/three-view.js                                          | 148             | dataset, classList.remove, classList.add, createElement, className, append, replaceChildren, prepend                                                                |
| site/ui-v2/gallery.html                                     | 20              | createElement, className, append, createElementNS, classList.add, replaceChildren, dataset                                                                          |
| site/ui-v2/live-preview.js                                  | 4               | dataset                                                                                                                                                             |
| site/ui-v2/mock-domain-panels.js                            | 1               | innerHTML                                                                                                                                                           |
| site/ui-v2/mock-views.js                                    | 25              | createElementNS, append, dataset, replaceChildren                                                                                                                   |
| site/ui-v2/mock-workspace.js                                | 14              | createElement, append, dataset, replaceChildren                                                                                                                     |
| site/ui-v2/native-components.js                             | 6               | createElement, className, append, prepend                                                                                                                           |
| site/ui-v2/overlay-manager.js                               | 4               | createElement, className, append                                                                                                                                    |
| site/ui-v2/production-workspace.js                          | 4               | dataset, append                                                                                                                                                     |
| site/ui-v2/prototypes/a-full/index.html                     | 3               | dataset                                                                                                                                                             |
| site/ui-v2/prototypes/a-full/source/prototype-components.js | 3               | createElement, className, append                                                                                                                                    |
| site/ui-v2/prototypes/a-full/source/prototype-icons.js      | 10              | createElementNS, classList.add, append, prepend                                                                                                                     |
| site/ui-v2/prototypes/a-full/source/prototype.js            | 20              | createElementNS, append, dataset, replaceChildren                                                                                                                   |
| site/ui-v2/prototypes/a-history.html                        | 6               | dataset                                                                                                                                                             |
| site/ui-v2/prototypes/a-process.html                        | 6               | dataset                                                                                                                                                             |
| site/ui-v2/prototypes/a-recipe.html                         | 6               | dataset                                                                                                                                                             |
| site/ui-v2/prototypes/b-history.html                        | 6               | dataset                                                                                                                                                             |
| site/ui-v2/prototypes/b-process.html                        | 6               | dataset                                                                                                                                                             |
| site/ui-v2/prototypes/b-recipe.html                         | 6               | dataset                                                                                                                                                             |
| site/ui-v2/prototypes/c-history.html                        | 6               | dataset                                                                                                                                                             |
| site/ui-v2/prototypes/c-process.html                        | 6               | dataset                                                                                                                                                             |
| site/ui-v2/prototypes/c-recipe.html                         | 6               | dataset                                                                                                                                                             |
| site/ui-v2/real-three-controls.js                           | 1               | dataset                                                                                                                                                             |
| site/ui-v2/real-view-bridge.js                              | 31              | append, replaceChildren, classList.add, prepend, dataset, createElement                                                                                             |
| site/ui-v2/shell-preview.js                                 | 1               | dataset                                                                                                                                                             |
| site/ui-v2/view-icons.js                                    | 10              | createElementNS, classList.add, append, prepend                                                                                                                     |
| site/ui-v2/view-panel.js                                    | 5               | append, replaceChildren                                                                                                                                             |
| site/ui-v2/workstation-v2.js                                | 23              | append, replaceChildren, dataset                                                                                                                                    |
| site/welcome.js                                             | 88              | classList.add, classList.remove, dataset, createElement, className, append, classList.toggle, innerHTML                                                             |
| site/workstation-ui.js                                      | 98              | createElement, className, dataset, classList.toggle, classList.remove, classList.add, helper.makeButton, dataset.helper, append, prepend, insertBefore, replaceWith |

Known limits: helper arguments stored in variables, class maps, computed dataset keys and IDs assembled from live values need manual verification. Inline HTML JavaScript is parsed with original source line offsets; import maps are excluded. CSS content and scientific SVG classes are outside dynamic UI-class counts. The static parser ignores script/style text and never executes application code.
