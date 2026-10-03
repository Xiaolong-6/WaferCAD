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
  panPlanView,
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
    const panButton = $('mainPanBtn');
    let panMode = false;
    let panDrag = null;

    function setPanMode(active) {
      panMode = Boolean(active);
      panButton?.classList.toggle('active', panMode);
      panButton?.setAttribute('aria-pressed', String(panMode));
      main.classList.toggle('plan-pan-active', panMode);
      if (!panMode) panDrag = null;
    }

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
      isInteractionBlocked: () => isRoiDrawing() || panMode,
      onChange: (next) => {
        setSection(next);
        renderMain();
        renderSection();
      },
      onCreateDone: completeSectionCreate,
      onExitCreate: cancelSectionCreate,
    });
    setSectionEditor(editor);

    panButton?.addEventListener('click', () => setPanMode(!panMode));
    $('sectionControlsBtn')?.addEventListener('click', () => setPanMode(false));
    root.querySelectorAll('#mainPanel .roi-tool, #clearRoiBtn').forEach((button) => {
      button.addEventListener('click', () => setPanMode(false));
    });

    main.addEventListener('pointerdown', (event) => {
      if (!panMode || isRoiDrawing() || event.isPrimary === false) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();
      panDrag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
      main.setPointerCapture?.(event.pointerId);
    });

    main.addEventListener('pointermove', (event) => {
      if (panDrag?.pointerId === event.pointerId) {
        const dx = event.clientX - panDrag.x;
        const dy = event.clientY - panDrag.y;
        panDrag.x = event.clientX;
        panDrag.y = event.clientY;
        if (dx || dy) {
          panPlanView('main', dx, dy);
          editor.update();
        }
        return;
      }
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

    for (const type of ['pointerup', 'pointercancel']) {
      main.addEventListener(type, (event) => {
        if (panDrag?.pointerId !== event.pointerId) return;
        main.releasePointerCapture?.(event.pointerId);
        panDrag = null;
      });
    }

    root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && panMode) setPanMode(false);
    });

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
