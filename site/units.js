export const XY_UNITS=Object.freeze({
  nm:Object.freeze({label:'nm',fromMicron:1000,toMicron:.001}),
  um:Object.freeze({label:'µm',fromMicron:1,toMicron:1}),
  mm:Object.freeze({label:'mm',fromMicron:.001,toMicron:1000})
});

export function unitMeta(unit){
  return XY_UNITS[unit]||XY_UNITS.um;
}

export function toMicron(value,unit='um'){
  return Number(value)*unitMeta(unit).toMicron;
}

export function fromMicron(value,unit='um'){
  return Number(value)*unitMeta(unit).fromMicron;
}

export function convertXY(value,fromUnit='um',toUnit='um'){
  return fromMicron(toMicron(value,fromUnit),toUnit);
}

export function formatXY(valueMicron,unit='um',digits=3){
  const v=fromMicron(valueMicron,unit),a=Math.abs(v);
  if(a===0)return '0';
  if(a>=10000)return Number(v.toFixed(0)).toLocaleString('en-US',{useGrouping:false});
  if(a>=100)return Number(v.toFixed(1)).toString();
  if(a>=1)return Number(v.toFixed(2)).toString();
  return Number(v.toPrecision(digits)).toString();
}
