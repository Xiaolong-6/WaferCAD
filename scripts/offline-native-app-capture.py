#!/usr/bin/env python3
"""Source-backed, offline native WaferCAD/Three.js visual diagnostic.

No network, file://, localhost or browser-policy modifications. A managed browser
may forbid navigation before Playwright routing; an about:blank fallback is
DIAGNOSTIC ONLY and intentionally cannot open .wafercad projects via Worker.
"""
from __future__ import annotations

import argparse
import contextlib
import hashlib
import json
import mimetypes
import math
import os
import re
import shutil
import subprocess
import sys
import time
from collections import Counter
from pathlib import Path
from urllib.parse import unquote, urlsplit

PINNED_CDN = 'https://cdn.jsdelivr.net/npm/three@'
APP_ORIGIN = 'https://wafercad.local'
FLAGS = ('--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
         '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage')


def check_three(root: Path) -> tuple[str, Path]:
    html = (root / 'site' / 'app.html').read_text(encoding='utf-8')
    versions = set(re.findall(r'https://cdn\.jsdelivr\.net/npm/three@([0-9.]+)/', html))
    if len(versions) != 1:
        raise ValueError(f'Expected one pinned Three.js import-map version; got {sorted(versions)}')
    version = versions.pop()
    folder = root / 'node_modules' / 'three'
    package = folder / 'package.json'
    if not package.exists() or json.loads(package.read_text())['version'] != version:
        raise ValueError(f'Missing pinned node_modules/three@{version}; install it offline first')
    for path in ('build/three.module.js', 'examples/jsm/controls/OrbitControls.js'):
        if not (folder / path).is_file():
            raise ValueError(f'Incomplete Three.js package: {path}')
    return version, folder


def local_file(url: str, site: Path, three: Path, version: str):
    parsed = urlsplit(url)
    if parsed.scheme == 'https' and parsed.netloc == 'wafercad.local':
        base, rel, kind = site, unquote(parsed.path.lstrip('/') or 'app.html'), 'site'
    elif (parsed.scheme == 'https' and parsed.netloc == 'cdn.jsdelivr.net'
          and parsed.path.startswith(f'/npm/three@{version}/')):
        base = three
        rel = unquote(parsed.path[len(f'/npm/three@{version}/'):])
        kind = 'three'
    else:
        return None, 'external'
    path = (base / rel).resolve()
    if not path.is_relative_to(base.resolve()) or not path.is_file():
        return None, 'missing-or-unsafe'
    return path, kind


def check_stable_rough_ui(page, out: Path):
    """Real Manual Process, Worker, Undo/Redo, local Save and file Open."""
    snapshot = lambda: page.evaluate('() => window.WaferCadV2Workstation.snapshot()')
    initial = snapshot()['model']
    if initial['width'] != 2 or initial['height'] != 2:
        raise ValueError('Stable rough UI probe requires an explicit 2 um base project')
    page.locator('[data-action="domain:process"]').click()
    for control, value in [('operationType', 'etch'), ('etchProfile', 'directional'),
                           ('operationArea', 'full'), ('faceToggleBtn', 'front'),
                           ('etchSurfaceMode', 'rough-stable')]:
        page.locator('#' + control).select_option(value)
    for control, value in [('operationThickness', '0.75'), ('roughFeatureSize', '0.3'),
                           ('roughAmplitude', '0.4'), ('roughFeatureCv', '25'),
                           ('roughHeightCv', '30'), ('roughSeed', '123')]:
        page.locator('#' + control).fill(value)
    # The 0.75 um Etch leaves exactly 0.25 um, avoiding binary subtraction
    # roundoff when asserting exact file/Recovery equality at the 0.1 nm grid.
    page.locator('#applyOperationBtn').click()
    page.wait_for_function('''() => {
      const s=window.WaferCadV2Workstation.snapshot();
      return !s.workflow.busy && s.model.regions[0]?.stack[0]?.frontSurface?.morphology === 'stochastic-v2';
    }''', timeout=60000)
    etched = snapshot()
    replay = etched['workflow']['steps'][-1]['operation']['replay']['params']['surface']
    if replay['morphology'] != 'stochastic-v2':
        raise RuntimeError('Manual Apply lost stable profile replay identity')
    page.screenshot(path=str(out / 'stable-rough-process.png'), animations='disabled')
    page.locator('#operationType').select_option('add')
    page.locator('#growthMode').select_option('conformal')
    page.locator('#layerName').fill('Stable ALD 50 nm')
    page.locator('#operationThickness').fill('0.05')
    page.locator('#applyOperationBtn').click()
    page.wait_for_function('''() => {
      const s=window.WaferCadV2Workstation.snapshot();
      return !s.workflow.busy && s.model.layers.length === 2;
    }''', timeout=60000)
    coated = snapshot()
    stack = coated['model']['regions'][0]['stack']
    if stack[0]['frontSurface'] != stack[-1]['frontSurface'] or abs(stack[-1]['z1'] - stack[0]['z1'] - 0.05) > 1e-10:
        raise RuntimeError('Stable conformal film lost its 50 nm profile registration')
    page.locator('[data-action="domain:history"]').click()
    page.locator('#undoBtn').click()
    if snapshot()['model'] != etched['model']:
        raise RuntimeError('Undo failed to restore the exact stable Etch')
    page.locator('#redoBtn').click()
    if snapshot()['model'] != coated['model']:
        raise RuntimeError('Redo changed stable profile or film geometry')
    page.locator('[data-action="domain:project"]').click()
    page.locator('#projectNameInput').fill('Stable rough acceptance')
    page.locator('#saveProjectBtn').click()
    page.wait_for_function('''() => /Saved/.test(
      document.querySelector('[data-slot="status.message"]')?.textContent || '')''', timeout=30000)
    page.locator('#projectExportMenuBtn').click()
    with page.expect_download(timeout=60000) as download:
        page.locator('#exportProjectBtn').click()
    target = out / 'stable-rough-roundtrip.wafercad'
    download.value.save_as(str(target))
    page.locator('#openProjectInput').set_input_files(str(target))
    button = page.get_by_role('button', name='Open project', exact=True)
    if button.count() and button.last.is_visible():
        button.last.click()
    page.wait_for_function('''() => /Opened/.test(
      document.querySelector('[data-slot="status.message"]')?.textContent || '')''', timeout=60000)
    (out / 'stable-model-before-open.json').write_text(json.dumps(coated['model']))
    (out / 'stable-model-after-open.json').write_text(json.dumps(snapshot()['model']))
    if snapshot()['model'] != coated['model']:
        raise RuntimeError('Worker file round-trip changed stable physical geometry')
    page.reload(wait_until='domcontentloaded')
    page.wait_for_function('''() => document.body.dataset.ready === 'true' &&
      window.WaferCadV2Workstation.snapshot().model.layers.length === 2''', timeout=60000)
    if snapshot()['model'] != coated['model']:
        raise RuntimeError('Saved workspace reload changed stable physical geometry')
    page.wait_for_function('''() => {
      const host=document.getElementById('threeHost');
      return host?.dataset.renderState === 'ready' && host.dataset.renderPhase === 'complete' &&
        host.querySelector('canvas')?.dataset.roughMeshMode === 'detailed';
    }''', timeout=60000)
    page.screenshot(path=str(out / 'stable-rough-reloaded.png'), animations='disabled')
    return {'manualWorkerApply': True, 'conformal50nm': True, 'undoRedoExact': True,
            'fileOpenExact': True, 'localSaveReloadExact': True,
            'project': target.name, 'model': coated['model']}


def is_optional_build_info_rejection(item: dict) -> bool:
    """Only the optional app-origin build stamp may be ignored in offline mode."""
    parsed = urlsplit(item['url'])
    return (parsed.scheme == 'https' and parsed.netloc == 'wafercad.local'
            and parsed.path == '/build-info.json'
            and item.get('reason') == 'missing-or-unsafe')


@contextlib.contextmanager
def software_display(enabled: bool):
    """Use headful Chromium under Xvfb on Linux; never touch Chromium policies."""
    configured = os.environ.get('DISPLAY', '')
    display_no = re.fullmatch(r':(\d+)(?:\.\d+)?', configured)
    has_server = bool(configured) and (not display_no or Path(f'/tmp/.X11-unix/X{display_no.group(1)}').exists())
    if not enabled or not sys.platform.startswith('linux') or has_server:
        yield
        return
    xvfb = shutil.which('Xvfb')
    if not xvfb:
        raise RuntimeError('Headful Linux Chromium needs DISPLAY or installed Xvfb')
    process = None
    old = os.environ.get('DISPLAY')
    try:
        for n in range(90, 190):
            if Path(f'/tmp/.X11-unix/X{n}').exists():
                continue
            candidate = subprocess.Popen([xvfb, f':{n}', '-screen', '0', '1920x1200x24',
                                          '-nolisten', 'tcp', '-ac'],
                                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            time.sleep(0.45)
            if candidate.poll() is None:
                process = candidate
                os.environ['DISPLAY'] = f':{n}'
                break
        if process is None:
            raise RuntimeError('Failed to start an isolated Xvfb display')
        yield
    finally:
        if old is None:
            os.environ.pop('DISPLAY', None)
        else:
            os.environ['DISPLAY'] = old
        if process is not None:
            process.terminate()
            try:
                process.wait(timeout=4)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=4)


def runtime_probe(page):
    return page.evaluate('''() => {
      const rect = c => { const r = c?.getBoundingClientRect(); return r ? {x:r.x,y:r.y,width:r.width,height:r.height} : null; };
      const three = document.querySelector('[data-view="three"] canvas');
      const probe = document.createElement('canvas');
      let gl=null, actual=null, failure=null;
      try { gl=probe.getContext('webgl2') || probe.getContext('webgl'); } catch(e) { failure=String(e); }
      try { actual=three?.getContext('webgl2') || three?.getContext('webgl'); } catch(e) { failure=String(e); }
      const ext=gl?.getExtension('WEBGL_debug_renderer_info');
      const threeParent=three?.closest('[data-view="three"]');
      return {
        url: location.href, documentReady: document.readyState,
        bodyReady: document.body?.dataset?.ready ?? null,
        webgl: {available: !!gl, nativeThreeContext: !!actual,
          version:gl?.getParameter(gl.VERSION) ?? null,
          renderer:ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null, error:failure},
        main:rect(document.getElementById('mainCanvas')),
        mask:rect(document.getElementById('maskCanvas')),
        three:rect(three), section:rect(document.getElementById('sectionCanvas')),
        threePanelVisible: !!threeParent && rect(threeParent)?.width > 100,
        threeUnavailable: (threeParent?.innerText || '').includes('3D unavailable'),
        appTextTail: document.body?.innerText.slice(-850) ?? ''
      };
    }''')


def inspect_native_ui_controls(page, out: Path):
    """Exercise production workstation UI; null origin remains visual-only."""
    result = {'controls': {}, 'screenshots': {}, 'originVerified': False}
    def record(name):
        path = out / f'ui-{name}.png'
        page.screenshot(path=str(path), animations='disabled')
        result['screenshots'][name] = {'file': path.name, 'sha256': snapshot_sha(path)}
    def control_state(view):
        return page.evaluate('''(view) => {
          const action = key => document.querySelector(`[data-action="${key}:${view}"]`);
          const fit = action('fit'), pan = action('tool:pan'), zoom = action('tool:zoom');
          const inMore = node => Boolean(node?.closest('.p-overflow'));
          return {fitVisible: Boolean(fit && !inMore(fit)), panInMore: inMore(pan),
            zoomInMore: inMore(zoom), toolbar: Boolean(fit?.closest('.p-toolbar'))};
        }''', view)
    page.wait_for_timeout(150)
    result['controls']['main'] = control_state('main')
    # Real screen-size round trip must preserve the original command node;
    # re-creating tools on rotation would duplicate their event listeners.
    if page.viewport_size['height'] > page.viewport_size['width']:
        page.evaluate("window.__inspectionMainPanNode = document.querySelector('[data-action=\"tool:pan:main\"]')")
        before_size = page.viewport_size.copy()
        page.set_viewport_size({'width': 900, 'height': 500})
        page.wait_for_timeout(200)
        landscape = control_state('main')
        page.set_viewport_size(before_size)
        page.wait_for_timeout(200)
        returned = control_state('main')
        same_node = page.evaluate('''() => {
          const found = document.querySelectorAll('[data-action="tool:pan:main"]');
          return found.length === 1 && found[0] === window.__inspectionMainPanNode;
        }''')
        result['controls']['orientationRoundTrip'] = {
            'landscapePanInMore': landscape['panInMore'],
            'portraitPanInMore': returned['panInMore'],
            'sameCommandNode': same_node}
    record('main-portrait')
    main_more = page.get_by_role('button', name='Main more tools')
    if main_more.count() == 1 and main_more.is_visible() and main_more.is_enabled():
        main_more.click()
        page.wait_for_timeout(100)
        result['controls']['mainMoreOpen'] = page.locator('.p-overflow[popover]:popover-open').count() > 0
        record('main-more')
        if result['controls']['mainMoreOpen']:
            pan = page.locator('[data-action="tool:pan:main"]')
            original_pressed = pan.get_attribute('aria-pressed')
            pan.click()
            page.wait_for_timeout(80)
            result['controls']['mainMoreCommandCloses'] = (
                page.locator('#p-overflow-main:popover-open').count() == 0
                and pan.get_attribute('aria-pressed') != original_pressed
                and pan.get_attribute('aria-checked') == pan.get_attribute('aria-pressed'))
            # Restore the original Pan mode via the same menu command.
            main_more.click()
            pan.click()
            result['controls']['mainPanRestored'] = (
                pan.get_attribute('aria-pressed') == original_pressed
                and page.locator('#p-overflow-main:popover-open').count() == 0)
        else:
            page.keyboard.press('Escape')
    section_nav = page.locator('[data-action="mobile-section"]')
    if section_nav.count() == 1 and section_nav.is_visible():
        section_nav.click()
        page.wait_for_timeout(350)
        result['controls']['section'] = control_state('section')
        first = page.locator('#layerLegend .v2-legend-name').first
        result['controls']['layerRowAvailable'] = first.count() > 0 and first.is_visible()
        record('section-portrait')
        # When this header really overflows, use the original Pan command in
        # More and ensure its view state survives closing and reopening.
        if result['controls']['section']['panInMore']:
            section_more = page.get_by_role('button', name='Section more tools')
            pan = page.locator('[data-action="tool:pan:section"]')
            original = pan.get_attribute('aria-pressed')
            section_more.click()
            pan.click()
            page.wait_for_timeout(80)
            result['controls']['sectionMoreCommandCloses'] = (
                page.locator('#p-overflow-section:popover-open').count() == 0
                and pan.get_attribute('aria-pressed') != original
                and pan.get_attribute('aria-checked') == pan.get_attribute('aria-pressed'))
            section_more.click()
            pan.click()
            page.wait_for_timeout(80)
            result['controls']['sectionPanRestored'] = (
                pan.get_attribute('aria-pressed') == original
                and page.locator('#p-overflow-section:popover-open').count() == 0)
        if result['controls']['layerRowAvailable']:
            before = page.locator('[data-action="domain:history"][aria-pressed="true"]').count()
            first.click()
            page.wait_for_timeout(250)
            selected = page.locator('#layerLegend .v2-legend-row[data-selected="true"]')
            after = page.locator('[data-action="domain:history"][aria-pressed="true"]').count()
            result['controls']['layerClickSelects'] = selected.count() == 1
            result['controls']['layerClickDidNotOpenHistory'] = before == after
            record('section-selected')
    # The same production view menu implementation is used by all four view adapters.
    for view in ('mask', 'three'):
        switch = page.locator(f'[data-action="view:{view}"]')
        if switch.count() == 1 and switch.is_visible():
            switch.click()
            page.wait_for_timeout(250)
            result['controls'][view] = control_state(view)
            record(view + '-portrait')
    if section_nav.count() == 1 and section_nav.is_visible():
        section_nav.click()
        page.wait_for_timeout(200)
        eye = page.locator('#layerLegend .v2-visibility-button').first
        if eye.count() == 1 and eye.is_visible():
            initial = eye.get_attribute('aria-pressed')
            eye.click()
            page.wait_for_timeout(120)
            updated = page.locator('#layerLegend .v2-visibility-button').first
            hidden = updated.get_attribute('aria-pressed') == 'false'
            updated.click()
            page.wait_for_timeout(120)
            restored = page.locator('#layerLegend .v2-visibility-button').first
            result['controls']['eyeVisibilityReversible'] = (initial == 'true' and hidden
                and restored.get_attribute('aria-pressed') == 'true')
        z_break = page.locator('[data-action="zbreak-settings"]')
        if z_break.count() == 1 and z_break.is_visible():
            z_break.click()
            page.wait_for_timeout(150)
            enabled = page.locator('#section-collapse-enabled')
            result['controls']['zBreakButtonStyle'] = enabled.count() == 1 and bool(
                enabled.locator('xpath=..').evaluate("el => el.classList.contains('v2-z-check')"))
            page.mouse.move(4, page.viewport_size['height'] - 8)
            page.evaluate('document.activeElement?.blur()')
            page.wait_for_timeout(100)
            record('z-break-toggle')
            if enabled.count() == 1:
                was_checked = enabled.is_checked()
                enabled.locator('xpath=..').click()
                result['controls']['zBreakNativeChange'] = enabled.is_checked() != was_checked
    result['originVerified'] = False  # Explicitly not History/Worker acceptance.
    return result


def parse_native_bounds(raw: str | None, label: str, count: int):
    if raw is None:
        return None
    try:
        values = tuple(float(value.strip()) for value in raw.split(','))
    except ValueError as exc:
        raise ValueError(f'{label} needs {count} finite values') from exc
    if len(values) != count or not all(math.isfinite(value) for value in values):
        raise ValueError(f'{label} needs {count} finite values')
    if count == 4 and (values[2] <= values[0] or values[3] <= values[1]):
        raise ValueError('ROI must have positive X and Y extent')
    if count == 2 and values[0] <= values[1]:
        raise ValueError('Z break top must exceed bottom')
    return values


def parse_native_camera(raw: str | None):
    pose = parse_native_bounds(raw, 'Camera pose', 6)
    if pose is not None and math.dist(pose[:3], pose[3:]) <= 1e-6:
        raise ValueError('Camera position must differ from target')
    return pose


def snapshot_sha(path: Path):
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else None


def source_revision(root: Path):
    manifest = root / 'offline-source-manifest.json'
    if manifest.exists():
        data = json.loads(manifest.read_text())
        return {'revision': data.get('revision', 'unavailable'),
                'dirtyAtPackaging': data.get('dirtyAtPackaging'), 'source': 'bundle-manifest'}
    try:
        commit = subprocess.run(['git', '-C', str(root), 'rev-parse', 'HEAD'],
                                capture_output=True, text=True, check=True, timeout=4).stdout.strip()
        dirty = bool(subprocess.run(['git', '-C', str(root), 'status', '--porcelain'],
                                    capture_output=True, text=True, check=True, timeout=4).stdout.strip())
        return {'revision': commit, 'dirty': dirty, 'source': 'git'}
    except (OSError, subprocess.SubprocessError):
        return {'revision': 'unavailable', 'source': 'unversioned-source'}


def run(args):
    from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

    root = args.root.resolve()
    site = root / 'site'
    version, three = check_three(root)
    out = args.output.resolve()
    out.mkdir(parents=True, exist_ok=True)
    browser_path = args.browser or os.environ.get('WAFERCAD_CHROMIUM')
    browser_path = browser_path or shutil.which('chromium') or shutil.which('chromium-browser')
    if not browser_path or not Path(browser_path).is_file():
        raise RuntimeError('Specify an installed Chromium with --browser or WAFERCAD_CHROMIUM')
    report = {'schema': 'wafercad-offline-native-app-diagnostic-v1',
              'classification': 'Real WaferCAD app offline diagnostic, software WebGL; NOT CI/release acceptance',
              'source': source_revision(root), 'threeVersion': version,
              'chromiumExecutable': str(Path(browser_path).resolve()),
              'softwareRendererFlags': list(FLAGS), 'httpRequestsAllowed': {},
              'rejectedRequests': [], 'pageErrors': [], 'consoleErrors': [],
              'requestFailures': [], 'limitations': [
                  'Software SwiftShader is not hardware-GPU pixel acceptance.',
                  'Recovery, storage coordination, touch interactions and publication gates are not tested.'],
              'ciWasRun': False, 'nativeVisualReview': 'unreviewed'}
    counts = Counter()
    rejected = []
    errors = report['pageErrors']
    console_errors = report['consoleErrors']
    request_failures = report['requestFailures']
    fail = False
    with software_display(not args.headless):
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(executable_path=browser_path,
                                                 headless=args.headless, args=list(FLAGS))
            report['chromiumVersion'] = browser.version
            ctx = browser.new_context(viewport={'width': args.width, 'height': args.height},
                                      ignore_https_errors=True, service_workers='block')
            ctx.on('page', lambda page: page.on('pageerror', lambda exc: errors.append(str(exc))))
            def on_page(page):
                page.on('console', lambda msg: console_errors.append(msg.text) if msg.type == 'error' else None)
                page.on('requestfailed', lambda req: request_failures.append({'url': req.url, 'failure': req.failure}))
            def route_all(route):
                path, kind = local_file(route.request.url, site, three, version)
                if path is None:
                    rejected.append({'url': route.request.url, 'reason': kind})
                    route.fulfill(status=403, body='Rejected by offline resource allowlist')
                    return
                counts[kind] += 1
                mime = mimetypes.guess_type(str(path))[0] or 'application/octet-stream'
                if path.suffix in ('.js', '.mjs'):
                    mime = 'text/javascript'
                route.fulfill(path=str(path), content_type=mime,
                              headers={'Access-Control-Allow-Origin': '*'})
            ctx.route('**/*', route_all)
            page = ctx.new_page()
            on_page(page)
            target = f'{APP_ORIGIN}/app.html?start=empty'
            try:
                page.goto(target, wait_until='domcontentloaded', timeout=8000)
                mode = 'https-origin'
            except Exception as exc:
                if args.require_origin:
                    report['navigationError'] = str(exc)
                    report['bootstrapMode'] = 'https-origin-blocked'
                    report['originValid'] = False
                    report['nativeThreeRendered'] = False
                    report['fourViewsVisible'] = False
                    report['nativeVisualEvidence'] = False
                    report['evidenceTier'] = 'blocked-https-origin'
                    report['httpRequestsAllowed'] = dict(counts)
                    report['rejectedRequests'] = rejected
                    report['unexpectedRejections'] = [v for v in rejected
                        if not is_optional_build_info_rejection(v)]
                    report['fatalError'] = 'Normal HTTPS navigation blocked; origin-required mode refuses fallback'
                    (out / 'native-app.evidence.json').write_text(
                        json.dumps(report, indent=2, ensure_ascii=False) + '\n')
                    raise RuntimeError(report['fatalError']) from exc
                report['navigationError'] = str(exc)
                mode = 'about-blank-null-origin'
                page.close()
                page = ctx.new_page()
                on_page(page)
                html = (site / 'app.html').read_text(encoding='utf-8')
                if '<head>' not in html:
                    raise ValueError('Cannot insert a base URL into site/app.html')
                page.set_content(html.replace('<head>', f'<head><base href="{APP_ORIGIN}/">', 1),
                                 wait_until='domcontentloaded', timeout=15000)
            report['bootstrapMode'] = mode
            report['originValid'] = mode == 'https-origin'
            if mode != 'https-origin':
                report['limitations'].extend([
                    'Null origin: project/workspace Workers cannot be created; example loading is NOT verified.',
                    'Null origin: IndexedDB, History/Recovery and cross-tab coordination are NOT verified.'])
            page.wait_for_timeout(args.wait_ms)
            base = out / 'four-view.png'
            page.screenshot(path=str(base), animations='disabled')
            before = runtime_probe(page)
            report['beforeInteraction'] = before
            report['images'] = {'fourView': {'file': base.name, 'sha256': snapshot_sha(base)}}
            if args.inspect_ui_controls:
                report['uiControlDiagnostic'] = inspect_native_ui_controls(page, out)
            three_rect = before.get('three')
            three_ok = (bool(before['webgl']['available'])
                        and bool(before['webgl']['nativeThreeContext'])
                        and bool(three_rect and three_rect['width'] > 100 and three_rect['height'] > 100)
                        and not before['threeUnavailable'])
            report['nativeThreeRendered'] = three_ok
            report['fourViewsVisible'] = all(bool(before[k] and before[k]['width'] > 100)
                                             for k in ('main', 'mask', 'three', 'section'))
            if args.capture_continuous_ui:
                # Capture the actual production Workstation form, not a mock.
                # This is UI evidence only: a null-origin Worker cannot Apply.
                page.get_by_text('Process', exact=True).first.click()
                page.locator('#operationType').select_option('etch')
                page.locator('#etchProfile').select_option('continuous')
                page.locator('#continuousShape').select_option('elliptical')
                page.locator('#operationThickness').fill('3')
                page.locator('#continuousLateral').fill('5')
                page.wait_for_timeout(350)
                continuous_ui = out / 'continuous-etch-process-form.png'
                page.screenshot(path=str(continuous_ui), animations='disabled')
                report['images']['continuousEtchProcessForm'] = {
                    'file': continuous_ui.name, 'sha256': snapshot_sha(continuous_ui)}
                report['continuousEtchProcessForm'] = page.evaluate('''() => ({
                  mode:document.querySelector('#operationType')?.value,
                  profile:document.querySelector('#etchProfile')?.value,
                  front:document.querySelector('#continuousShape')?.value,
                  vertical:document.querySelector('#operationThickness')?.value,
                  lateral:document.querySelector('#continuousLateral')?.value,
                  shapeVisible:!document.querySelector('#continuousShapeRow')?.classList.contains('hidden'),
                  lateralVisible:!document.querySelector('#continuousLateralRow')?.classList.contains('hidden')
                })''')
                if (report['continuousEtchProcessForm']['profile'] != 'continuous' or
                    not report['continuousEtchProcessForm']['lateralVisible']):
                    raise ValueError('Continuous Etch production form failed visibility diagnostics')
            if three_ok:
                box = page.locator('[data-view="three"] canvas').bounding_box()
                if box:
                    x, y = box['x'] + box['width']/2, box['y'] + box['height']/2
                    page.mouse.move(x, y)
                    page.mouse.down()
                    page.mouse.move(x+140, y-55, steps=20)
                    page.mouse.up()
                    page.wait_for_timeout(1100)
                    changed = out / 'three-orbit.png'
                    page.screenshot(path=str(changed), animations='disabled')
                    report['images']['orbit'] = {'file': changed.name, 'sha256': snapshot_sha(changed),
                        'differentFromInitial': snapshot_sha(changed) != snapshot_sha(base)}
                    button = page.get_by_role('button', name='3D maximize')
                    if button.count() and button.is_visible():
                        button.click()
                        page.wait_for_timeout(750)
                        maximized = out / 'three-maximized.png'
                        page.screenshot(path=str(maximized), animations='disabled')
                        report['images']['maximized'] = {'file': maximized.name,
                             'sha256': snapshot_sha(maximized)}
                        report['afterMaximize'] = runtime_probe(page)
            if args.check_z_ui and three_ok:
                trigger = page.locator('#threePanel [data-action="display:three"]')
                if trigger.count() != 1:
                    raise RuntimeError('3D Display Settings toolbar trigger is missing')
                trigger.click()
                opacity_slider = page.locator('#threeOpacityRange')
                origin_button = page.get_by_role('button', name='Show Origin')
                if opacity_slider.count() != 1 or origin_button.count() != 1:
                    raise RuntimeError('3D Display Settings must contain opacity and origin controls')
                if origin_button.get_attribute('aria-pressed') != 'false':
                    raise RuntimeError('World origin must default to hidden')
                origin_button.click()
                page.wait_for_timeout(250)
                origin_on_state = page.locator('#threeHost').get_attribute('data-origin-visible')
                pressed_on = origin_button.get_attribute('aria-pressed')
                style_on = origin_button.get_attribute('data-variant')
                page.mouse.move(650, 550)
                page.wait_for_timeout(200)
                origin_image = out / 'three-origin-on-ui.png'
                page.screenshot(path=str(origin_image), animations='disabled')
                report['images']['originOnUi'] = {'file': origin_image.name,
                                                  'sha256': snapshot_sha(origin_image)}
                origin_button.click()
                page.wait_for_timeout(250)
                origin_off_state = page.locator('#threeHost').get_attribute('data-origin-visible')
                pressed_off = origin_button.get_attribute('aria-pressed')
                style_off = origin_button.get_attribute('data-variant')
                if (origin_on_state, pressed_on, style_on, origin_off_state, pressed_off, style_off) != \
                        ('true', 'true', 'primary', 'false', 'false', 'secondary'):
                    raise RuntimeError('Native 3D world-origin toggle did not match pressed state')
                slider = page.get_by_role('slider', name='3D vertical display scale')
                if slider.count() != 1 or page.get_by_role('spinbutton', name='3D vertical display scale exact factor').count():
                    raise RuntimeError('3D Display Settings must have one Z slider, without a multiplier input')
                if page.get_by_role('button', name='Reset 3D vertical display scale to one').count():
                    raise RuntimeError('Retired vertical scale reset control is still present')
                slider.fill('1.75')
                page.wait_for_timeout(350)
                selected = page.locator('#threeHost').get_attribute('data-z-display-factor')
                indicator = page.locator('#threeHost .v2-three-z-display-indicator')
                indicator_text = indicator.inner_text() if indicator.is_visible() else ''
                page.mouse.move(650, 550)
                page.wait_for_timeout(200)
                image = out / 'three-z-display-ui.png'
                page.screenshot(path=str(image), animations='disabled')
                report['images']['zDisplayUi'] = {'file': image.name, 'sha256': snapshot_sha(image)}
                factor_label = page.locator('[data-three-display-settings] output').last.inner_text()
                relief_buttons = page.locator('[data-three-relief-factor]').count()
                section_physical_button = page.locator('#sectionRoughPhysicalBtn').count()
                report['zDisplayUi'] = {'factor1Point75': selected, 'factorLabel': factor_label,
                                        'indicator': indicator_text, 'originPressedOn': pressed_on,
                                        'reliefButtons': relief_buttons,
                                        'extraSectionPhysicalButton': section_physical_button,
                                        'nullOrigin': mode != 'https-origin'}
                if selected != '1.75' or factor_label != '×1.75' or \
                        relief_buttons != 0 or section_physical_button != 0 or \
                        'not physical' not in indicator_text:
                    raise RuntimeError('Continuous Z control or retired Relief/Section UI failed')
            if args.project:
                if mode != 'https-origin':
                    report['exampleLoad'] = 'NOT ATTEMPTED: null origin prevents native Worker access'
                else:
                    project = args.project.resolve()
                    if not project.is_file() or project.suffix != '.wafercad':
                        raise ValueError('Specify a real, existing .wafercad project')
                    # Restore four-panel state before opening the example.
                    restore = page.get_by_role('button', name='3D restore')
                    if restore.count() and restore.is_visible():
                        restore.click()
                    page.locator('#openProjectInput').set_input_files(str(project))
                    button = page.get_by_role('button', name='Open project', exact=True)
                    if button.count() and button.last.is_visible():
                        button.last.click()
                    page.wait_for_timeout(args.wait_ms)
                    image = out / 'project-load.png'
                    page.screenshot(path=str(image), animations='disabled')
                    report['images']['project'] = {'file': image.name, 'sha256': snapshot_sha(image)}
                    report['exampleLoad'] = 'attempted; independently inspect native page and Worker logs'
                    report['afterProject'] = runtime_probe(page)
            if args.check_stable_rough_ui:
                if mode != 'https-origin':
                    raise RuntimeError('Stable rough UI acceptance requires normal HTTPS Origin')
                report['stableRoughUi'] = check_stable_rough_ui(page, out)
            if args.inmemory_demo or args.inmemory_project:
                model_input = {'model': None, 'demo': args.inmemory_demo,
                               'roiBounds': args.inmemory_roi, 'zBreak': args.inmemory_z_break,
                               'zDisplayFactor': args.inmemory_z_scale,
                               'roughReliefFactor': args.inmemory_relief_scale,
                               'quality': args.quality, 'inspectionOpacity': args.inmemory_opacity}
                input_evidence = None
                if args.inmemory_project:
                    project_path = args.inmemory_project.resolve()
                    if not project_path.is_file() or project_path.suffix != '.wafercad':
                        raise ValueError('In-memory native model requires an existing .wafercad file')
                    model_path = out / 'validated-native-model.json'
                    subprocess.run(
                        ['node', str(root / 'scripts/offline-native-project-export.mjs'),
                         str(project_path), str(model_path)],
                        cwd=root, check=True, capture_output=True, text=True, timeout=90)
                    validated = json.loads(model_path.read_text(encoding='utf-8'))
                    model_input['model'] = validated.pop('model')
                    input_evidence = {**validated, 'validatedModelFile': model_path.name,
                                      'validatedModelSha256': snapshot_sha(model_path)}
                if model_input['model'] and model_input['model'].get('kernel') == 'vector-continuous-etch-v1':
                    # Real production 2D renderer on the native canvas, with an
                    # isolated read-only model. This does not replace the Workstation
                    # project/Worker/History state or claim transactional acceptance.
                    main_expression = (root / 'scripts/offline-native-main-view.js').read_text(
                        encoding='utf-8')
                    restore = page.get_by_role('button', name='3D restore')
                    if restore.count() and restore.is_visible():
                        restore.click()
                        page.wait_for_timeout(200)
                    main_details = page.evaluate(main_expression, {'model': model_input['model']})
                    main_image = out / 'continuous-main-native.png'
                    page.locator('#mainCanvas').screenshot(path=str(main_image), animations='disabled')
                    report['images']['continuousMainNative'] = {
                        'file': main_image.name, 'sha256': snapshot_sha(main_image)}
                    report['continuousMainNative'] = main_details
                    if (main_details.get('unsupportedFlag') or not main_details.get('solidPixels')):
                        raise ValueError('Continuous Main native projection failed')
                    section_expression = (root / 'scripts/offline-native-section-view.js').read_text(
                        encoding='utf-8')
                    half_width = float(model_input['model'].get('width') or 340) / 2
                    section_a_b = {'a': [-half_width, 0], 'b': [half_width, 0]}
                    section_result = page.evaluate(section_expression, {
                        'model': model_input['model'], 'section': section_a_b})
                    section_image = out / 'continuous-section-native.png'
                    page.locator('#wc-offline-section-capture').screenshot(
                        path=str(section_image), animations='disabled')
                    report['images']['continuousSectionNative'] = {
                        'file': section_image.name, 'sha256': snapshot_sha(section_image)}
                    report['continuousSectionNative'] = section_result
                    if model_input['model'].get('electricalRegions') or model_input['model'].get('implants'):
                        # Two independent real-Canvas acceptance modes: annotation visibility
                        # cannot depend on structure borders or a Z Break toggle.
                        for mode, settings in (
                            ('no-borders', {'borders': False}),
                            ('explicit-zbreak', {'borders': False, 'collapse': {
                                'enabled': True, 'continuousEtchExplicit': True,
                                'top': 1, 'bottom': -1}}),
                        ):
                            result = page.evaluate(section_expression, {
                                'model': model_input['model'], 'section': section_a_b,
                                **settings})
                            image = out / ('continuous-annotation-' + mode + '.png')
                            page.locator('#wc-offline-section-capture').screenshot(
                                path=str(image), animations='disabled')
                            report['images']['continuousAnnotation_' + mode] = {
                                'file': image.name, 'sha256': snapshot_sha(image)}
                            report['continuousAnnotation_' + mode] = result
                            page.locator('#wc-offline-section-capture').evaluate('(el) => el.remove()')
                    else:
                        page.locator('#wc-offline-section-capture').evaluate('(el) => el.remove()')
                expression = (root / 'scripts/offline-native-model-view.js').read_text(
                    encoding='utf-8')
                details = page.evaluate(expression, model_input)
                rough_completion_timeout = False
                try:
                    page.wait_for_function('''(roughCaps) => {
                      const item=window.__wafercadOfflineModel;
                      if (item?.host?.dataset?.renderState !== 'ready') return false;
                      const mode=item.host.querySelector('canvas')?.dataset?.roughMeshMode;
                      return roughCaps > 0 ? mode === 'detailed' : true;
                    }''', arg=details.get('roughCaps', 0), timeout=30000)
                except PlaywrightTimeoutError:
                    rough_completion_timeout = True
                page.wait_for_timeout(400)
                state = page.evaluate('''() => {
                  const item=window.__wafercadOfflineModel;
                  const canvas=item?.host?.querySelector('canvas');
                  const bounds=canvas?.getBoundingClientRect();
                  return {ready:item?.renderer?.ready || false,
                    renderState:item?.host?.dataset?.renderState || null,
                    renderError:item?.host?.dataset?.renderError || null,
                    renderPhase:item?.host?.dataset?.renderPhase || null,
                    roughMeshMode:canvas?.dataset?.roughMeshMode || 'none',
                    roughMeshBackend:canvas?.dataset?.roughMeshBackend || null,
                    roughTriangleCount:Number(canvas?.dataset?.roughTriangleCount || 0),
                    rendererFinalReadyMs:Number(item?.host?.dataset?.rendererFinalReadyMs || 0),
                    rendererRoughMs:Number(item?.host?.dataset?.rendererRoughMs || 0),
                    roughSaturatedLodTrim:item?.host?.dataset?.roughSaturatedLodTrim || null,
                    roughSaturatedLodDebug:globalThis.__waferCadLocalSaturationDebug || null,
                    roughTaskSpecialDebug:globalThis.__waferCadTaskSpecialDebug || null,
                    roughLodTrace:globalThis.__waferCadLodTrace || null,
                    roughDisplaySamplePitchUm:Number(item?.host?.dataset?.roughDisplaySamplePitchUm || 0),
                    roughDisplayBlendMin:Number(item?.host?.dataset?.roughDisplayBlendMin ?? 1),
                    roughRebuildCount:Number(canvas?.dataset?.roughRebuildCount || 0),
                    continuousRoiMode:item?.host?.dataset?.continuousEtchRoi || null,
                    continuousRoiMeshMode:item?.host?.dataset?.continuousEtchRoiMeshMode || null,
                    continuousRoiMeshTriangles:Number(item?.host?.dataset?.continuousEtchRoiMeshTriangles || 0),
                    continuousRoiCapTriangles:Number(item?.host?.dataset?.continuousEtchRoiCapTriangles || 0),
                    width:bounds?.width || 0,height:bounds?.height || 0};
                }''')
                rough_ready = (not details.get('roughCaps') or
                               (state['roughMeshMode'] == 'detailed' and
                                state['roughTriangleCount'] > 0 and
                                not rough_completion_timeout))
                continuous_roi = bool(args.inmemory_roi and model_input['model'] and
                                      model_input['model'].get('kernel') == 'vector-continuous-etch-v1')
                clipped_ready = (not continuous_roi or
                                 (state['continuousRoiMode'] == 'rect-clipped' and
                                  state['continuousRoiMeshMode'] == 'geometry-clipped' and
                                  state['continuousRoiMeshTriangles'] > 0 and
                                  state['continuousRoiCapTriangles'] > 0))
                ready = bool(details['initialized'] and state['ready'] and rough_ready and clipped_ready
                             and state['renderState'] == 'ready'
                             and state['width'] > 100 and state['height'] > 100)
                if args.check_png_wysiwyg and ready:
                    import base64
                    from PIL import Image
                    from io import BytesIO
                    export = page.evaluate('''async () => {
                      const item = window.__wafercadOfflineModel;
                      const beforeModel = JSON.stringify(item.model);
                      item.originState.visible = true;
                      item.renderer.refreshOrigin();
                      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                      const originVisible = item.host.dataset.originVisible;
                      const renderMode = item.host.querySelector('canvas')?.dataset?.roughMeshMode;
                      const source = item.host.querySelector('canvas');
                      const beforeWidth = source?.width;
                      const blob = await item.renderer.capturePng(3);
                      const data = await new Promise(resolve => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result);
                        reader.readAsDataURL(blob);
                      });
                      return {originVisible, modelUnchanged: JSON.stringify(item.model) === beforeModel,
                        renderMode, renderModeAfter: source?.dataset?.roughMeshMode,
                        beforeWidth, data};
                    }''')
                    if export['originVisible'] != 'true' or not export['modelUnchanged'] or \
                            export['renderMode'] != export['renderModeAfter']:
                        raise RuntimeError('PNG diverged from current visible scene or changed model')
                    image_bytes = base64.b64decode(export.pop('data').split(',', 1)[1])
                    png_path = out / 'native-png-3x-wysiwyg.png'
                    png_path.write_bytes(image_bytes)
                    with Image.open(BytesIO(image_bytes)) as png:
                        export['pngSize'] = list(png.size)
                    if export['pngSize'][0] < export['beforeWidth']:
                        raise RuntimeError('Native PNG did not capture expected scene resolution')
                    report['pngWysiwyg'] = export
                    report['images']['nativePng'] = {'file': png_path.name,
                                                     'sha256': snapshot_sha(png_path)}
                if args.inspect_ui_controls and ready:
                    base_img = out / 'isolated-before-highlight.png'
                    page.screenshot(path=str(base_img), animations='disabled')
                    selection = page.evaluate('''() => {
                      const item = window.__wafercadOfflineModel;
                      const layer = item?.model?.layers?.filter(x => x.visible !== false)?.at(-1);
                      if (!layer || typeof item.renderer.highlightLayer !== 'function')
                        return { supported: false };
                      window.__wafercadInspectionModelBefore = JSON.stringify(item.model);
                      item.renderer.highlightLayer(layer.id);
                      return {supported: true, selectedLayerId: String(layer.id),
                        hostLayerId: item.host.dataset.highlightLayerId};
                    }''')
                    page.wait_for_timeout(300)
                    selected_img = out / 'isolated-after-highlight.png'
                    page.screenshot(path=str(selected_img), animations='disabled')
                    selection['imageChanged'] = snapshot_sha(base_img) != snapshot_sha(selected_img)
                    selection['beforeSha256'] = snapshot_sha(base_img)
                    selection['afterSha256'] = snapshot_sha(selected_img)
                    alternate = page.evaluate('''() => {
                      const item = window.__wafercadOfflineModel;
                      const layers = item.model.layers.filter(layer => layer.visible !== false);
                      const current = item.host.dataset.highlightLayerId;
                      const next = layers.find(layer => String(layer.id) !== current);
                      if (!next) return {available: false};
                      item.renderer.highlightLayer(next.id);
                      return {available: true, selectedLayerId: String(next.id),
                        hostLayerId: item.host.dataset.highlightLayerId};
                    }''')
                    if alternate['available']:
                        page.wait_for_timeout(300)
                        switched_img = out / 'isolated-switched-focus.png'
                        page.screenshot(path=str(switched_img), animations='disabled')
                        alternate['imageChanged'] = snapshot_sha(switched_img) != snapshot_sha(selected_img)
                        alternate['switchedSha256'] = snapshot_sha(switched_img)
                    selection['alternateFocus'] = alternate
                    selection.update(page.evaluate('''() => {
                      const item = window.__wafercadOfflineModel;
                      item.renderer.highlightLayer(null);
                      const result = {
                        cleared: item.host.dataset.highlightLayerId === '',
                        modelUnchanged: JSON.stringify(item.model) === window.__wafercadInspectionModelBefore,
                      };
                      delete window.__wafercadInspectionModelBefore;
                      return result;
                    }'''))
                    page.wait_for_timeout(250)
                    restored_img = out / 'isolated-restored-highlight.png'
                    page.screenshot(path=str(restored_img), animations='disabled')
                    selection['restoredImageMatchesBefore'] = snapshot_sha(base_img) == snapshot_sha(restored_img)
                    selection['restoredSha256'] = snapshot_sha(restored_img)
                    report['isolatedThreeLayerInspection'] = selection
                image = out / 'isolated-native-model.png'
                page.screenshot(path=str(image), animations='disabled')
                report['images']['isolatedNativeModel'] = {
                    'file': image.name, 'sha256': snapshot_sha(image)}
                report['isolatedNativeModel'] = {
                    'ready': ready, 'roughMeshCompleted': rough_ready,
                    'roughCompletionTimedOut': rough_completion_timeout,
                    'geometry': details, 'renderer': state,
                    'source': input_evidence or 'production createModel three-material demo',
                    'workstationStateLoaded': False, 'recoveryVerified': False}
                if args.capture_continuous_appearance:
                    appearance = page.evaluate('''async () => {
                      const {model, renderer, host} = window.__wafercadOfflineModel;
                      const api = await import('https://wafercad.local/model.js');
                      const {validateContinuousEtchModel} = await import('https://wafercad.local/continuous-etch-model.js');
                      const oldRevision = model.revision;
                      const originalTriangles = host.dataset.continuousEtchTriangles;
                      const oxide = model.layers.find(l => l.id !== 'base');
                      if (!oxide) throw Error('Missing physical oxide in continuous presentation');
                      api.recolorLayer(model, oxide.id, '#ef852f');
                      api.setLayerVisible(model, 'base', false);
                      validateContinuousEtchModel(model);
                      await renderer.render();
                      if (model.revision !== oldRevision) throw Error('Display edit changed physical revision');
                      if (host.dataset.continuousEtchTriangles !== originalTriangles)
                        throw Error('Display edit rebuilt canonical continuous geometry');
                      return {modelRevision: model.revision, triangleCount: originalTriangles,
                        hiddenBase: model.layers.find(l=>l.id==='base').visible===false,
                        oxideColor: oxide.color, renderState:host.dataset.renderState};
                    }''')
                    page.wait_for_timeout(350)
                    appearance_image = out / 'continuous-appearance-hidden-base.png'
                    page.screenshot(path=str(appearance_image), animations='disabled')
                    report['images']['continuousAppearanceHidden'] = {
                        'file': appearance_image.name, 'sha256': snapshot_sha(appearance_image)}
                    report['continuousAppearance'] = appearance
                    restored = page.evaluate('''async () => {
                      const {model, renderer, host} = window.__wafercadOfflineModel;
                      const api = await import('https://wafercad.local/model.js');
                      api.setLayerVisible(model, 'base', true);
                      await renderer.render();
                      return {visible: model.layers.find(l=>l.id==='base').visible,
                        renderState: host.dataset.renderState};
                    }''')
                    page.wait_for_timeout(350)
                    restored_image = out / 'continuous-appearance-restored.png'
                    page.screenshot(path=str(restored_image), animations='disabled')
                    report['images']['continuousAppearanceRestored'] = {
                        'file': restored_image.name, 'sha256': snapshot_sha(restored_image)}
                    report['continuousAppearanceRestored'] = restored
                    if not (appearance['hiddenBase'] and restored['visible']):
                        raise ValueError('Continuous display toggle failed')
                if args.inmemory_camera is not None:
                    # Explicit physical camera pose uses production ThreeView
                    # OrbitControls (not a fabricated geometry/camera overlay).
                    camera = page.evaluate('''(values) => {
                      const renderer = window.__wafercadOfflineModel?.renderer;
                      const old = renderer?.getViewState?.();
                      if (!old) throw new Error('Production 3D view has no camera state');
                      const next = {
                        position: values.slice(0, 3),
                        target: values.slice(3),
                        fov: old.fov,
                      };
                      if (!renderer.setViewState(next)) throw new Error('Camera pose rejected');
                      return renderer.getViewState();
                    }''', list(args.inmemory_camera))
                    page.wait_for_timeout(450)
                    camera_image = out / 'continuous-physical-camera.png'
                    page.screenshot(path=str(camera_image), animations='disabled')
                    report['images']['continuousPhysicalCamera'] = {
                        'file': camera_image.name, 'sha256': snapshot_sha(camera_image)}
                    report['continuousPhysicalCamera'] = camera
                if args.inmemory_camera is None and model_input['model'] and model_input['model'].get('kernel') == 'vector-continuous-etch-v1':
                    # The default underside diagnostic runs only without an
                    # explicit physical camera; a second view switch is
                    # redundant and can stall software WebGL on dense meshes.
                    # Switch the *production* ThreeView camera to the underside
                    # without repeated SwiftShader interactions or synthetic geometry.
                    camera_state = page.evaluate('''() => {
                      const renderer=window.__wafercadOfflineModel?.renderer;
                      const state=renderer?.getViewState?.();
                      if(!state) return null;
                      const [x,y,z]=state.position, [tx,ty,tz]=state.target;
                      return renderer.setViewState({
                        ...state, position:[x,y,tz-Math.max(5,Math.abs(z-tz)*1.4)]
                      });
                    }''')
                    if camera_state:
                        page.wait_for_timeout(500)
                        underside = out / 'continuous-release-underneath.png'
                        page.screenshot(path=str(underside), animations='disabled')
                        report['images']['continuousUnderside'] = {
                            'file': underside.name, 'sha256': snapshot_sha(underside)}
                report['limitations'].append(
                    'Isolated native Three.js viewport: Main/Mask/Section, History and Recovery are not synchronized.')
                if not ready:
                    fail = True
                if args.native_section_compare:
                    if not args.rough_cutline or not args.inmemory_roi:
                        raise ValueError('Native Section comparison requires --rough-cutline and --inmemory-roi')
                    import base64
                    expression = (root / 'scripts/offline-native-section-comparison.js').read_text(encoding='utf-8')
                    section_images = page.evaluate(expression, {
                        'roiBounds': args.inmemory_roi, 'line': args.rough_cutline,
                        'zBreak': args.inmemory_z_break, 'borders': args.native_section_borders})
                    section_data = {'modelUnchanged': section_images['modelUnchanged'],
                                    'actualProductionSectionRenderer': section_images['actualProductionSectionRenderer']}
                    for section_mode in ('physical',):
                        result = section_images[section_mode]
                        if result['sampleMode'] != section_mode:
                            raise RuntimeError('Native Section mode incorrectly selected')
                        name = 'native-section-' + section_mode + '.png'
                        section_path = out / name
                        section_path.write_bytes(base64.b64decode(result['png'].split(',', 1)[1]))
                        report['images'][name] = {'file': name, 'sha256': snapshot_sha(section_path)}
                        section_data[section_mode] = {'density': result['pixelDensity'], 'image': name}
                    report['nativeSectionComparison'] = section_data
                if args.check_rough_parity:
                    expression = (root / 'scripts/offline-native-rough-parity.js').read_text(encoding='utf-8')
                    report['roughHeightParity'] = page.evaluate(expression, model_input['model'])
                if args.check_glb:
                    expression = (root / 'scripts/offline-native-glb-check.js').read_text(encoding='utf-8')
                    report['physicalGlb'] = page.evaluate(expression)
                if args.rough_cutline:
                    roi = args.inmemory_roi
                    density = 1100 / (roi[2] - roi[0]) if roi else 100
                    report['physicalRoughCutline'] = page.evaluate('''(params) => {
                      const instance = window.__wafercadOfflineModel;
                      const before = JSON.stringify(instance.model);
                      const result = instance.renderer.sampleRoughCutline(params);
                      if (before !== JSON.stringify(instance.model)) {
                        throw Error('Read-only cutline probe mutated project data');
                      }
                      return { ...result, modelUnchanged: true };
                    }''',
                      {'xMin': args.rough_cutline[0], 'xMax': args.rough_cutline[1],
                       'y': args.rough_cutline[2], 'pixelsPerUm': density, 'samples': 65})
                    if report['physicalRoughCutline']['missingCount']:
                        raise RuntimeError('Rough cutline missed real mesh positions')
                    for point in report['physicalRoughCutline']['points']:
                        if abs(point['errorUm'] - point['meshInterpolationErrorUm'] -
                               point['displayAttenuationErrorUm']) > 1e-9:
                            raise RuntimeError('Rough error decomposition violated signed sum')
            report['httpRequestsAllowed'] = dict(counts)
            report['rejectedRequests'] = rejected
            # Only exact build-info.json is known harmless; any other denial needs review.
            report['unexpectedRejections'] = [v for v in rejected if not is_optional_build_info_rejection(v)]
            report['nativeVisualEvidence'] = bool(three_ok and report['fourViewsVisible']
                                                   and not errors and not report['unexpectedRejections'])
            report['evidenceTier'] = ('native-origin-unreviewed' if mode == 'https-origin'
                                       else 'null-origin-native-diagnostic-only')
            fail = fail or not report['nativeVisualEvidence']
            if args.project and mode != 'https-origin':
                # The four-view diagnostic can pass, but project must remain unverified.
                report['projectAcceptance'] = False
            if args.project and mode == 'https-origin':
                report['projectAcceptance'] = False  # Requires independent review and Worker assertions.
            ctx.close()
            browser.close()
    (out / 'native-app.evidence.json').write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n')
    print(json.dumps({'evidence': str(out / 'native-app.evidence.json'),
                      'nativeThreeRendered': report['nativeThreeRendered'],
                      'fourViewsVisible': report['fourViewsVisible'],
                      'bootstrapMode': report['bootstrapMode'],
                      'evidenceTier': report['evidenceTier'],
                      'pageErrors': len(errors), 'unexpectedRejections': len(report['unexpectedRejections'])}, indent=2))
    return 1 if fail else 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument('--browser', help='Installed Chromium executable (or WAFERCAD_CHROMIUM)')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--project', type=Path, help='Optional native Open; only attempted on HTTPS origin')
    model_group = parser.add_mutually_exclusive_group()
    model_group.add_argument('--inmemory-demo', action='store_true',
                             help='Render a production three-material in-memory model in isolated ThreeView')
    model_group.add_argument('--inmemory-project', type=Path,
                             help='Strictly parse a real .wafercad in Node and render its model in isolated ThreeView')
    parser.add_argument('--inmemory-roi', help='xMin,yMin,xMax,yMax in physical micrometres; for --inmemory-project')
    parser.add_argument('--inmemory-z-break', help='top,bottom Z coordinates in physical micrometres; for --inmemory-project')
    parser.add_argument('--inmemory-camera', help='Camera x,y,z,targetX,targetY,targetZ in physical micrometres; for --inmemory-project')
    parser.add_argument('--capture-continuous-appearance', action='store_true',
                        help='Test real continuous-material layer color and visibility without rebuilding mesh')
    parser.add_argument('--capture-continuous-ui', action='store_true',
                        help='Capture and inspect the real experimental Continuous Etch Process form')
    parser.add_argument('--inmemory-relief-scale', type=int, choices=(1, 10, 30), default=1,
                        help='Opt-in local monotone roughness relief display magnification')
    parser.add_argument('--inmemory-opacity', type=float, default=1,
                        help='Local in-memory renderer inspection opacity for transparency diagnosis')
    parser.add_argument('--inmemory-z-scale', type=float, default=1,
                        help='Diagnostic-only continuous 3D Z multiplier (0.25 to 20)')
    parser.add_argument('--wait-ms', type=int, default=5500)
    parser.add_argument('--width', type=int, default=1600)
    parser.add_argument('--height', type=int, default=1000)
    parser.add_argument('--check-z-ui', action='store_true', help='Exercise real v2 display-only Z menu')
    parser.add_argument('--check-rough-parity', action='store_true', help='Probe production GLSL at Photodetector physical coordinates')
    parser.add_argument('--check-stable-rough-ui', action='store_true', help='Apply stable rough Etch/ALD and verify native Undo, Save, file Open and reload on a 2 um base')
    parser.add_argument('--check-glb', action='store_true', help='Check production physical GLB stable-profile heights and 50 nm film')
    parser.add_argument('--check-png-wysiwyg', action='store_true',
                        help='Capture exact native 3D PNG with origin on and compare scene state')
    parser.add_argument('--quality', action='store_true', help='Use Quality instead of Fast 3D mesh budget')
    parser.add_argument('--rough-cutline', help='Physical xMin,xMax,y versus actual 3D rough mesh')
    parser.add_argument('--native-section-compare', action='store_true',
                        help='Compare genuine physical Section canvas against the actual 3D mesh')
    parser.add_argument('--native-section-borders', action='store_true', help='Include real structural Section borders in native model comparison')
    parser.add_argument('--headless', action='store_true', help='Opt out of headful/Xvfb; may disable WebGL')
    parser.add_argument('--require-origin', action='store_true', help='Fail rather than use null-origin diagnostic')
    parser.add_argument('--inspect-ui-controls', action='store_true',
                        help='Inspect actual phone Main/Section toolbars and transient layer selection')
    parser.add_argument('--inspect-history', action='store_true',
                        help='Capture real History Step 0 and Process Undo controls (visual only)')
    args = parser.parse_args()
    if not 300 <= args.width <= 4096 or not 300 <= args.height <= 4096 or not 500 <= args.wait_ms <= 60000:
        parser.error('Invalid dimensions or wait interval')
    if not math.isfinite(args.inmemory_z_scale) or not 0.25 <= args.inmemory_z_scale <= 20:
        parser.error('In-memory 3D Z scale must be finite and between 0.25 and 20')
    if not math.isfinite(args.inmemory_opacity) or not 0.1 <= args.inmemory_opacity <= 1:
        parser.error('In-memory inspection opacity must be between 0.1 and 1')
    if args.capture_continuous_appearance and not args.inmemory_project:
        parser.error('Continuous appearance capture requires an in-memory project')
    if (args.inmemory_roi or args.inmemory_z_break or args.inmemory_camera) and not args.inmemory_project:
        parser.error('ROI, Z break and camera require --inmemory-project')
    if args.native_section_borders and not args.native_section_compare:
        parser.error('--native-section-borders requires --native-section-compare')
    if args.native_section_compare and (not args.rough_cutline or not args.inmemory_roi):
        parser.error('--native-section-compare requires --rough-cutline and --inmemory-roi')
    if args.check_rough_parity and not args.inmemory_project:
        parser.error('Rough height parity requires --inmemory-project')
    if args.check_glb and not args.inmemory_project:
        parser.error('Physical GLB check requires --inmemory-project')
    if (args.rough_cutline or args.quality or args.native_section_compare or args.native_section_borders) and not args.inmemory_project:
        parser.error('Rough cutline and Quality require --inmemory-project')
    try:
        args.inmemory_roi = parse_native_bounds(args.inmemory_roi, 'ROI', 4)
        args.inmemory_z_break = parse_native_bounds(args.inmemory_z_break, 'Z break', 2)
        if args.rough_cutline:
            values = [float(part) for part in args.rough_cutline.split(',')]
            if len(values) != 3 or not all(math.isfinite(v) for v in values) or values[1] <= values[0]:
                raise ValueError('Rough cutline must be finite xMin,xMax,y with xMax > xMin')
            args.rough_cutline = values
        args.inmemory_camera = parse_native_camera(args.inmemory_camera)
    except ValueError as exc:
        parser.error(str(exc))
    try:
        return run(args)
    except Exception as exc:
        print(f'Offline native app capture failed: {exc}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
