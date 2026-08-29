import {NS} from './core.js';

export function makeSvg(tag,attrs={}){
  const element=document.createElementNS(NS,tag);
  for(const [key,value] of Object.entries(attrs))element.setAttribute(key,value);
  return element;
}

export function clearSvg(svg){while(svg.firstChild)svg.removeChild(svg.firstChild);}
