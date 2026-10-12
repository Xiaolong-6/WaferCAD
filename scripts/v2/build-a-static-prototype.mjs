// Offline bundling of native templates and frozen source fixtures. No browser fetch/core.
import { readFile, writeFile } from 'node:fs/promises';
import { format } from 'prettier';
import { Script } from 'node:vm';
const target = 'site/ui-v2/prototypes/a-full';
const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const source = (name) => readFile(`${target}/source/${name}`, 'utf8');
const strip = (text) =>
  text.replace(/^import\s+[\s\S]*?from\s+'[^']+';\r?\n/gm, '').replace(/^export /gm, '');
const fixtureText = await source('prototype-data.json');
let controller = strip(await source('prototype.js'));
const fetchBlock =
  /const response = await window\.fetch\('\.\/prototype-data\.json'\);\s*if \(!response\.ok\) throw new Error\(`Fixture HTTP \$\{response\.status\}`\);\s*const payload = await response\.json\(\);/;
if (!fetchBlock.test(controller)) throw new Error('Fixture binding changed; review bundler.');
controller = controller.replace(
  fetchBlock,
  () => `const payload = ${JSON.stringify(JSON.parse(fixtureText))};`,
);
const js = `(() => {\n${strip(await source('prototype-icons.js'))}\n${strip(await source('prototype-components.js'))}\n${controller}\n})();`;
new Script(js);
if (/window\.fetch|^import /m.test(js)) throw new Error('Runtime must be directly file-openable.');
const css = await source('prototype.css');
const inner = `<!doctype html><html lang="en" data-ui="v2-prototype" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="../../tokens.css"><link rel="stylesheet" href="../../components.css"><style>${css}</style></head><body><main id="prototype-root"></main><script>window.addEventListener('error',()=>parent.document.body.dataset.errors=String(Number(parent.document.body.dataset.errors)+1));window.addEventListener('unhandledrejection',()=>parent.document.body.dataset.errors=String(Number(parent.document.body.dataset.errors)+1));${js.replace(/<\/script/gi, '<\\/script')}</script></body></html>`;
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>A · Recipe inside Process · M1.5 round 2</title><link rel="icon" href="data:,"><link rel="stylesheet" href="../../tokens.css"><link rel="stylesheet" href="../layout.css"><style>#frame{height:1000px;border:0} .debug{position:relative} .debug label{gap:4px}</style></head><body data-ready="false" data-errors="0"><header class="debug"><a href="../index.html">入口</a><strong>A · Recipe 在 Process 内</strong><label>宽度<select id="width"><option>1440</option><option>1024</option><option>768</option><option>390</option></select></label><label>示例<select id="example"><option value="m3d">M3D · 27 层 / 35 步</option><option value="photodetector">Photodetector · 7 Variants</option></select></label><label>工作区<select id="domain"><option value="project">Project</option><option value="mask">Mask</option><option value="process" selected>Process · Manual</option><option value="recipe">Process · Recipe</option><option value="history">History</option></select></label><label><input id="empty" type="checkbox">空 / 有 History</label><label><input id="failure" type="checkbox">Recipe 第 3 步失败</label><label>字体<select id="font"><option value="system">系统栈</option><option value="inter">Inter WOFF2</option></select></label><a href="fonts.html">字体对比（待你选）</a><span class="aux">静态数据 / 模拟操作 / 无核心和存储写入</span></header><div class="frame-scroll"><iframe id="frame" title="A complete prototype" srcdoc="${escape(inner)}"></iframe></div><script>
const frame=document.getElementById('frame'), ids=['width','example','domain','empty','failure','font'];
const q=new URL(location.href).searchParams;for(const id of ['width','example','domain','font'])if(q.has(id))document.getElementById(id).value=q.get(id);
function update(){frame.style.width=document.getElementById('width').value+'px';const api=frame.contentWindow.WaferCadM15;if(!api?.ready)return;api.debug({example:document.getElementById('example').value,domain:document.getElementById('domain').value,font:document.getElementById('font').value,empty:document.getElementById('empty').checked,failed:document.getElementById('failure').checked});document.body.dataset.ready='true'}
frame.addEventListener('load',()=>{update();for(const eventName of ['click','change'])frame.contentDocument.addEventListener(eventName,()=>{const state=frame.contentWindow.WaferCadM15?.snapshot().state;if(state){document.getElementById('domain').value=state.domain;document.getElementById('empty').checked=state.empty;document.getElementById('failure').checked=state.failedStep!=null}})});ids.forEach(id=>document.getElementById(id).addEventListener('change',()=>{if(id==='empty'&&document.getElementById(id).checked)document.getElementById('domain').value='history';if(id==='failure'&&document.getElementById(id).checked)document.getElementById('domain').value='recipe';update()}));window.addEventListener('error',()=>document.body.dataset.errors=String(Number(document.body.dataset.errors)+1));
</script></body></html>\n`;
const samples = [11, 12, 13]
  .map(
    (size) =>
      `<p style="font-size:${size}px">${size}px · M3D HfO2 gate dielectric 10nm · −0.00035 µm · 0 O I l 1 · 1050°C · ρ Δ · 辅助文字 / 工艺步骤</p>`,
  )
  .join('');
const fonts = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>字体对比 · 用户选择待定</title><link rel="icon" href="data:,"><link rel="stylesheet" href="../../tokens.css"><link rel="stylesheet" href="../layout.css"><style>@font-face{font-family:'Inter Review';src:url('./fonts/InterVariable.woff2') format('woff2');font-weight:100 900;font-display:swap}.samples{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:16px}.sample{padding:16px;background:var(--wc-surface);border:1px solid var(--wc-border)}.sample p{font-variant-numeric:tabular-nums}</style></head><body class="index"><a href="index.html">返回 A 完整原型</a><h1>字体对比：由你选定</h1><p>统一 11 / 12 / 13px；原型顶部可切换字体看实际折行。两种方案中文均使用系统回退。生产 tokens 未改。</p><div class="samples"><section class="sample" style="font-family:'Segoe UI',system-ui,sans-serif"><h2>系统字体栈</h2>${samples}<p>零额外字体字节，无字体加载 / swap；跨操作系统字形与宽度不同。</p></section><section class="sample" style="font-family:'Inter Review','Segoe UI',system-ui,sans-serif"><h2>本地 Inter Variable WOFF2</h2>${samples}<p>拉丁字母和数字跨平台一致；额外 352,240 字节（约 344 KiB），有加载 / swap，无内置中文。SIL OFL 1.1。</p></section></div><p>此审阅页同时加载候选字体；“零字节”指产品选择纯系统栈时，不是此对比页的总传输量。</p><p>已有 Windows 12px 单句测量：系统 237.40px / Inter 254.71px（宽约 7.3%）；仅这一句，不推断全界面。</p><p><a href="fonts/LICENSE.txt">OFL 许可证</a> · <a href="fonts/README.md">本地来源说明</a></p><p class="aux">固定上游 revision: 353b61b9f4430d5f420d56605a6e7993e0941470<br>WOFF2 SHA-256: 693b77d4f32ee9b8bfc995589b5fad5e99adf2832738661f5402f9978429a8e3</p></body></html>\n`;
const selectedHtml = html
  .replace(
    '<option value="recipe">Process · Recipe</option>',
    '<option value="recipe">Process · Recipe</option><option value="code">Process · Code</option>',
  )
  .replace(
    '<option value="inter">Inter WOFF2</option>',
    '<option value="inter" selected>Inter WOFF2</option>',
  )
  .replace('字体对比（待你选）', '字体对比（已选 Inter）');
const selectedFonts = fonts
  .replace('字体对比 · 用户选择待定', '字体对比 · 已选 Inter Variable')
  .replace('字体对比：由你选定', '已选 B · Inter Variable WOFF2 / system fallback');
for (const [name, content] of [
  ['index.html', selectedHtml],
  ['fonts.html', selectedFonts],
]) {
  const path = `${target}/${name}`;
  const formatted = await format(content, {
    ...JSON.parse(await readFile('.prettierrc.json', 'utf8')),
    parser: 'html',
  });
  if (process.argv.includes('--write')) await writeFile(path, formatted);
  else if ((await readFile(path, 'utf8')) !== formatted) throw new Error(`Stale ${path}`);
}
console.log('A round 2: direct-file HTML + font comparison; no Playwright/screenshots/core.');
