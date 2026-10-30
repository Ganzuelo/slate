// Local accent tokens shared by app surfaces. Selection/focus tokens stay neutral.
(() => {
 const defaultColor='#7f56d9';
 const presets=[['Purple',defaultColor],['Blue','#2563eb'],['Cyan','#0891b2'],['Green','#16a34a'],['Yellow','#eab308'],['Orange','#ea580c'],['Red','#dc2626'],['Pink','#db2777'],['Gray','#737373']];
 function normalize(value) {
  if(typeof value!=='string')return defaultColor;
  const color=value.trim().toLowerCase();
  if(/^#[0-9a-f]{6}$/.test(color))return color;
  if(/^#[0-9a-f]{3}$/.test(color))return '#'+[...color.slice(1)].map(char=>char+char).join('');
  return defaultColor;
 }
 const rgb=color=>normalize(color).slice(1).match(/../g).map(value=>parseInt(value,16));
 const hex=values=>'#'+values.map(value=>Math.round(value).toString(16).padStart(2,'0')).join('');
 function luminance(color) { return rgb(color).map(channel=>{const n=channel/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;}).reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0); }
 function contrast(a,b) { const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); }
 function readable(color,background,light) {
  const original=rgb(color),target=light?0:255;
  for(let step=0;step<=100;step++){const mixed=hex(original.map(channel=>channel+(target-channel)*step/100));if(contrast(mixed,background)>=4.5)return mixed;}
  return light?'#000000':'#ffffff';
 }
 function tokens(value,theme) {
  const solid=normalize(value),light=theme==='light';
  const on=contrast(solid,'#ffffff')>=contrast(solid,'#000000')?'#ffffff':'#000000';
  return {solid,on,readable:readable(solid,light?'#ffffff':'#1e1e1e',light)};
 }
 function apply(root,value) {
  const result=tokens(value,root.dataset.theme);
  for(const [name,color] of Object.entries({'--accent-solid':result.solid,'--accent-on':result.on,'--accent':result.readable,'--link':result.readable,'--accent-check':result.on==='#ffffff'?'url("/vendor/check.svg")':'url("/vendor/check-dark.svg")'}))root.style.setProperty(name,color);
  return result;
 }
 window.SlateAppearance=Object.freeze({defaultColor,presets,normalize,tokens,contrast,apply});
})();
