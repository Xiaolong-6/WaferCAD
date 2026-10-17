#!/usr/bin/env python3
"""Capture the real WaferCAD v2 Shell HTML/CSS/JS entirely in Chromium memory."""
import argparse
import os
import shutil
import hashlib
import json
import re
from pathlib import Path
from playwright.sync_api import sync_playwright

SITE=Path(__file__).resolve().parent.parent/'site'
SCRIPTS=['ui-v2/view-state.js','ui-v2/view-icons.js','ui-v2/native-components.js','ui-v2/view-panel.js',
         'ui-v2/shell-registry.js','ui-v2/domain-adapters.js','ui-v2/overlay-manager.js','ui-v2/workstation-v2.js']
SELECTORS={'navigation':'.p-nav','topbar':'.p-topbar','viewbar':'.p-viewbar'}

def capture(output,component='navigation',mobile='edit',domain='project',width=390,height=844,theme='light',selected_view='main'):
    if component not in SELECTORS or mobile not in ('edit','view') or domain not in ('project','mask','process','history'):
        raise ValueError('Invalid Shell state')
    if theme != 'light':raise ValueError('WaferCAD currently ships light-only Shell tokens; dark is not a supported native capture')
    if selected_view not in ('main','mask','three'):raise ValueError('Invalid theme or selected view')
    if not (320<=width<=4096 and 320<=height<=4096):raise ValueError('Invalid dimensions')
    html=(SITE/'app.html').read_text()
    css_paths=[name.split('?')[0] for name in re.findall(r'<link\s+rel="stylesheet"\s+href="([^"]+)"',html)]
    sources={name:(SITE/name).read_text() for name in [*css_paths,*SCRIPTS]}
    css='\n'.join(sources[name] for name in css_paths)
    out=Path(output);out.mkdir(parents=True,exist_ok=True)
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=os.environ.get('WAFERCAD_CHROMIUM') or shutil.which('chromium') or shutil.which('chromium-browser') or None,headless=True,
                                  args=['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-background-networking'])
        try:
            page=browser.new_page(viewport={'width':width,'height':height});errors=[]
            page.on('pageerror',lambda err:errors.append(str(err)))
            page.set_content('<!doctype html><html lang="en" data-ui="v2" data-theme="'+theme+'"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style></head><body data-workstation><main id="app-root"></main></body></html>')
            for name in SCRIPTS:page.add_script_tag(content=sources[name])
            page.evaluate('''({mobile,domain,selectedView})=>{
              window.WaferCadV2Icons.installSprite();
              const registry=window.WaferCadV2ShellRegistry.defaults;
              const {el}=window.WaferCadV2Components;
              const panels=window.createWaferCadV2ViewPanels();
              const adapters=window.WaferCadV2DomainAdapters.create();
              const empty={mount:(host)=>host,onShow(){},onHide(){},destroy(){}};
              for(const name of registry.panels)adapters.register(`panel.${name}`,empty);
              for(const name of registry.processModes)adapters.register(`panel.process.${name}`,empty);
              for(const {key,label} of registry.views){adapters.register(`view.${key}`,{
                mount(host){const panel=panels.update(key,{class:'p-view','data-view':key},
                  el('header',{},el('strong',{},label)),
                  el('div',{class:'p-science','data-v2-stage-host':'','aria-label':`${label} not loaded`}),el('div'));
                  host.append(panel);return panel},onShow(){},onHide(){},destroy(){}})}
              const state={layout:'a',font:'inter',domain,mode:'single',view:selectedView,
                splitViews:['main','three'],section:false,maximize:null,mobile};
              const shell=window.createWaferCadV2Workstation({root:document.getElementById('app-root'),
                state,adapters,registry,getProjectName:()=> 'WaferCAD',
                presentation:()=>({selectedNavigation:domain,selectedPanel:domain,
                  message:'Shell inspection only',save:'No persistence'})});shell.render();
            }''',{'mobile':mobile,'domain':domain,'selectedView':selected_view})
            locator=page.locator(SELECTORS[component]);locator.wait_for(state='visible');bounds=locator.bounding_box()
            if not bounds or min(bounds['width'],bounds['height'])<1:raise RuntimeError('Native Shell target not visible')
            if errors:raise RuntimeError('Native Shell errors: '+ '; '.join(errors))
            if component == 'navigation' and mobile == 'edit':
                button=page.locator(f'.p-nav [data-action="domain:{domain}"]')
                if button.count()!=1 or button.get_attribute('aria-pressed')!='true':
                    raise RuntimeError('Native Shell selected domain state is incorrect')
            if component == 'navigation' and mobile == 'view' and width<=820:
                button=page.locator(f'.p-nav [data-action="view:{selected_view}"]')
                if button.count()!=1 or button.get_attribute('aria-pressed')!='true':
                    raise RuntimeError('Native Shell selected view state is incorrect')
            image=out/f'{component}-{width}-{mobile}-{domain}-{selected_view}-{theme}.png';locator.screenshot(path=str(image))
        finally:browser.close()
    evidence={'schema':'wafercad-offline-chat-shell-v1','component':component,'mobile':mobile,
              'selectedView':selected_view,'theme':theme,
              'domain':domain,'viewport':{'width':width,'height':height},'bbox':bounds,
              'sourceSha256':{name:hashlib.sha256(code.encode()).hexdigest() for name,code in sources.items()},
              'method':'actual v2 Shell source injected into about:blank',
              'nativeAppAcceptance':False,
              'limitations':['Empty adapters: no real project panels or scientific view canvases','No persistence or real-app navigation']}
    (out/f'{component}-{width}-{mobile}-{domain}-{selected_view}-{theme}.evidence.json').write_text(json.dumps(evidence,indent=2))
    return str(image)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--output',required=True)
    p.add_argument('--component',choices=SELECTORS,default='navigation')
    p.add_argument('--mobile',choices=['edit','view'],default='edit')
    p.add_argument('--domain',choices=['project','mask','process','history'],default='project')
    p.add_argument('--width',type=int,default=390);p.add_argument('--height',type=int,default=844)
    p.add_argument('--theme',choices=['light','dark'],default='light')
    p.add_argument('--selected-view',choices=['main','mask','three'],default='main')
    a=p.parse_args();print(capture(a.output,a.component,a.mobile,a.domain,a.width,a.height,a.theme,a.selected_view))