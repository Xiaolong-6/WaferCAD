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
            if args.inspect_history:
                # These are real app controls; null-origin remains diagnostic-only
                # because process Workers and Recovery cannot operate there.
                history_nav = page.locator('button[data-action="domain:history"]')
                process_nav = page.locator('button[data-action="domain:process"]')
                if history_nav.count() != 1 or process_nav.count() != 1:
                    raise RuntimeError('Native History/Process navigation controls are missing')
                history_nav.click()
                page.wait_for_timeout(350)
                base_step = page.locator('#snapshotList .snapshot-base-step')
                history_visible = base_step.count() == 1 and base_step.is_visible()
                history_img = out / 'history-step0.png'
                page.mouse.move(args.width - 8, args.height - 8)
                page.screenshot(path=str(history_img), animations='disabled')
                report['images']['historyStep0'] = {
                    'file': history_img.name, 'sha256': snapshot_sha(history_img)}
                base_step.click()
                page.wait_for_timeout(350)
                project_selected = page.locator('button[data-action="domain:project"][aria-pressed="true"]')
                base_editor_visible = page.locator('#applyBaseBtn').is_visible()
                step0_opens_editor = bool(project_selected.count() == 1 and base_editor_visible)
                editor_img = out / 'step0-base-editor.png'
                page.mouse.move(args.width - 8, args.height - 8)
                page.screenshot(path=str(editor_img), animations='disabled')
                report['images']['step0BaseEditor'] = {
                    'file': editor_img.name, 'sha256': snapshot_sha(editor_img)}
                process_nav.click()
                page.wait_for_timeout(350)
                undo = page.get_by_role('button', name='Undo model operation')
                redo = page.get_by_role('button', name='Redo model operation')
                process_actions = undo.count() == 1 and redo.count() == 1
                process_img = out / 'process-undo.png'
                page.mouse.move(args.width - 8, args.height - 8)
                page.screenshot(path=str(process_img), animations='disabled')
                report['images']['processUndo'] = {
                    'file': process_img.name, 'sha256': snapshot_sha(process_img)}
                report['historyProcessDiagnostic'] = {
                    'stepZeroVisible': history_visible,
                    'processUndoRedoVisible': process_actions,
                    'stepZeroOpensBaseEditor': step0_opens_editor,
                    'historyRecoveryVerified': False,
                }
                fail = fail or not (history_visible and process_actions and step0_opens_editor)
                project_nav = page.locator('button[data-action="domain:project"]')
                if project_nav.count():
                    project_nav.click()
                    page.wait_for_timeout(200)
            three_rect = before.get('three')
            three_ok = (bool(before['webgl']['available'])
                        and bool(before['webgl']['nativeThreeContext'])
                        and bool(three_rect and three_rect['width'] > 100 and three_rect['height'] > 100)
                        and not before['threeUnavailable'])
            report['nativeThreeRendered'] = three_ok
            report['fourViewsVisible'] = all(bool(before[k] and before[k]['width'] > 100)
                                             for k in ('main', 'mask', 'three', 'section'))
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
                trigger = page.locator('#threePanel [data-action="z-display:three"]')
                if trigger.count() != 1:
                    raise RuntimeError('Display-only Z toolbar trigger is missing')
                trigger.click()
                page.locator('[data-three-z-factor="2"]').click()
                page.wait_for_timeout(750)
                selected = page.locator('#threeHost').get_attribute('data-z-display-factor')
                indicator = page.locator('#threeHost .v2-three-z-display-indicator')
                indicator_text = indicator.inner_text() if indicator.is_visible() else ''
                image = out / 'three-z-display-ui.png'
                page.screenshot(path=str(image), animations='disabled')
                report['images']['zDisplayUi'] = {'file': image.name, 'sha256': snapshot_sha(image)}
                page.locator('[data-three-z-factor="1"]').click()
                page.wait_for_timeout(250)
                reverted = page.locator('#threeHost').get_attribute('data-z-display-factor')
                report['zDisplayUi'] = {'factor2': selected, 'indicator': indicator_text,
                                        'factor1Reverted': reverted, 'nullOrigin': mode != 'https-origin'}
                if selected != '2' or reverted != '1' or 'not physical' not in indicator_text:
                    raise RuntimeError('3D display-only Z control failed to render and revert')
                page.locator('[data-three-relief-factor="30"]').click()
                page.wait_for_timeout(900)
                relief_selected = page.locator('#threeHost').get_attribute(
                    'data-rough-relief-factor-selected')
                relief_indicator = indicator.inner_text() if indicator.is_visible() else ''
                relief_image = out / 'three-relief-display-ui.png'
                page.screenshot(path=str(relief_image), animations='disabled')
                report['images']['reliefDisplayUi'] = {
                    'file': relief_image.name, 'sha256': snapshot_sha(relief_image)}
                page.locator('[data-three-relief-factor="1"]').click()
                page.wait_for_timeout(500)
                relief_reverted = page.locator('#threeHost').get_attribute(
                    'data-rough-relief-factor-selected')
                report['roughReliefUi'] = {
                    'factor30': relief_selected, 'indicator': relief_indicator,
                    'factor1Reverted': relief_reverted, 'nullOrigin': mode != 'https-origin'}
                if relief_selected != '30' or relief_reverted != '1' or \
                        'not physical' not in relief_indicator:
                    raise RuntimeError('3D local relief control failed to render and revert')
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
                               'quality': args.quality}
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
                    roughDisplaySamplePitchUm:Number(item?.host?.dataset?.roughDisplaySamplePitchUm || 0),
                    roughDisplayBlendMin:Number(item?.host?.dataset?.roughDisplayBlendMin ?? 1),
                    roughRebuildCount:Number(canvas?.dataset?.roughRebuildCount || 0),
                    width:bounds?.width || 0,height:bounds?.height || 0};
                }''')
                rough_ready = (not details.get('roughCaps') or
                               (state['roughMeshMode'] == 'detailed' and
                                state['roughTriangleCount'] > 0 and
                                not rough_completion_timeout))
                ready = bool(details['initialized'] and state['ready'] and rough_ready
                             and state['renderState'] == 'ready'
                             and state['width'] > 100 and state['height'] > 100)
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
                report['limitations'].append(
                    'Isolated native Three.js viewport: Main/Mask/Section, History and Recovery are not synchronized.')
                if not ready:
                    fail = True
                if args.native_section_compare:
                    import base64
                    expression = (root / 'scripts/offline-native-section-comparison.js').read_text(encoding='utf-8')
                    section_images = page.evaluate(expression, {
                        'roiBounds': args.inmemory_roi, 'line': args.rough_cutline,
                        'zBreak': args.inmemory_z_break, 'borders': args.native_section_borders})
                    section_data = {
                        'modelUnchanged': section_images['modelUnchanged'],
                        'actualProductionSectionRenderer': section_images['actualProductionSectionRenderer']}
                    for section_mode in ('aligned', 'physical'):
                        result = section_images[section_mode]
                        if result['sampleMode'] != section_mode:
                            raise RuntimeError('Native production Section mode selection failed')
                        name = 'native-section-' + section_mode + '.png'
                        section_path = out / name
                        section_path.write_bytes(base64.b64decode(result['png'].split(',', 1)[1]))
                        report['images'][name] = {
                            'file': name, 'sha256': snapshot_sha(section_path)}
                        section_data[section_mode] = {
                            'density': result['pixelDensity'], 'image': name}
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
                    }''', {'xMin': args.rough_cutline[0], 'xMax': args.rough_cutline[1],
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
    parser.add_argument('--inmemory-relief-scale', type=int, choices=(1, 10, 30), default=1,
                        help='Opt-in local monotone roughness relief display magnification')
    parser.add_argument('--inmemory-z-scale', type=int, choices=(1, 2, 5, 10), default=1,
                        help='Diagnostic-only uniform 3D display Z multiplier')
    parser.add_argument('--wait-ms', type=int, default=5500)
    parser.add_argument('--width', type=int, default=1600)
    parser.add_argument('--height', type=int, default=1000)
    parser.add_argument('--check-z-ui', action='store_true', help='Exercise real v2 display-only Z menu')
    parser.add_argument('--check-rough-parity', action='store_true', help='Probe production GLSL at Photodetector physical coordinates')
    parser.add_argument('--check-stable-rough-ui', action='store_true', help='Apply stable rough Etch/ALD and verify native Undo, Save, file Open and reload on a 2 um base')
    parser.add_argument('--check-glb', action='store_true', help='Check production physical GLB stable-profile heights and 50 nm film')
    parser.add_argument('--quality', action='store_true', help='Use Quality instead of Fast 3D mesh budget for isolated model')
    parser.add_argument('--rough-cutline', help='Physical xMin,xMax,y to compare actual 3D CPU mesh against Section sampler')
    parser.add_argument('--native-section-compare', action='store_true',
                        help='Render real aligned/physical Section Canvas with production compositor')
    parser.add_argument('--native-section-borders', action='store_true',
                        help='Include Section structural borders in native comparison')
    parser.add_argument('--headless', action='store_true', help='Opt out of headful/Xvfb; may disable WebGL')
    parser.add_argument('--require-origin', action='store_true', help='Fail rather than use null-origin diagnostic')
    parser.add_argument('--inspect-history', action='store_true',
                        help='Capture real History Step 0 and Process Undo controls (visual only)')
    args = parser.parse_args()
    if not 300 <= args.width <= 4096 or not 300 <= args.height <= 4096 or not 500 <= args.wait_ms <= 60000:
        parser.error('Invalid dimensions or wait interval')
    if (args.inmemory_roi or args.inmemory_z_break) and not args.inmemory_project:
        parser.error('ROI and Z break require --inmemory-project')
    if args.check_rough_parity and not args.inmemory_project:
        parser.error('Rough height parity requires --inmemory-project')
    if args.check_glb and not args.inmemory_project:
        parser.error('Physical GLB check requires --inmemory-project')
    if args.native_section_borders and not args.native_section_compare:
        parser.error('--native-section-borders requires --native-section-compare')
    if args.native_section_compare and (not args.rough_cutline or not args.inmemory_roi):
        parser.error('--native-section-compare requires --rough-cutline and --inmemory-roi')
    if (args.rough_cutline or args.quality or args.native_section_compare) and not args.inmemory_project:
        parser.error('Rough cutline and Quality diagnostic require --inmemory-project')
    try:
        args.inmemory_roi = parse_native_bounds(args.inmemory_roi, 'ROI', 4)
        args.inmemory_z_break = parse_native_bounds(args.inmemory_z_break, 'Z break', 2)
        if args.rough_cutline:
            values = [float(part) for part in args.rough_cutline.split(',')]
            if len(values) != 3 or not all(math.isfinite(value) for value in values) or values[1] <= values[0]:
                raise ValueError('Rough cutline must be physical xMin,xMax,y with xMax > xMin')
            args.rough_cutline = values
    except ValueError as exc:
        parser.error(str(exc))
    try:
        return run(args)
    except Exception as exc:
        print(f'Offline native app capture failed: {exc}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
