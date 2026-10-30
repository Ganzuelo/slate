// Native file/folder assignments. Palette names follow the current app theme.
import { emojis } from './emoji-data.js';
export { emojis };
const emojiIndex = new Map(emojis.map(item=>[item.id,item]));
export const emoji = id => emojiIndex.get(id) || null;
const validIcon = name => name.startsWith('emoji:') ? emojiIndex.has(name) : /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) && name.length<=100;
export const palette = Object.freeze(['Red','Orange','Yellow','Green','Cyan','Blue','Purple','Pink','Gray'].map(label=>Object.freeze({name:label.toLowerCase(),label})));
export function emptyConfig() { return {version:2,entries:{},recent:[]}; }
export function normalizeName(value) { return typeof value === 'string' ? value.trim().replace(/^lucide[:\-]/,'').replace(/([a-z0-9])([A-Z])/g,'$1-$2').toLowerCase() : ''; }
export function color(value) {
 if (palette.some(item=>item.name === value)) return 'var(--icon-' + value + ')';
 // Preserve earlier saved colors, but new choices use the named palette.
 return typeof value === 'string' && /^(?:#[0-9a-f]{3}|#[0-9a-f]{6})$/i.test(value) ? value : '';
}
function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
export function validateConfig(value) {
 const fail=()=>{throw new Error('Invalid icon settings. Use Lucide names or included emoji, included colors, and valid vault paths.');};
 if (!object(value) || ![1,2].includes(value.version) || !object(value.entries) || !Array.isArray(value.recent) || value.recent.length>24 || Object.keys(value.entries).length>20000) fail();
 const entries=Object.create(null);
 for (const [path,item] of Object.entries(value.entries)) {
  if(path.length>2048 || path.split('/').some(p=>!p || p.startsWith('.') || /[\\:\x00-\x1f<>"|?*]/.test(p) || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) fail();
  if(!object(item))fail();
  if(value.version===1 && item.hidden===true)continue;
  const icon=normalizeName(item.icon);
  if(!validIcon(icon) || (item.color && !color(item.color)))fail();
  entries[path]={icon,color:emoji(icon)?'':item.color||''};
 }
 const recent=value.recent.map(normalizeName);
 if(recent.some(name=>!validIcon(name)))fail();
 // Read the previous format without activating its rules, inheritance, or options.
 return {version:2,entries,recent:[...new Set(recent)]};
}
export function resolve(config,path,kind,metadata,registry) {
 if(!config || !path || path.startsWith('@'))return null;
 const item=Object.hasOwn(config.entries,path) ? config.entries[path] : null;
 const name=normalizeName(item?.icon);
 return name && (emoji(name) || Object.hasOwn(registry||{},name)) ? {icon:name,color:emoji(name)?'':item.color||'',source:'assignment'} : null;
}
// Search Lucide names using natural word separators; every word must match.
const searchGroups = {
 'food cooking dinner meal kitchen': 'apple banana bean beef beer bone candy candy-cane candy-off carrot chef-hat cherry citrus coffee cookie cooking-pot croissant cup-soda dessert donut drumstick egg egg-fried fish fish-off grape ham ice-cream-bowl ice-cream-cone lollipop martini milk nut pizza popsicle popcorn salad sandwich shrimp soup utensils utensils-crossed wheat wine',
 'work business office': 'briefcase briefcase-business building building-2 calendar clock clipboard laptop notebook-text presentation',
 'travel vacation holiday': 'backpack baggage-claim bus car compass globe luggage map map-pin plane sailboat ship suitcase train-front tent ticket',
 'idea inspiration': 'brain lightbulb sparkles',
 'favorite favourite love': 'bookmark heart star',
};
export function suggestions(query,names,recent=[]) {
 const words=query.toLowerCase().trim().split(/[\s_-]+/).filter(Boolean);
 const keywords=name=>Object.entries(searchGroups).filter(([,icons])=>icons.split(' ').includes(name)).map(([words])=>words).join(' ');
 return names.filter(name=>words.every(word=>(name+' '+keywords(name)).includes(word))).sort((a,b)=>{
  const rank=name=>!words.length && recent.includes(name) ? recent.indexOf(name)-100 : words.length && name.startsWith(words.join('-')) ? -1 : 0;
  return rank(a)-rank(b)||a.localeCompare(b);
 });
}
export function emojiSuggestions(query,recent=[]) {
 const q=query.trim().toLowerCase(),words=q.split(/[\s_-]+/).filter(Boolean);
 const aliases={smile:['smiling','grinning'],happy:['smiling','grinning','beaming'],laugh:['laughing','joy'],love:['heart'],thumbsup:['thumbs up'],thumbsdown:['thumbs down'],usa:['united states'],uk:['united kingdom']};
 const matches=emojis.filter(item=>words.every(word=>{
  const text=(item.name+' '+item.keywords).toLowerCase();
  return text.includes(word) || aliases[word]?.some(alias=>text.includes(alias)) || item.glyph.replaceAll('\uFE0F','').includes(word.replaceAll('\uFE0F',''));
 }));
 return matches.sort((a,b)=>{
  const rank=item=>!q && recent.includes(item.id)?recent.indexOf(item.id)-100:item.name.toLowerCase()===q?-1:0;
  return rank(a)-rank(b);
 }).map(item=>item.id);
}
