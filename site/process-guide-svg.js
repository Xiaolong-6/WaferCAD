// Compact schematic cross sections; all shapes are illustrative.
const rect = (x,y,w,h,c) => '<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" fill="'+c+'"/>';
const blue = '#83a9c8', gold = '#e0b36a', green = '#79b29b', pale = '#f3f6f8';
const base = () => rect(6,57,208,60,blue);
const step = () => base()+rect(6,35,84,22,blue);
const arrow = () => '<path d="M110 9V36 M105 30L110 36L115 30" fill="none" stroke="#ce913f" stroke-width="2"/>';
export function processGuideSvg(id, after=false) {
  let shape=step();
  const deposited = (x,y,w,h,c=gold) => rect(x,y,w,h,c);
  if(id.startsWith('deposit-')) {
    if(id==='deposit-directional') shape+=after?deposited(6,27,84,8)+deposited(90,49,124,8):arrow();
    if(id==='deposit-conformal') shape+=after?deposited(6,27,84,8)+deposited(90,35,8,22)+deposited(98,49,116,8):arrow();
    if(id==='deposit-transfer-follow') shape+=after?deposited(6,26,84,6)+deposited(90,48,124,6):arrow();
    if(id==='deposit-transfer-flat') shape+=after?deposited(6,27,208,6):arrow();
  } else if(id.startsWith('extend-')) {
    shape+=deposited(6,27,84,8,green);
    if(after) shape+=deposited(6,18,84,9,green)+(id==='extend-conformal'?deposited(90,35,9,22,green)+deposited(99,48,115,9,green):'');
    else shape+=arrow();
  } else if(id.startsWith('etch-rough-')||id.startsWith('etch-pyramid-')) {
    shape=base();
    if(after) {
      const pyramid=id.includes('pyramid'), inverted=id.endsWith('inverted');
      const heights=pyramid?[57,34,57,34,57,34,57,34,57,34,57]:[57,44,53,37,52,43,57,35,54,42,57];
      const points=heights.map((h,i)=>[6+i*20.8,inverted?57+(57-h):h].join(',')).join(' ');
      shape='<polygon points="'+points+' 214,118 6,118" fill="'+blue+'"/>';
      shape+='<path d="M6 57H214" fill="none" stroke="#527694" stroke-width="1" stroke-dasharray="4 4"/>';
    } else shape+=arrow();
  } else if(id.startsWith('etch-')) {
    shape=base();
    if(id==='etch-planarize') {
      shape+=after?deposited(6,46,208,11):deposited(6,20,78,37)+deposited(84,36,66,21)+deposited(150,46,64,11);
      shape+='<path d="M6 46H214" stroke="#ce913f" stroke-dasharray="5 4"/>';
    } else if(id==='etch-isotropic'||id==='etch-undercut') {
      shape+=deposited(6,46,82,11,green)+deposited(132,46,82,11,green);
      if(after)shape+='<path d="M88 57Q68 74 84 97Q110 114 136 97Q152 74 132 57Z" fill="'+pale+'"/>';
      else shape+=arrow();
    } else {
      shape+=after?deposited(6,46,82,11)+deposited(132,46,82,11)+(id==='etch-directional'?rect(88,57,44,18,pale):''):deposited(6,46,208,11)+arrow();
    }
  } else if(id==='implant') {
    shape=base()+(after?rect(74,57,74,37,'#ab80ce'):arrow());
  } else if(id==='electrical') {
    shape=base()+(after?rect(74,57,74,37,'#64bda8'):arrow());
  } else if(id==='record') {
    shape=base()+(after?rect(91,12,38,25,gold):arrow());
  }
  return '<svg viewBox="0 0 220 124" xmlns="http://www.w3.org/2000/svg" aria-label="'+(after?'After':'Before')+'"><rect width="220" height="124" fill="'+pale+'"/>'+shape+'</svg>';
}
