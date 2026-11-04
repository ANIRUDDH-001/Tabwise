// Single source of truth for every navigation surface (T-P0-01, REV-05).
// Pure functions: no user data, no storage, no network.
export const R1_RUN_ID='r1-20261028T134638Z';
export const R1_REPORT_SLUG='r1-diagnostic';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const ROOTS=new Set(['/','/w/me','/w/demo']);

export function primaryNavigation(){return [
 {id:'demo',label:'Demo',note:'Public · no account',items:[
  {label:'Demo workspace',href:'/w/demo'},
  {label:'Sample app',href:'/apps/fernway'},
  {label:'Journeys',href:'/journeys'},
  {label:'R1 trace',href:`/runs/${R1_RUN_ID}`},
  {label:'R1 report',href:`/r/${R1_REPORT_SLUG}`},
 ]},
 {id:'workspace',label:'Your workspace',note:'GitHub sign-in',items:[
  {label:'Overview',href:'/w/me'},
  {label:'Saved journeys',href:'/w/me/journeys'},
  {label:'Runs',href:'/w/me/runs'},
  {label:'Reports',href:'/w/me/reports'},
 ]},
 {id:'status',label:'Status',note:'What works today',items:[{label:'Status',href:'/status'}]},
];}

// Top bar: compact entry points into each group.
export function topNavigation(){return [
 {id:'demo',label:'Demo',items:[{label:'Demo workspace',href:'/w/demo'},{label:'Journeys',href:'/journeys'},{label:'Sample app',href:'/apps/fernway'}]},
 {id:'status',label:'Status',items:[{label:'Status',href:'/status'}]},
 {id:'workspace',label:'Your workspace',items:[{label:'Your workspace',href:'/w/me'}]},
];}

export function cleanPath(pathname){
 let path=String(pathname??'/').split(/[?#]/)[0]||'/';
 if(path.length>1)path=path.replace(/\/+$/,'')||'/';
 return path;
}

// Exact match for roots; segment-prefix match otherwise. Never matches on query or hash.
export function isActive(href,pathname){
 if(typeof href!=='string'||href.includes('#')||href.includes('?'))return false;
 const path=cleanPath(pathname),target=cleanPath(href);
 if(ROOTS.has(target))return path===target;
 return path===target||path.startsWith(target+'/');
}

// At most one active href per list: the longest matching href wins.
export function activeHref(hrefs,pathname){
 let best=null;for(const href of hrefs)if(isActive(href,pathname)&&(!best||href.length>best.length))best=href;
 return best;
}

export function sectionFor(pathname){
 const path=cleanPath(pathname),parts=path.split('/').filter(Boolean);
 if(path==='/')return 'public';
 if(path==='/status')return 'status';
 if(parts[0]==='w'&&parts[1]==='demo')return 'demo';
 if(parts[0]==='w'&&parts[1]==='me')return 'workspace';
 if(parts[0]==='runs'&&parts[1])return UUID.test(parts[1])?'workspace':'demo';
   if(parts[0]==='patches'||parts[0]==='verifications'||parts[0]==='candidate-runs')return 'workspace';
 if(parts[0]==='journeys'&&parts[1]==='versions')return 'workspace';
 if(parts[0]==='journeys'||parts[0]==='r'||parts[0]==='apps')return 'demo';
 if(parts[0]==='auth')return 'workspace';
 return 'public';
}

// The navigation item that owns a detail page (highlighted, but not aria-current).
export function parentHref(pathname){
 const path=cleanPath(pathname),parts=path.split('/').filter(Boolean);
 if(parts[0]==='runs'&&UUID.test(parts[1]??''))return parts[2]==='report'?'/w/me/reports':'/w/me/runs';
 if(parts[0]==='patches'||parts[0]==='verifications')return '/w/me/runs';
 if(parts[0]==='journeys'&&parts[1]==='versions')return '/w/me/journeys';
 if(parts[0]==='w'&&parts[1]==='me'&&parts[2]==='ops')return '/w/me';
 if(parts[0]==='auth')return '/w/me';
 return null;
}

// Returns {href, exact} for a list: exact => aria-current="page"; parent => visual highlight only.
export function currentInList(hrefs,pathname){
 const exact=activeHref(hrefs,pathname);
 if(exact)return {href:exact,exact:true};
 const parent=parentHref(pathname);
 return parent&&hrefs.includes(parent)?{href:parent,exact:false}:null;
}

const short=id=>String(id).slice(0,8);
const DEMO={href:'/w/demo',label:'Demo'},WORK={href:'/w/me',label:'Your workspace'};

// Ordered {href,label} crumbs; the last crumb is the current page (href null).
export function breadcrumbsFor(pathname,labels={}){
 const path=cleanPath(pathname),parts=path.split('/').filter(Boolean),name=(id,fallback)=>labels[id]??fallback;
 const end=label=>({href:null,label});
 if(path==='/')return [];
 if(path==='/status')return [end('Status')];
 if(path==='/w/demo')return [end('Demo')];
 if(path==='/apps/fernway')return [DEMO,end('Sample app')];
 if(path==='/journeys')return [DEMO,end('Journeys')];
 if(parts[0]==='journeys'&&parts[1]==='versions'&&parts[2])return [WORK,{href:'/w/me/journeys',label:'Saved journeys'},end(name(parts[2],`Version ${short(parts[2])}`))];
 if(parts[0]==='journeys'&&parts[2]==='edit')return [DEMO,{href:'/journeys',label:'Journeys'},end(name(parts[1],parts[1]))];
 if(parts[0]==='r'&&parts[1])return [DEMO,{href:`/runs/${R1_RUN_ID}`,label:'R1 trace'},end('R1 report')];
 if(parts[0]==='runs'&&parts[1]&&!UUID.test(parts[1]))return [DEMO,end('R1 trace')];
 if(parts[0]==='runs'&&parts[1]){
  const run={href:`/runs/${parts[1]}`,label:name(parts[1],`Run ${short(parts[1])}`)};
  return parts[2]==='report'?[WORK,{href:'/w/me/reports',label:'Reports'},run,end('Report')]:[WORK,{href:'/w/me/runs',label:'Runs'},end(run.label)];
 }
 if(parts[0]==='patches'&&parts[1])return [WORK,{href:'/w/me/runs',label:'Runs'},end(`Patch ${short(parts[1])}`)];
 if(parts[0]==='verifications'&&parts[1])return [WORK,{href:'/w/me/runs',label:'Runs'},end(`Verification ${short(parts[1])}`)];
 if(path==='/w/me')return [end('Your workspace')];
 if(parts[0]==='w'&&parts[1]==='me'&&parts[2]){
  const labelsFor={journeys:'Saved journeys',runs:'Runs',reports:'Reports',ops:'Operations'};
  return [WORK,end(labelsFor[parts[2]]??parts[2])];
 }
 if(path==='/auth/unavailable')return [end('Sign-in unavailable')];
 return [end('Page')];
}
