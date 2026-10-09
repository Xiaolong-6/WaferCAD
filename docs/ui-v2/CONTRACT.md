# UI v2 DOM contract — M0 inventory

Audited main: `fbbb2f9f3a585574e20ed706c34653164f13440c`. Generated with `node scripts/ui-contract-extract.mjs`; verify with `--check`.

This inventories the legacy entry before v2 exists. IDs/ARIA/data attributes come from app.html; references are textual candidates across site and scripts (vendor excluded). JavaScript operations use the locked ESLint Espree parser. Counts separate runtime site code from test-only evidence. Computed classes/IDs are patterns or unresolved operations, not fabricated concrete names. This does not establish v2 coverage or runtime reachability.

## Counts

- staticIds: 259
- uniqueStaticIds: 259
- dataAttributes: 39
- roleAttributes: 15
- ariaControls: 7
- dynamicClasses: 205
- dynamicClassPatterns: 1
- dynamicOperations: 843
- dynamicIdDeclarations: 56
- unresolvedOperations: 5

Duplicate static IDs: none. Missing static aria-controls targets: none.

## Static IDs and referencing files

| ID                          | Element / type   | Source line / parent           | Referencing files (count / first two; complete list in contract.json)     |
| --------------------------- | ---------------- | ------------------------------ | ------------------------------------------------------------------------- |
| workstationBootStyle        | style            | 8 / head                       | 1: site/app.html                                                          |
| workstationBootScreen       | div              | 80 / body                      | 3: site/app.html, site/app.js, …                                          |
| workstationBootMessage      | span             | 83 / div                       | 1: site/app.html                                                          |
| welcomeHomeLink             | a                | 88 / div                       | 2: site/app.html, site/tests/welcome-navigation.test.mjs                  |
| mainPanel                   | section          | 102 / main                     | 21: site/app.html, site/app.js, …                                         |
| mainFaceLabel               | span             | 104 / div                      | 2: site/app.html, site/controllers/workspace-view-controller.js           |
| sectionControlsBtn          | button / button  | 106 / div                      | 8: site/app.html, site/controllers/main-canvas-controller.js, …           |
| focusEditor                 | details          | 116 / div                      | 9: site/app.html, site/app.js, …                                          |
| clearRoiBtn                 | button / button  | 146 / div                      | 4: site/app.html, site/controllers/main-canvas-controller.js, …           |
| roiEditor                   | div              | 155 / div                      | 5: site/app.html, site/controllers/roi-controller.js, …                   |
| roiShapeLabel               | strong           | 157 / div                      | 4: site/app.html, site/controllers/roi-controller.js, …                   |
| roiUnitLabel                | span             | 157 / div                      | 2: site/app.html, site/controllers/roi-controller.js                      |
| roiRectFields               | div              | 159 / roiEditor                | 2: site/app.html, site/controllers/roi-controller.js                      |
| roiWidth                    | input / number   | 161 / label                    | 4: site/app.html, site/controllers/roi-controller.js, …                   |
| roiHeight                   | input / number   | 164 / label                    | 4: site/app.html, site/controllers/roi-controller.js, …                   |
| roiCircleFields             | div              | 167 / roiEditor                | 2: site/app.html, site/controllers/roi-controller.js                      |
| roiRadius                   | input / number   | 169 / label                    | 3: site/app.html, site/controllers/roi-controller.js, …                   |
| roiSectorFields             | div              | 172 / roiEditor                | 2: site/app.html, site/controllers/roi-controller.js                      |
| roiStartAngle               | input / number   | 175 / label                    | 4: site/app.html, site/controllers/roi-controller.js, …                   |
| roiEndAngle                 | input / number   | 178 / label                    | 4: site/app.html, site/controllers/roi-controller.js, …                   |
| roiAnchorSelect             | select           | 184 / label                    | 3: site/app.html, site/controllers/roi-controller.js, …                   |
| roiX                        | input / number   | 193 / label                    | 3: site/app.html, site/controllers/roi-controller.js, …                   |
| roiY                        | input / number   | 194 / label                    | 3: site/app.html, site/controllers/roi-controller.js, …                   |
| mainPanBtn                  | button / button  | 199 / div                      | 6: site/app.html, site/controllers/main-canvas-controller.js, …           |
| mainZoomFit                 | button           | 208 / div                      | 5: site/app.html, site/controllers/workspace-actions-controller.js, …     |
| mainZoomOut                 | button           | 214 / div                      | 4: site/app.html, site/controllers/workspace-actions-controller.js, …     |
| mainZoomIn                  | button           | 221 / div                      | 5: site/app.html, site/controllers/workspace-actions-controller.js, …     |
| mainExportSvgBtn            | button / button  | 231 / div                      | 5: site/app.html, site/controllers/workspace-actions-controller.js, …     |
| mainMaxBtn                  | button / button  | 234 / div                      | 3: site/app.html, site/controllers/view-toolbar-controller.js, …          |
| mainCanvas                  | canvas           | 245 / mainPanel                | 22: site/app.html, site/app.js, …                                         |
| mainCoords                  | div              | 246 / mainPanel                | 3: site/app.html, site/controllers/main-canvas-controller.js, …           |
| sectionEndpointHandles      | div              | 247 / mainPanel                | 5: site/app.html, site/controllers/main-canvas-controller.js, …           |
| sectionCoordsPanel          | div              | 267 / mainPanel                | 9: site/app.html, site/controllers/section-controls-controller.js, …      |
| sectionCoordUnit            | span             | 276 / div                      | 2: site/app.html, site/controllers/section-controls-controller.js         |
| sectionAx                   | input / number   | 281 / div                      | 6: site/app.html, site/controllers/section-controls-controller.js, …      |
| sectionAy                   | input / number   | 282 / div                      | 4: site/app.html, site/controllers/section-controls-controller.js, …      |
| sectionBx                   | input / number   | 284 / div                      | 5: site/app.html, site/controllers/section-controls-controller.js, …      |
| sectionBy                   | input / number   | 285 / div                      | 5: site/app.html, site/controllers/section-controls-controller.js, …      |
| maskPanel                   | section          | 290 / main                     | 16: site/app.html, site/app.js, …                                         |
| maskCellLabel               | span             | 292 / div                      | 4: site/app.html, site/controllers/draw-mask-controller.js, …             |
| maskSourceToggleBtn         | select           | 296 / label                    | 7: site/app.html, site/controllers/draw-mask-controller.js, …             |
| maskRoiEditor               | details          | 305 / div                      | 7: site/app.html, site/controllers/mask-roi-controller.js, …              |
| clearMaskRoiBtn             | button / button  | 320 / div                      | 2: site/app.html, site/controllers/mask-roi-controller.js                 |
| maskRoiFields               | div              | 322 / div                      | 3: site/app.html, site/controllers/mask-roi-controller.js, …              |
| maskRoiShapeLabel           | strong           | 324 / div                      | 3: site/app.html, site/controllers/mask-roi-controller.js, …              |
| maskRoiUnitLabel            | span             | 325 / div                      | 2: site/app.html, site/controllers/mask-roi-controller.js                 |
| maskRoiRectFields           | div              | 327 / maskRoiFields            | 2: site/app.html, site/controllers/mask-roi-controller.js                 |
| maskRoiSize                 | input / number   | 329 / label                    | 4: site/app.html, site/controllers/mask-roi-controller.js, …              |
| maskRoiRotation             | input / number   | 333 / label                    | 3: site/app.html, site/controllers/mask-roi-controller.js, …              |
| maskRoiCircleFields         | div              | 336 / maskRoiFields            | 2: site/app.html, site/controllers/mask-roi-controller.js                 |
| maskRoiRadius               | input / number   | 339 / label                    | 2: site/app.html, site/controllers/mask-roi-controller.js                 |
| maskRoiAnchorSelect         | select           | 344 / label                    | 2: site/app.html, site/controllers/mask-roi-controller.js                 |
| maskRoiX                    | input / number   | 353 / label                    | 3: site/app.html, site/controllers/mask-roi-controller.js, …              |
| maskRoiY                    | input / number   | 354 / label                    | 3: site/app.html, site/controllers/mask-roi-controller.js, …              |
| maskOpacityValue            | output           | 369 / label                    | 4: site/app.html, site/app.js, …                                          |
| maskOpacityRange            | input / range    | 371 / div                      | 7: site/app.html, site/app.js, …                                          |
| maskZoomFit                 | button           | 381 / div                      | 3: site/app.html, site/controllers/workspace-actions-controller.js, …     |
| maskZoomOut                 | button           | 387 / div                      | 2: site/app.html, site/controllers/workspace-actions-controller.js        |
| maskZoomIn                  | button           | 394 / div                      | 2: site/app.html, site/controllers/workspace-actions-controller.js        |
| maskExportControl           | details          | 403 / div                      | 4: site/app.html, site/controllers/workspace-actions-controller.js, …     |
| maskExportFilterGroup       | div              | 406 / div                      | 2: site/app.html, site/controllers/export-controller.js                   |
| maskExportCells             | select           | 409 / label                    | 5: site/app.html, site/controllers/export-controller.js, …                |
| maskExportLayers            | select           | 418 / label                    | 5: site/app.html, site/controllers/export-controller.js, …                |
| maskExportDrawNote          | p                | 426 / div                      | 2: site/app.html, site/controllers/export-controller.js                   |
| maskExportSvgBtn            | button / button  | 430 / div                      | 4: site/app.html, site/controllers/workspace-actions-controller.js, …     |
| maskExportGdsBtn            | button / button  | 431 / div                      | 4: site/app.html, site/controllers/workspace-actions-controller.js, …     |
| maskExportOasBtn            | button / button  | 432 / div                      | 3: site/app.html, site/controllers/workspace-actions-controller.js, …     |
| maskMaxBtn                  | button / button  | 439 / div                      | 3: site/app.html, site/controllers/view-toolbar-controller.js, …          |
| maskCanvas                  | canvas           | 450 / maskPanel                | 17: site/app.html, site/app.js, …                                         |
| maskCoords                  | div              | 451 / maskPanel                | 3: site/app.html, site/controllers/draw-mask-controller.js, …             |
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
| threePanel                  | section          | 518 / main                     | 25: site/app.html, site/app.js, …                                         |
| threeStats                  | span             | 520 / div                      | 3: site/app.html, site/app.js, …                                          |
| threeFastBtn                | select           | 524 / label                    | 7: site/app.html, site/app.js, …                                          |
| threeBorderControl          | label            | 539 / div                      | 7: site/app.html, site/style.css, …                                       |
| threeBorders                | input / checkbox | 544 / threeBorderControl       | 10: site/app.html, site/app.js, …                                         |
| threeOpacityValue           | output           | 548 / label                    | 3: site/app.html, site/app.js, …                                          |
| threeOpacityRange           | input / range    | 550 / div                      | 13: site/app.html, site/app.js, …                                         |
| fit3dBtn                    | button           | 560 / div                      | 7: site/app.html, site/controllers/workspace-actions-controller.js, …     |
| threeExportModelBtn         | button / button  | 569 / div                      | 7: site/app.html, site/controllers/workspace-actions-controller.js, …     |
| threeExportCancelBtn        | button / button  | 572 / div                      | 3: site/app.html, site/controllers/workspace-actions-controller.js, …     |
| threeExportPngBtn           | button / button  | 580 / div                      | 3: site/app.html, site/controllers/workspace-actions-controller.js, …     |
| threeMaxBtn                 | button / button  | 592 / div                      | 6: site/app.html, site/controllers/view-toolbar-controller.js, …          |
| threeHost                   | div              | 603 / threePanel               | 28: site/app.html, site/app.js, …                                         |
| toolPanel                   | section          | 606 / main                     | 12: site/app.html, site/style.css, …                                      |
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
| baseWidth                   | input / number   | 691 / label                    | 7: site/app.html, site/controllers/base-controls-controller.js, …         |
| baseHeightUnit              | b                | 694 / span                     | 3: site/app.html, site/controllers/workspace-actions-controller.js, …     |
| baseHeight                  | input / number   | 695 / label                    | 6: site/app.html, site/controllers/base-controls-controller.js, …         |
| baseThicknessUnit           | b                | 704 / span                     | 4: site/app.html, site/controllers/workspace-actions-controller.js, …     |
| baseThickness               | input / number   | 705 / label                    | 8: site/app.html, site/controllers/base-controls-controller.js, …         |
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
| operationTools              | section          | 784 / div                      | 8: site/app.html, site/controllers/process-panel-controller.js, …         |
| processInputMode            | div              | 792 / operationTools           | 2: site/app.html, site/controllers/process-recipe-controller.js           |
| manualProcessPane           | div              | 809 / operationTools           | 6: site/app.html, site/controllers/process-recipe-controller.js, …        |
| operationType               | select           | 814 / label                    | 19: site/app.html, site/controllers/process-panel-controller.js, …        |
| faceToggleBtn               | select           | 825 / label                    | 6: site/app.html, site/controllers/workspace-actions-controller.js, …     |
| processSummary              | span             | 832 / div                      | 3: site/app.html, site/controllers/process-panel-controller.js, …         |
| processParametersHeading    | strong           | 835 / div                      | 4: site/app.html, site/controllers/process-panel-controller.js, …         |
| operationAreaRow            | label            | 839 / div                      | 5: site/app.html, site/controllers/process-panel-controller.js, …         |
| operationArea               | select           | 841 / operationAreaRow         | 15: site/app.html, site/controllers/process-panel-controller.js, …        |
| transferModeRow             | label            | 847 / div                      | 2: site/app.html, site/controllers/process-panel-controller.js            |
| transferMode                | select           | 849 / transferModeRow          | 15: site/advanced-process-operations.js, site/app.html, …                 |
| etchProfileRow              | label            | 854 / div                      | 3: site/app.html, site/controllers/process-panel-controller.js, …         |
| etchProfile                 | select           | 860 / etchProfileRow           | 27: site/advanced-process-operations.js, site/app.html, …                 |
| etchSurfaceRow              | label            | 865 / div                      | 3: site/app.html, site/controllers/process-panel-controller.js, …         |
| etchSurfaceMode             | select           | 867 / etchSurfaceRow           | 9: site/app.html, site/controllers/process-panel-controller.js, …         |
| implantTiltRow              | label            | 873 / div                      | 3: site/app.html, site/controllers/process-panel-controller.js, …         |
| implantTilt                 | input / number   | 879 / implantTiltRow           | 8: site/app.html, site/bundled-example-history.js, …                      |
| layerNameRow                | label            | 885 / div                      | 3: site/app.html, site/controllers/process-panel-controller.js, …         |
| layerName                   | input            | 887 / layerNameRow             | 14: site/app.html, site/controllers/process-panel-controller.js, …        |
| targetLayerRow              | label            | 889 / div                      | 4: site/app.html, site/controllers/process-panel-controller.js, …         |
| targetLayer                 | select           | 891 / targetLayerRow           | 6: site/app.html, site/controllers/process-panel-controller.js, …         |
| etchTargetLayerRow          | label            | 893 / div                      | 3: site/app.html, site/controllers/process-panel-controller.js, …         |
| etchTargetLayer             | select           | 899 / etchTargetLayerRow       | 11: site/app.html, site/controllers/process-panel-controller.js, …        |
| implantNameRow              | label            | 903 / div                      | 5: site/app.html, site/controllers/process-panel-controller.js, …         |
| implantName                 | input            | 905 / implantNameRow           | 6: site/app.html, site/controllers/process-panel-controller.js, …         |
| electricalNameRow           | label            | 907 / div                      | 4: site/app.html, site/controllers/process-panel-controller.js, …         |
| electricalName              | input            | 909 / electricalNameRow        | 7: site/app.html, site/controllers/process-panel-controller.js, …         |
| growthModeRow               | label            | 911 / div                      | 5: site/app.html, site/controllers/process-panel-controller.js, …         |
| growthMode                  | select           | 913 / growthModeRow            | 13: site/app.html, site/controllers/process-panel-controller.js, …        |
| operationThicknessRow       | label            | 918 / div                      | 5: site/app.html, site/controllers/process-panel-controller.js, …         |
| processThicknessLabel       | b                | 919 / span                     | 3: site/app.html, site/controllers/process-panel-controller.js, …         |
| operationThickness          | input / number   | 920 / operationThicknessRow    | 16: site/app.html, site/controllers/process-panel-controller.js, …        |
| operationThicknessUnit      | b                | 921 / operationThicknessRow    | 5: site/app.html, site/controllers/workspace-actions-controller.js, …     |
| electricalRegionParams      | div              | 925 / div                      | 3: site/app.html, site/controllers/process-panel-controller.js, …         |
| electricalRegionType        | select           | 931 / label                    | 17: site/app.html, site/bundled-example-history.js, …                     |
| electricalRegionSource      | select           | 944 / label                    | 15: site/app.html, site/bundled-example-history.js, …                     |
| recordProcessParams         | div              | 953 / div                      | 3: site/app.html, site/controllers/process-panel-controller.js, …         |
| recordProcessType           | select           | 956 / label                    | 8: site/app.html, site/controllers/process-panel-controller.js, …         |
| recordProcessLabel          | input            | 967 / label                    | 7: site/app.html, site/controllers/process-panel-controller.js, …         |
| recordTemperature           | input / number   | 971 / label                    | 7: site/app.html, site/controllers/process-panel-controller.js, …         |
| recordDuration              | input / number   | 981 / label                    | 7: site/app.html, site/controllers/process-panel-controller.js, …         |
| recordAmbient               | input            | 992 / label                    | 6: site/app.html, site/controllers/process-panel-controller.js, …         |
| recordNote                  | input            | 1000 / label                   | 6: site/app.html, site/controllers/process-panel-controller.js, …         |
| roughFeatureRow             | label            | 1005 / div                     | 5: site/app.html, site/controllers/process-panel-controller.js, …         |
| roughFeatureLabel           | b                | 1010 / span                    | 3: site/app.html, site/controllers/process-panel-controller.js, …         |
| roughFeatureSize            | input / number   | 1011 / roughFeatureRow         | 8: site/app.html, site/controllers/process-panel-controller.js, …         |
| roughFeatureUnit            | b                | 1012 / roughFeatureRow         | 4: site/app.html, site/controllers/workspace-actions-controller.js, …     |
| roughFeatureCvRow           | label            | 1014 / div                     | 5: site/app.html, site/controllers/process-panel-controller.js, …         |
| roughFeatureCv              | input / number   | 1020 / roughFeatureCvRow       | 6: site/app.html, site/controllers/process-panel-controller.js, …         |
| roughHeightRow              | label            | 1033 / div                     | 5: site/app.html, site/controllers/process-panel-controller.js, …         |
| roughHeightLabel            | b                | 1038 / span                    | 3: site/app.html, site/controllers/process-panel-controller.js, …         |
| roughAmplitude              | input / number   | 1039 / roughHeightRow          | 8: site/app.html, site/controllers/process-panel-controller.js, …         |
| roughHeightUnit             | b                | 1040 / roughHeightRow          | 4: site/app.html, site/controllers/workspace-actions-controller.js, …     |
| roughHeightCvRow            | label            | 1042 / div                     | 5: site/app.html, site/controllers/process-panel-controller.js, …         |
| roughHeightCv               | input / number   | 1048 / roughHeightCvRow        | 6: site/app.html, site/controllers/process-panel-controller.js, …         |
| roughPolarityRow            | label            | 1061 / div                     | 3: site/app.html, site/controllers/process-panel-controller.js, …         |
| roughPolarity               | select           | 1067 / roughPolarityRow        | 7: site/app.html, site/controllers/process-panel-controller.js, …         |
| roughSeedRow                | label            | 1072 / div                     | 3: site/app.html, site/controllers/process-panel-controller.js, …         |
| roughSeed                   | input / number   | 1078 / roughSeedRow            | 4: site/app.html, site/controllers/process-panel-controller.js, …         |
| recipeRecordManual          | input / checkbox | 1093 / label                   | 5: site/app.html, site/controllers/process-recipe-controller.js, …        |
| applyOperationBtn           | button           | 1097 / div                     | 18: site/app.html, site/app.js, …                                         |
| undoBtn                     | button           | 1098 / div                     | 6: site/app.html, site/app.js, …                                          |
| redoBtn                     | button           | 1106 / div                     | 6: site/app.html, site/app.js, …                                          |
| processVisualGuide          | details          | 1115 / div                     | 5: site/app.html, site/controllers/process-panel-controller.js, …         |
| processGuideOperation       | span             | 1121 / strong                  | 2: site/app.html, site/controllers/process-panel-controller.js            |
| processGuideTitle           | strong           | 1128 / div                     | 3: site/app.html, site/controllers/process-panel-controller.js, …         |
| processGuideEffect          | span             | 1129 / div                     | 2: site/app.html, site/controllers/process-panel-controller.js            |
| processGuideLink            | a                | 1131 / processVisualGuide      | 5: site/app.html, site/controllers/process-panel-controller.js, …         |
| processGuideBefore          | div              | 1145 / div                     | 2: site/app.html, site/controllers/process-panel-controller.js            |
| processGuideAfter           | div              | 1150 / div                     | 2: site/app.html, site/controllers/process-panel-controller.js            |
| processGuideSummary         | p                | 1153 / processVisualGuide      | 2: site/app.html, site/controllers/process-panel-controller.js            |
| processGuideArea            | small            | 1154 / processVisualGuide      | 2: site/app.html, site/controllers/process-panel-controller.js            |
| operationNote               | p                | 1157 / processVisualGuide      | 3: site/app.html, site/controllers/process-panel-controller.js, …         |
| recipeProcessPane           | div              | 1163 / operationTools          | 4: site/app.html, site/controllers/process-recipe-controller.js, …        |
| snapshotsTools              | section          | 1166 / div                     | 6: site/app.html, site/workstation-ui.js, …                               |
| snapshotList                | div              | 1175 / div                     | 2: site/app.html, site/controllers/project-controller.js                  |
| settingsTools               | section          | 1179 / div                     | 8: site/app.html, site/tests/issue-13-settings-ui.test.mjs, …             |
| projectNameInput            | input / text     | 1189 / label                   | 10: site/app.html, site/app.js, …                                         |
| newProjectBtn               | button           | 1199 / div                     | 8: site/app.html, site/controllers/project-controller.js, …               |
| openProjectInput            | input / file     | 1203 / label                   | 12: site/app.html, site/controllers/project-controller.js, …              |
| saveProjectBtn              | button           | 1205 / div                     | 7: site/app.html, site/controllers/workspace-persistence-controller.js, … |
| exportProjectBtn            | button           | 1212 / div                     | 14: site/app.html, site/controllers/project-controller.js, …              |
| workspaceRecoverySelect     | select           | 1223 / label                   | 6: site/app.html, site/controllers/workspace-persistence-controller.js, … |
| workspaceRestoreBtn         | button / button  | 1227 / div                     | 4: site/app.html, site/controllers/workspace-persistence-controller.js, … |
| workspaceRecoveryClearBtn   | button / button  | 1230 / div                     | 5: site/app.html, site/controllers/workspace-persistence-controller.js, … |
| xyUnitSelect                | select           | 1248 / label                   | 10: site/app.html, site/controllers/workspace-actions-controller.js, …    |
| sectionPanel                | section          | 1259 / main                    | 16: site/app.html, site/app.js, …                                         |
| sectionMeta                 | span             | 1261 / div                     | 4: site/app.html, site/plan-renderers.js, …                               |
| sectionScaleModeBtn         | select           | 1265 / label                   | 7: site/app.html, site/controllers/workspace-actions-controller.js, …     |
| sectionCollapseAxisBtn      | button / button  | 1274 / div                     | 6: site/app.html, site/controllers/section-collapse-controller.js, …      |
| sectionBordersBtn           | button / button  | 1288 / div                     | 5: site/app.html, site/controllers/workspace-actions-controller.js, …     |
| sectionDetailRoiBtn         | button / button  | 1302 / div                     | 4: site/app.html, site/controllers/section-detail-roi-controller.js, …    |
| sectionExportSvgBtn         | button / button  | 1311 / div                     | 4: site/app.html, site/controllers/workspace-actions-controller.js, …     |
| sectionMaxBtn               | button / button  | 1316 / div                     | 4: site/app.html, site/controllers/view-toolbar-controller.js, …          |
| sectionBody                 | div              | 1327 / sectionPanel            | 5: site/app.html, site/controllers/section-collapse-controller.js, …      |
| sectionCanvas               | canvas           | 1328 / sectionBody             | 22: site/app.html, site/app.js, …                                         |
| sectionRange                | span             | 1329 / sectionBody             | 3: site/app.html, site/plan-renderers.js, …                               |
| sectionCollapseOverlay      | div              | 1330 / sectionBody             | 4: site/app.html, site/controllers/section-collapse-controller.js, …      |
| sectionCollapseEditor       | dialog           | 1331 / sectionCollapseOverlay  | 4: site/app.html, site/controllers/section-collapse-controller.js, …      |
| sectionCollapseClose        | button / button  | 1343 / div                     | 4: site/app.html, site/controllers/section-collapse-controller.js, …      |
| sectionCollapseEnabled      | input / checkbox | 1353 / label                   | 6: site/app.html, site/controllers/section-collapse-controller.js, …      |
| sectionCollapseRuler        | div              | 1361 / div                     | 2: site/app.html, site/controllers/section-collapse-controller.js         |
| sectionCollapseWindow       | div              | 1366 / sectionCollapseRuler    | 2: site/app.html, site/controllers/section-collapse-controller.js         |
| sectionCollapseTopHandle    | button / button  | 1367 / sectionCollapseRuler    | 3: site/app.html, site/controllers/section-collapse-controller.js, …      |
| sectionCollapseBottomHandle | button / button  | 1373 / sectionCollapseRuler    | 2: site/app.html, site/controllers/section-collapse-controller.js         |
| sectionCollapseTopInput     | input / number   | 1383 / label                   | 5: site/app.html, site/controllers/section-collapse-controller.js, …      |
| sectionCollapseBottomInput  | input / number   | 1392 / label                   | 3: site/app.html, site/controllers/section-collapse-controller.js, …      |
| sectionCollapseTopValue     | span             | 1400 / div                     | 3: site/app.html, site/controllers/section-collapse-controller.js, …      |
| sectionCollapseBottomValue  | span             | 1401 / div                     | 2: site/app.html, site/controllers/section-collapse-controller.js         |
| sectionCollapseSnap         | input / checkbox | 1404 / label                   | 2: site/app.html, site/controllers/section-collapse-controller.js         |
| sectionCollapseScaleLinked  | input / checkbox | 1413 / label                   | 5: site/app.html, site/controllers/section-collapse-controller.js, …      |
| sectionCollapseFrontScale   | input / number   | 1419 / label                   | 4: site/app.html, site/controllers/section-collapse-controller.js, …      |
| sectionCollapseBackScale    | input / number   | 1433 / label                   | 4: site/app.html, site/controllers/section-collapse-controller.js, …      |
| sectionDetailRoiOverlay     | div              | 1454 / sectionBody             | 5: site/app.html, site/controllers/section-detail-roi-controller.js, …    |
| sectionDetailInset          | div              | 1485 / sectionBody             | 5: site/app.html, site/controllers/section-detail-roi-controller.js, …    |
| sectionDetailInsetHead      | div              | 1486 / sectionDetailInset      | 3: site/app.html, site/controllers/section-detail-roi-controller.js, …    |
| sectionDetailZoom           | span             | 1493 / div                     | 3: site/app.html, site/controllers/section-detail-roi-controller.js, …    |
| sectionDetailShapeBtn       | button / button  | 1496 / div                     | 3: site/app.html, site/controllers/section-detail-roi-controller.js, …    |
| sectionDetailCloseBtn       | button / button  | 1504 / div                     | 2: site/app.html, site/controllers/section-detail-roi-controller.js       |
| sectionDetailInsetCanvas    | canvas           | 1515 / sectionDetailInset      | 4: site/app.html, site/controllers/section-detail-roi-controller.js, …    |
| layerLegend                 | aside            | 1517 / sectionBody             | 12: site/app.html, site/controllers/layer-legend-controller.js, …         |
| processTaskDialog           | div              | 1522 / body                    | 8: site/app.html, site/controllers/process-task-controller.js, …          |
| processTaskTitle            | strong           | 1524 / div                     | 3: site/app.html, site/controllers/process-task-controller.js, …          |
| processTaskElapsed          | span             | 1525 / div                     | 5: site/app.html, site/controllers/process-task-controller.js, …          |
| processTaskStage            | div              | 1527 / processTaskDialog       | 6: site/app.html, site/controllers/process-task-controller.js, …          |
| processTaskAbortBtn         | button / button  | 1528 / processTaskDialog       | 4: site/app.html, site/controllers/process-task-controller.js, …          |
| workspaceConflictDialog     | div              | 1530 / body                    | 4: site/app.html, site/controllers/workspace-persistence-controller.js, … |
| workspaceTakeOverBtn        | button / button  | 1543 / workspaceConflictDialog | 4: site/app.html, site/controllers/workspace-persistence-controller.js, … |
| statusBar                   | footer           | 1545 / body                    | 3: site/app.html, site/controllers/feedback-controller.js, …              |
| statusText                  | span             | 1546 / statusBar               | 29: site/app.html, site/controllers/feedback-controller.js, …             |
| workspaceSaveStatus         | span             | 1548 / span                    | 8: site/app.html, site/controllers/workspace-persistence-controller.js, … |
| safeReloadBtn               | button / button  | 1552 / span                    | 5: site/app.html, site/app.js, …                                          |
| safeReloadSeparator         | span             | 1553 / span                    | 2: site/app.html, site/app.js                                             |
| buildCommit                 | a                | 1562 / span                    | 4: site/app.html, site/controllers/build-controller.js, …                 |

## data-* / role / aria-controls

| Source line / element          | Attribute               | Value                 |
| ------------------------------ | ----------------------- | --------------------- |
| 80 / workstationBootScreen     | role                    | status                |
| 106 / sectionControlsBtn       | aria-controls           | sectionCoordsPanel    |
| 122 / button                   | data-tool               | rect                  |
| 130 / button                   | data-tool               | circle                |
| 138 / button                   | data-tool               | sector                |
| 234 / mainMaxBtn               | data-view-panel         | mainPanel             |
| 248 / button                   | data-endpoint           | a                     |
| 257 / button                   | data-endpoint           | b                     |
| 267 / sectionCoordsPanel       | data-view-popover-panel |                       |
| 314 / button                   | data-tool               | rect                  |
| 317 / button                   | data-tool               | circle                |
| 439 / maskMaxBtn               | data-view-panel         | maskPanel             |
| 453 / button                   | data-draw-tool          |                       |
| 456 / button                   | data-draw-tool          | rect                  |
| 459 / button                   | data-draw-tool          | circle                |
| 462 / button                   | data-draw-tool          | polygon               |
| 470 / button                   | data-draw-tool          | ring                  |
| 478 / button                   | data-draw-tool          | ring-sector           |
| 491 / drawShapeEditor          | data-view-popover-panel |                       |
| 592 / threeMaxBtn              | data-view-panel         | threePanel            |
| 607 / div                      | role                    | tablist               |
| 608 / settingsTab              | role                    | tab                   |
| 608 / settingsTab              | aria-controls           | settingsTools         |
| 608 / settingsTab              | data-tool-tab           | settings              |
| 619 / baseTab                  | role                    | tab                   |
| 619 / baseTab                  | aria-controls           | baseTools             |
| 619 / baseTab                  | data-tool-tab           | base                  |
| 631 / maskTab                  | role                    | tab                   |
| 631 / maskTab                  | aria-controls           | maskTools             |
| 631 / maskTab                  | data-tool-tab           | mask                  |
| 643 / operationTab             | role                    | tab                   |
| 643 / operationTab             | aria-controls           | operationTools        |
| 643 / operationTab             | data-tool-tab           | operation             |
| 655 / snapshotsTab             | role                    | tab                   |
| 655 / snapshotsTab             | aria-controls           | snapshotsTools        |
| 655 / snapshotsTab             | data-tool-tab           | snapshots             |
| 670 / baseTools                | role                    | tabpanel              |
| 670 / baseTools                | data-tab-panel          | base                  |
| 683 / button                   | data-shape              | rect                  |
| 684 / button                   | data-shape              | circle                |
| 715 / maskTools                | role                    | tabpanel              |
| 715 / maskTools                | data-tab-panel          | mask                  |
| 784 / operationTools           | role                    | tabpanel              |
| 784 / operationTools           | data-tab-panel          | operation             |
| 797 / button                   | data-process-input-mode | manual                |
| 805 / button                   | data-process-input-mode | recipe                |
| 1166 / snapshotsTools          | role                    | tabpanel              |
| 1166 / snapshotsTools          | data-tab-panel          | snapshots             |
| 1179 / settingsTools           | role                    | tabpanel              |
| 1179 / settingsTools           | data-tab-panel          | settings              |
| 1274 / sectionCollapseAxisBtn  | aria-controls           | sectionCollapseEditor |
| 1316 / sectionMaxBtn           | data-view-panel         | sectionPanel          |
| 1331 / sectionCollapseEditor   | data-view-popover-panel |                       |
| 1460 / button                  | data-detail-handle      | nw                    |
| 1466 / button                  | data-detail-handle      | ne                    |
| 1472 / button                  | data-detail-handle      | sw                    |
| 1478 / button                  | data-detail-handle      | se                    |
| 1522 / processTaskDialog       | role                    | dialog                |
| 1530 / workspaceConflictDialog | role                    | dialog                |
| 1545 / statusBar               | data-level              | passive               |
| 1545 / statusBar               | role                    | status                |

## Dynamic classes

| Class or computed pattern        | Runtime creation/state sites (count / first two; complete list in contract.json)                               |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| active                           | 30: site/controllers/base-controls-controller.js:37, site/controllers/base-controls-controller.js:38, …        |
| cell-caret                       | 1: site/controllers/mask-browser-controller.js:173                                                             |
| cell-count                       | 1: site/controllers/mask-browser-controller.js:200                                                             |
| cell-name                        | 1: site/controllers/mask-browser-controller.js:185                                                             |
| cell-row                         | 1: site/controllers/mask-browser-controller.js:168                                                             |
| circle                           | 1: site/controllers/section-detail-roi-controller.js:168                                                       |
| collapse-disabled                | 1: site/controllers/section-collapse-controller.js:171                                                         |
| compact-btn                      | 6: site/controllers/process-recipe-controller.js:338, site/controllers/process-recipe-controller.js:583, …     |
| compact-hint                     | 2: site/controllers/process-recipe-controller.js:338, site/controllers/process-recipe-controller.js:601        |
| compact-select                   | 1: site/controllers/process-recipe-controller.js:338                                                           |
| complete                         | 2: site/controllers/process-recipe-controller.js:968, site/controllers/process-recipe-controller.js:1340       |
| confirmation-action              | 1: site/controllers/confirmation-dialog-controller.js:87                                                       |
| confirmation-actions             | 1: site/controllers/confirmation-dialog-controller.js:18                                                       |
| confirmation-copy                | 1: site/controllers/confirmation-dialog-controller.js:18                                                       |
| confirmation-detail              | 1: site/controllers/confirmation-dialog-controller.js:18                                                       |
| confirmation-dialog              | 1: site/controllers/confirmation-dialog-controller.js:18                                                       |
| confirmation-overlay             | 1: site/controllers/confirmation-dialog-controller.js:16                                                       |
| danger                           | 1: site/controllers/confirmation-dialog-controller.js:87                                                       |
| dragging                         | 9: site/controllers/section-collapse-controller.js:220, site/controllers/section-collapse-controller.js:221, … |
| draw-shape-editor-help           | 1: site/controllers/draw-mask-controller.js:129                                                                |
| draw-shape-editor-row            | 2: site/controllers/draw-mask-controller.js:68, site/controllers/draw-mask-controller.js:82                    |
| electrical-hidden                | 1: site/controllers/layer-legend-controller.js:517                                                             |
| electrical-legend-name           | 1: site/controllers/layer-legend-controller.js:534                                                             |
| electrical-legend-row            | 1: site/controllers/layer-legend-controller.js:520                                                             |
| electrical-region-chip           | 1: site/controllers/layer-legend-controller.js:524                                                             |
| electrical-row-wrap              | 1: site/controllers/layer-legend-controller.js:516                                                             |
| empty-list                       | 3: site/controllers/mask-browser-controller.js:152, site/controllers/mask-browser-controller.js:220, …         |
| error                            | 3: site/welcome.js:51, site/welcome.js:348, …                                                                  |
| failed                           | 1: site/controllers/process-recipe-controller.js:969                                                           |
| has-image                        | 1: site/welcome.js:238                                                                                         |
| has-project-preview              | 1: site/welcome.js:235                                                                                         |
| has-thumbnail                    | 1: site/welcome.js:98                                                                                          |
| hidden                           | 20: site/controllers/process-panel-controller.js:173, site/controllers/process-panel-controller.js:174, …      |
| hint                             | 2: site/controllers/process-recipe-controller.js:338, site/controllers/process-recipe-controller.js:601        |
| history-bookmark-row             | 1: site/controllers/project-controller.js:279                                                                  |
| history-bookmarks-group          | 1: site/controllers/project-controller.js:633                                                                  |
| history-bookmarks-list           | 1: site/controllers/project-controller.js:644                                                                  |
| history-bookmarks-summary        | 1: site/controllers/project-controller.js:636                                                                  |
| history-legacy-bookmark-list     | 1: site/controllers/project-controller.js:915                                                                  |
| history-legacy-bookmarks         | 1: site/controllers/project-controller.js:911                                                                  |
| history-legacy-restore           | 1: site/controllers/project-controller.js:920                                                                  |
| history-step-row                 | 1: site/controllers/project-controller.js:511                                                                  |
| history-step-wrap                | 1: site/controllers/project-controller.js:507                                                                  |
| history-tree-root                | 1: site/controllers/project-controller.js:895                                                                  |
| history-variant                  | 1: site/controllers/project-controller.js:829                                                                  |
| history-variant-body             | 1: site/controllers/project-controller.js:837                                                                  |
| history-variant-editor           | 1: site/controllers/project-controller.js:729                                                                  |
| history-variant-head             | 1: site/controllers/project-controller.js:700                                                                  |
| history-variant-name             | 1: site/controllers/project-controller.js:709                                                                  |
| history-variant-rename-trigger   | 1: site/controllers/project-controller.js:723                                                                  |
| history-variant-stats            | 1: site/controllers/project-controller.js:718                                                                  |
| history-variant-toggle           | 1: site/controllers/project-controller.js:704                                                                  |
| implant-gradient-chip            | 1: site/controllers/layer-legend-controller.js:444                                                             |
| implant-hidden                   | 1: site/controllers/layer-legend-controller.js:437                                                             |
| implant-legend-name              | 1: site/controllers/layer-legend-controller.js:454                                                             |
| implant-legend-row               | 1: site/controllers/layer-legend-controller.js:440                                                             |
| implant-row-wrap                 | 1: site/controllers/layer-legend-controller.js:436                                                             |
| is-maximized                     | 2: site/controllers/view-maximize-controller.js:18, site/controllers/view-maximize-controller.js:21            |
| is-restorable                    | 1: site/controllers/project-controller.js:613                                                                  |
| is-unavailable                   | 1: site/controllers/project-controller.js:625                                                                  |
| layer-absent                     | 1: site/controllers/layer-legend-controller.js:349                                                             |
| layer-count                      | 1: site/controllers/mask-browser-controller.js:259                                                             |
| layer-hidden                     | 1: site/controllers/layer-legend-controller.js:350                                                             |
| layer-name                       | 1: site/controllers/mask-browser-controller.js:255                                                             |
| layer-row                        | 1: site/controllers/mask-browser-controller.js:228                                                             |
| layer-swatch                     | 1: site/controllers/mask-browser-controller.js:251                                                             |
| legend-color-chip                | 3: site/controllers/layer-legend-controller.js:357, site/controllers/layer-legend-controller.js:444, …         |
| legend-head                      | 1: site/controllers/layer-legend-controller.js:288                                                             |
| legend-name                      | 3: site/controllers/layer-legend-controller.js:370, site/controllers/layer-legend-controller.js:454, …         |
| legend-palette-chip              | 3: site/controllers/layer-legend-controller.js:414, site/controllers/layer-legend-controller.js:494, …         |
| legend-palette-grid              | 3: site/controllers/layer-legend-controller.js:410, site/controllers/layer-legend-controller.js:490, …         |
| legend-palette-select            | 1: site/controllers/layer-legend-controller.js:298                                                             |
| legend-profile-editor            | 1: site/controllers/layer-legend-controller.js:237                                                             |
| legend-profile-label             | 1: site/controllers/layer-legend-controller.js:239                                                             |
| legend-profile-option            | 1: site/controllers/layer-legend-controller.js:257                                                             |
| legend-profile-options           | 1: site/controllers/layer-legend-controller.js:241                                                             |
| legend-profile-trigger           | 1: site/controllers/layer-legend-controller.js:231                                                             |
| legend-random                    | 1: site/controllers/layer-legend-controller.js:324                                                             |
| legend-row                       | 3: site/controllers/layer-legend-controller.js:353, site/controllers/layer-legend-controller.js:440, …         |
| legend-row-wrap                  | 3: site/controllers/layer-legend-controller.js:347, site/controllers/layer-legend-controller.js:436, …         |
| legend-title                     | 1: site/controllers/layer-legend-controller.js:291                                                             |
| legend-tools                     | 1: site/controllers/layer-legend-controller.js:295                                                             |
| legend-visibility                | 3: site/controllers/layer-legend-controller.js:390, site/controllers/layer-legend-controller.js:472, …         |
| loading                          | 3: site/welcome.js:50, site/welcome.js:348, …                                                                  |
| mini-btn                         | 2: site/workstation-ui.js:582, site/workstation-ui.js:588                                                      |
| open                             | 3: site/workstation-ui.js:221, site/workstation-ui.js:263, …                                                   |
| param-field                      | 1: site/controllers/process-recipe-controller.js:519                                                           |
| param-grid-2                     | 1: site/controllers/process-recipe-controller.js:676                                                           |
| plan-pan-active                  | 1: site/controllers/main-canvas-controller.js:39                                                               |
| preview                          | 1: site/controllers/section-detail-roi-controller.js:169                                                       |
| preview-panning                  | 2: site/app.js:1538, site/app.js:1557                                                                          |
| primary                          | 2: site/controllers/confirmation-dialog-controller.js:87, site/controllers/process-recipe-controller.js:338    |
| process-busy                     | 1: site/app.js:1096                                                                                            |
| process-history-body             | 1: site/controllers/project-controller.js:522                                                                  |
| process-history-marker           | 1: site/controllers/project-controller.js:518                                                                  |
| process-history-row              | 1: site/controllers/project-controller.js:511                                                                  |
| quiet                            | 1: site/controllers/process-recipe-controller.js:659                                                           |
| ready                            | 3: site/welcome.js:51, site/welcome.js:347, …                                                                  |
| recipe-add-row                   | 1: site/controllers/process-recipe-controller.js:338                                                           |
| recipe-code-actions              | 1: site/controllers/process-recipe-controller.js:338                                                           |
| recipe-code-editor               | 1: site/controllers/process-recipe-controller.js:338                                                           |
| recipe-code-pane                 | 1: site/controllers/process-recipe-controller.js:338                                                           |
| recipe-execution                 | 1: site/controllers/process-recipe-controller.js:338                                                           |
| recipe-history-actions           | 1: site/controllers/process-recipe-controller.js:338                                                           |
| recipe-mask-context              | 1: site/controllers/process-recipe-controller.js:572                                                           |
| recipe-name-input                | 1: site/controllers/process-recipe-controller.js:338                                                           |
| recipe-options-row               | 1: site/controllers/process-recipe-controller.js:338                                                           |
| recipe-progress                  | 1: site/controllers/process-recipe-controller.js:338                                                           |
| recipe-run-actions               | 1: site/controllers/process-recipe-controller.js:338                                                           |
| recipe-start-mode                | 1: site/controllers/process-recipe-controller.js:338                                                           |
| recipe-step-copy                 | 1: site/controllers/process-recipe-controller.js:954                                                           |
| recipe-step-editor               | 1: site/controllers/process-recipe-controller.js:338                                                           |
| recipe-step-editor-actions       | 1: site/controllers/process-recipe-controller.js:627                                                           |
| recipe-step-editor-head          | 1: site/controllers/process-recipe-controller.js:606                                                           |
| recipe-step-num                  | 1: site/controllers/process-recipe-controller.js:953                                                           |
| recipe-step-operation-field      | 1: site/controllers/process-recipe-controller.js:671                                                           |
| recipe-step-row                  | 1: site/controllers/process-recipe-controller.js:950                                                           |
| recipe-step-state                | 1: site/controllers/process-recipe-controller.js:970                                                           |
| recipe-step-type-select          | 1: site/controllers/process-recipe-controller.js:620                                                           |
| recipe-steps-list                | 1: site/controllers/process-recipe-controller.js:338                                                           |
| recipe-template-actions          | 1: site/controllers/process-recipe-controller.js:338                                                           |
| recipe-template-preview          | 1: site/controllers/process-recipe-controller.js:338                                                           |
| recipe-template-preview-steps    | 1: site/controllers/process-recipe-controller.js:338                                                           |
| recipe-toolbar                   | 1: site/controllers/process-recipe-controller.js:338                                                           |
| recipe-validation                | 1: site/controllers/process-recipe-controller.js:338                                                           |
| recipe-validation-${…}           | 1: site/controllers/process-recipe-controller.js:1038                                                          |
| recipe-validation-header         | 1: site/controllers/process-recipe-controller.js:338                                                           |
| recipe-view-mode                 | 1: site/controllers/process-recipe-controller.js:338                                                           |
| recipe-workflow-label            | 1: site/controllers/process-recipe-controller.js:338                                                           |
| root                             | 1: site/controllers/mask-browser-controller.js:168                                                             |
| running                          | 2: site/controllers/process-recipe-controller.js:1326, site/controllers/process-recipe-controller.js:1339      |
| section-collapse-ruler-tick      | 1: site/controllers/section-collapse-controller.js:121                                                         |
| section-detail-drawing           | 1: site/controllers/section-detail-roi-controller.js:33                                                        |
| section-dock-collapsed           | 1: site/workstation-ui.js:353                                                                                  |
| section-editing                  | 1: site/controllers/section-controls-controller.js:50                                                          |
| segmented                        | 1: site/controllers/process-recipe-controller.js:338                                                           |
| selected                         | 1: site/controllers/mask-browser-controller.js:228                                                             |
| snapshot-branch-empty            | 1: site/controllers/project-controller.js:882                                                                  |
| snapshot-branch-group            | 1: site/controllers/project-controller.js:829                                                                  |
| snapshot-continuation-banner     | 1: site/controllers/project-controller.js:138                                                                  |
| snapshot-continuation-context    | 1: site/controllers/project-controller.js:150                                                                  |
| snapshot-continuation-hint       | 1: site/controllers/project-controller.js:157                                                                  |
| snapshot-inline-editor           | 2: site/controllers/project-controller.js:300, site/controllers/project-controller.js:729                      |
| snapshot-milestone-body          | 1: site/controllers/project-controller.js:291                                                                  |
| snapshot-milestone-marker        | 1: site/controllers/project-controller.js:285                                                                  |
| snapshot-milestone-row           | 1: site/controllers/project-controller.js:279                                                                  |
| snapshot-more-menu               | 1: site/controllers/project-controller.js:225                                                                  |
| snapshot-more-popover            | 1: site/controllers/project-controller.js:254                                                                  |
| snapshot-more-trigger            | 1: site/controllers/project-controller.js:228                                                                  |
| snapshot-return-head             | 1: site/controllers/project-controller.js:180                                                                  |
| snapshot-timeline-row            | 1: site/controllers/project-controller.js:282                                                                  |
| three-loading                    | 3: site/three-view.js:205, site/three-view.js:2381, …                                                          |
| three-unavailable                | 2: site/three-view.js:206, site/three-view.js:2480                                                             |
| three-unavailable-card           | 1: site/three-view.js:225                                                                                      |
| unavailable                      | 1: site/controllers/mask-browser-controller.js:228                                                             |
| view-maximized                   | 1: site/controllers/view-maximize-controller.js:20                                                             |
| view-overflow-secondary          | 1: site/controllers/view-toolbar-controller.js:55                                                              |
| welcome-example-body             | 1: site/welcome.js:243                                                                                         |
| welcome-example-card             | 1: site/welcome.js:229                                                                                         |
| welcome-example-image            | 1: site/welcome.js:63                                                                                          |
| welcome-example-image-caption    | 1: site/welcome.js:76                                                                                          |
| welcome-example-preview-start    | 1: site/welcome.js:127                                                                                         |
| welcome-example-project-fallback | 1: site/welcome.js:63                                                                                          |
| welcome-example-project-frame    | 1: site/welcome.js:116                                                                                         |
| welcome-example-project-loading  | 1: site/welcome.js:111                                                                                         |
| welcome-example-project-preview  | 1: site/welcome.js:95                                                                                          |
| welcome-example-project-stage    | 1: site/welcome.js:101                                                                                         |
| welcome-example-source-row       | 1: site/welcome.js:197                                                                                         |
| welcome-example-sources          | 1: site/welcome.js:192                                                                                         |
| welcome-example-summary-link     | 1: site/welcome.js:255                                                                                         |
| welcome-example-tag-more         | 1: site/welcome.js:291                                                                                         |
| welcome-example-tags             | 1: site/welcome.js:281                                                                                         |
| welcome-example-title-link       | 1: site/welcome.js:248                                                                                         |
| welcome-example-view-tab         | 1: site/welcome.js:149                                                                                         |
| welcome-example-view-tabs        | 1: site/welcome.js:137                                                                                         |
| welcome-example-visual           | 1: site/welcome.js:233                                                                                         |
| welcome-project-preview          | 1: site/app.js:68                                                                                              |
| wide                             | 1: site/controllers/draw-mask-controller.js:82                                                                 |
| workstation-boot                 | 1: site/app.js:1675                                                                                            |
| workstation-compact-ui           | 1: site/workstation-ui.js:279                                                                                  |
| workstation-layout-tab           | 2: site/workstation-ui.js:397, site/workstation-ui.js:414                                                      |
| workstation-legend-open          | 3: site/workstation-ui.js:281, site/workstation-ui.js:663, …                                                   |
| workstation-rail                 | 1: site/workstation-ui.js:363                                                                                  |
| workstation-rail-button          | 1: site/workstation-ui.js:369                                                                                  |
| workstation-rail-spacer          | 1: site/workstation-ui.js:380                                                                                  |
| workstation-section-active       | 1: site/workstation-ui.js:214                                                                                  |
| workstation-section-collapse     | 1: site/workstation-ui.js:588                                                                                  |
| workstation-section-collapsed    | 1: site/workstation-ui.js:354                                                                                  |
| workstation-section-label        | 1: site/workstation-ui.js:555                                                                                  |
| workstation-section-layers       | 1: site/workstation-ui.js:582                                                                                  |
| workstation-split-view-menu      | 1: site/workstation-ui.js:478                                                                                  |
| workstation-split-view-option    | 1: site/workstation-ui.js:481                                                                                  |
| workstation-split-view-selector  | 1: site/workstation-ui.js:475                                                                                  |
| workstation-tool-close           | 1: site/workstation-ui.js:531                                                                                  |
| workstation-tool-flyout          | 1: site/workstation-ui.js:516                                                                                  |
| workstation-tool-head            | 1: site/workstation-ui.js:520                                                                                  |
| workstation-tool-head-spacer     | 1: site/workstation-ui.js:529                                                                                  |
| workstation-tool-position        | 1: site/workstation-ui.js:526                                                                                  |
| workstation-tool-scroll-tail     | 1: site/workstation-ui.js:568                                                                                  |
| workstation-top-meta             | 1: site/workstation-ui.js:436                                                                                  |
| workstation-top-spacer           | 1: site/workstation-ui.js:439                                                                                  |
| workstation-ui-v2                | 1: site/workstation-ui.js:622                                                                                  |
| workstation-view-stage           | 1: site/workstation-ui.js:449                                                                                  |
| workstation-view-tab             | 3: site/workstation-ui.js:397, site/workstation-ui.js:406, …                                                   |
| workstation-view-tabs            | 1: site/workstation-ui.js:393                                                                                  |
| workstation-viewbar              | 1: site/workstation-ui.js:390                                                                                  |

## Dynamic IDs

Concrete dynamic IDs also include all referencing files/lines in contract.json; repeated declarations are conditional creation sites, not a claim of simultaneous duplicate nodes.

| Pattern (blank = unresolved) | Creation site                                         | Element where known |
| ---------------------------- | ----------------------------------------------------- | ------------------- |
| confirmationDialogOverlay    | site/controllers/confirmation-dialog-controller.js:15 | see source          |
| confirmationDialog           | site/controllers/confirmation-dialog-controller.js:18 | section             |
| confirmationDialogTitle      | site/controllers/confirmation-dialog-controller.js:18 | strong              |
| confirmationDialogMessage    | site/controllers/confirmation-dialog-controller.js:18 | p                   |
| confirmationDialogDetail     | site/controllers/confirmation-dialog-controller.js:18 | p                   |
| confirmationDialogActions    | site/controllers/confirmation-dialog-controller.js:18 | div                 |
|                              | site/controllers/draw-mask-controller.js:72           | see source          |
| drawShapePoints              | site/controllers/draw-mask-controller.js:86           | see source          |
| drawShapeCx                  | site/controllers/draw-mask-controller.js:115          | input               |
| drawShapeCy                  | site/controllers/draw-mask-controller.js:116          | input               |
| drawShapeWidth               | site/controllers/draw-mask-controller.js:117          | input               |
| drawShapeHeight              | site/controllers/draw-mask-controller.js:118          | input               |
| drawShapeCx                  | site/controllers/draw-mask-controller.js:122          | input               |
| drawShapeCy                  | site/controllers/draw-mask-controller.js:123          | input               |
| drawShapeRadius              | site/controllers/draw-mask-controller.js:124          | input               |
| drawShapeCx                  | site/controllers/draw-mask-controller.js:134          | input               |
| drawShapeCy                  | site/controllers/draw-mask-controller.js:135          | input               |
| drawShapeInnerRadius         | site/controllers/draw-mask-controller.js:136          | input               |
| drawShapeOuterRadius         | site/controllers/draw-mask-controller.js:137          | input               |
| drawShapeStartDeg            | site/controllers/draw-mask-controller.js:141          | input               |
| drawShapeEndDeg              | site/controllers/draw-mask-controller.js:142          | input               |
| recipeNameInput              | site/controllers/process-recipe-controller.js:338     | input               |
| recipeTemplateSelect         | site/controllers/process-recipe-controller.js:338     | select              |
| recipeTemplatePreview        | site/controllers/process-recipe-controller.js:338     | div                 |
| recipeTemplatePreviewTitle   | site/controllers/process-recipe-controller.js:338     | strong              |
| recipeTemplatePreviewDetail  | site/controllers/process-recipe-controller.js:338     | span                |
| recipeTemplatePreviewSteps   | site/controllers/process-recipe-controller.js:338     | ol                  |
| recipeTemplatePreviewWarning | site/controllers/process-recipe-controller.js:338     | p                   |
| recipeTemplateCancelBtn      | site/controllers/process-recipe-controller.js:338     | button              |
| recipeTemplateLoadBtn        | site/controllers/process-recipe-controller.js:338     | button              |
| recipeUndoBtn                | site/controllers/process-recipe-controller.js:338     | button              |
| recipeRedoBtn                | site/controllers/process-recipe-controller.js:338     | button              |
| recipeStepsTab               | site/controllers/process-recipe-controller.js:338     | button              |
| recipeCodeTab                | site/controllers/process-recipe-controller.js:338     | button              |
| recipeStepsPane              | site/controllers/process-recipe-controller.js:338     | div                 |
| recipeStepsList              | site/controllers/process-recipe-controller.js:338     | div                 |
| recipeAddKind                | site/controllers/process-recipe-controller.js:338     | select              |
| recipeAddStepBtn             | site/controllers/process-recipe-controller.js:338     | button              |
| recipeStepEditor             | site/controllers/process-recipe-controller.js:338     | div                 |
| recipeCodePane               | site/controllers/process-recipe-controller.js:338     | div                 |
| recipeCodeEditor             | site/controllers/process-recipe-controller.js:338     | textarea            |
| recipeApplyCodeBtn           | site/controllers/process-recipe-controller.js:338     | button              |
| recipeFormatCodeBtn          | site/controllers/process-recipe-controller.js:338     | button              |
| recipeValidateBtn            | site/controllers/process-recipe-controller.js:338     | button              |
| recipeValidation             | site/controllers/process-recipe-controller.js:338     | div                 |
| recipeProgress               | site/controllers/process-recipe-controller.js:338     | div                 |
| recipeProgressLabel          | site/controllers/process-recipe-controller.js:338     | span                |
| recipeProgressCount          | site/controllers/process-recipe-controller.js:338     | span                |
| recipeProgressBar            | site/controllers/process-recipe-controller.js:338     | progress            |
| recipeRunSummary             | site/controllers/process-recipe-controller.js:338     | p                   |
| recipeRunStart               | site/controllers/process-recipe-controller.js:338     | select              |
| recipeRunToBtn               | site/controllers/process-recipe-controller.js:338     | button              |
| recipeRunAllBtn              | site/controllers/process-recipe-controller.js:338     | button              |
| recipeStopBtn                | site/controllers/process-recipe-controller.js:338     | button              |
| recipeStepOperation          | site/controllers/process-recipe-controller.js:619     | see source          |
|                              | site/controllers/process-recipe-controller.js:653     | see source          |

## Dynamic structure and dataset sites

Every innerHTML assignment, createElement call, className/classList state change, dataset access, helper-class invocation and append/prepend/replace operation is recorded with the complete source expression in contract.json. No inferred parent is asserted for computed assembly. Review helper calls with variable arguments and unresolved operations before migrating a domain.

| Runtime module                                       | Operation count | Kinds                                                                                                                                                               |
| ---------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| site/app.html                                        | 7               | createElement, append, dataset                                                                                                                                      |
| site/app.js                                          | 11              | classList.add, dataset, classList.toggle, classList.remove                                                                                                          |
| site/controllers/base-controls-controller.js         | 6               | classList.remove, classList.add, dataset                                                                                                                            |
| site/controllers/confirmation-dialog-controller.js   | 9               | createElement, className, innerHTML, append, replaceChildren, dataset                                                                                               |
| site/controllers/draw-mask-controller.js             | 22              | createElement, className, append, replaceChildren, dataset, classList.toggle                                                                                        |
| site/controllers/export-controller.js                | 8               | createElement, append, replaceChildren                                                                                                                              |
| site/controllers/feedback-controller.js              | 1               | dataset                                                                                                                                                             |
| site/controllers/layer-legend-controller.js          | 88              | createElement, className, classList.toggle, append, innerHTML                                                                                                       |
| site/controllers/main-canvas-controller.js           | 2               | classList.toggle                                                                                                                                                    |
| site/controllers/mask-browser-controller.js          | 30              | innerHTML, createElement, className, append                                                                                                                         |
| site/controllers/mask-import-controller.js           | 2               | createElement, append                                                                                                                                               |
| site/controllers/mask-roi-controller.js              | 3               | classList.remove, dataset, classList.toggle                                                                                                                         |
| site/controllers/process-panel-controller.js         | 27              | innerHTML, dataset, classList.toggle                                                                                                                                |
| site/controllers/process-recipe-controller.js        | 70              | createElement, className, dataset, innerHTML, replaceChildren, helper.make, append, classList.toggle, classList.add, classList.remove                               |
| site/controllers/project-controller.js               | 125             | innerHTML, createElement, className, dataset, append, classList.add                                                                                                 |
| site/controllers/roi-controller.js                   | 3               | classList.remove, dataset, classList.toggle                                                                                                                         |
| site/controllers/section-collapse-controller.js      | 17              | dataset, createElement, className, append, classList.toggle, classList.remove, classList.add                                                                        |
| site/controllers/section-controls-controller.js      | 2               | classList.toggle                                                                                                                                                    |
| site/controllers/section-detail-roi-controller.js    | 7               | classList.toggle, classList.add, classList.remove, dataset                                                                                                          |
| site/controllers/tool-tabs-controller.js             | 7               | dataset, classList.toggle                                                                                                                                           |
| site/controllers/view-maximize-controller.js         | 7               | classList.remove, classList.toggle, classList.add, dataset                                                                                                          |
| site/controllers/view-toolbar-controller.js          | 6               | append, insertBefore, createElement, className                                                                                                                      |
| site/controllers/workspace-persistence-controller.js | 9               | dataset, replaceChildren, append                                                                                                                                    |
| site/controllers/workspace-view-controller.js        | 2               | classList.toggle, dataset                                                                                                                                           |
| site/index.html                                      | 6               | createElement, append                                                                                                                                               |
| site/plan-renderers.js                               | 27              | createElement, dataset, classList.toggle                                                                                                                            |
| site/project-io.js                                   | 2               | createElement, append                                                                                                                                               |
| site/section-editor.js                               | 5               | classList.remove, dataset, classList.add                                                                                                                            |
| site/three-view.js                                   | 146             | dataset, classList.remove, classList.add, createElement, className, append, replaceChildren, prepend                                                                |
| site/welcome.js                                      | 88              | classList.add, classList.remove, dataset, createElement, className, append, classList.toggle, innerHTML                                                             |
| site/workstation-ui.js                               | 98              | createElement, className, dataset, classList.toggle, classList.remove, classList.add, helper.makeButton, dataset.helper, append, prepend, insertBefore, replaceWith |

Known limits: helper arguments stored in variables, class maps, computed dataset keys and IDs assembled from live values need manual verification. Inline HTML JavaScript is parsed with original source line offsets; import maps are excluded. CSS content and scientific SVG classes are outside dynamic UI-class counts. The static parser ignores script/style text and never executes application code.
