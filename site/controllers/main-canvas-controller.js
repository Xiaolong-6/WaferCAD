import { createSectionEditor } from '../section-editor.js';

export function createMainCanvasController({
  root = document,
  getSection,
  setSection,
  getActiveFace,
  getSectionCreateMode,
  isRoiDrawing,
  completeSectionCreate,
  cancelSectionCreate,
  setSectionEditor,
  viewport,
  worldToCanvas,
  canvasToWorld,
  zoomPlanView,
  resetPlanView,
  xyText,
  renderMain,
  renderMask,
  renderSection,
  renderAll,
  ResizeObserverImpl = ResizeObserver,
  windowRef = window,
}) {
  const $ = (id) => root.getElementById(id);

  function bind() {
    const main = $('mainCanvas');
    const editor = createSectionEditor({
      canvas: main,
      host: $('sectionEndpointHandles'),
      getSection,
      getFrame: () => {
        const rect = main.getBoundingClientRect(),
          panel = $('mainPanel').getBoundingClientRect(),
          view = viewport(rect.width, rect.height, 'main'),
          back = getActiveFace() === 'back';
        return {
          left: rect.left - panel.left - $('mainPanel').clientLeft,
          top: rect.top - panel.top - $('mainPanel').clientTop,
          width: rect.width,
          height: rect.height,
          toScreen: (point) => worldToCanvas(point, view, back),
          toWorld: (point) => canvasToWorld(point[0], point[1], view, back),
        };
      },
      isCreateMode: getSectionCreateMode,
      isInteractionBlocked: isRoiDrawing,
      onChange: (next) => {
        setSection(next);
        renderMain();
        renderSection();
      },
      onCreateDone: completeSectionCreate,
      onExitCreate: cancelSectionCreate,
    });
    setSectionEditor(editor);

    main.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        zoomPlanView(
          'main',
          main,
          event.deltaY < 0 ? 1.35 : 1 / 1.35,
          event.clientX,
          event.clientY,
          getActiveFace() === 'back',
        );
      },
      { passive: false },
    );

    main.addEventListener('dblclick', (event) => {
      event.preventDefault();
      resetPlanView('main');
    });

    main.addEventListener('pointermove', (event) => {
      const rect = main.getBoundingClientRect(),
        view = viewport(rect.width, rect.height, 'main'),
        point = canvasToWorld(
          event.clientX - rect.left,
          event.clientY - rect.top,
          view,
          getActiveFace() === 'back',
        );
      $('mainCoords').textContent = `x ${xyText(point[0])} · y ${xyText(point[1])}`;
    });

    const resizeObserver = new ResizeObserverImpl(() => {
      renderMain();
      renderMask();
      renderSection();
    });
    for (const id of ['mainCanvas', 'maskCanvas', 'sectionCanvas']) {
      resizeObserver.observe($(id));
    }
    windowRef.addEventListener('resize', renderAll);
  }

  return { bind };
}
