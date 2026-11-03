// Sidebar entries per workspace, derived from the shared site navigation model (T-P0-01).
// Owned entries are real routes (no hash anchors); the demo keeps the historical evidence.
import {primaryNavigation} from './site-navigation.mjs';
const icons={'/w/me':'◫','/w/me/journeys':'⌘','/w/me/runs':'≋','/w/me/reports':'▤','/w/demo':'◫','/apps/fernway':'⌁','/journeys':'⌘','/r/r1-diagnostic':'▤','/status':'◌'};
export function workspaceNavigation(owned){
 const groups=primaryNavigation(),group=groups.find(g=>g.id===(owned?'workspace':'demo'));
 return group.items.map(item=>[item.label,item.href,icons[item.href]??'≋']);
}
