import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ExcalidrawDiagram,COLORS} from './excalidraw-kit.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const out=path.join(root,'docs/architecture');
const nodes=[
 ['console','Bilingual console','client','browser','console/app.js','Author / Execute / Investigate'],
 ['api','API + authorization','module','go','workspace.go','Session / Role / Project / Tag policy'],
 ['scheduler','Run + resource scheduler','module','go','workspace_scheduler.go','Queue / Allocate / Barrier / Lease / Release'],
 ['workers','Managed worker contexts','module','go','workspace_series.go','Per-worker JS state / CSV partition'],
 ['protocols','Protocol + JMX engines','module','go','workspace_engine.go','Fixtures / SQLite SQL / Stateful Redis'],
 ['reports','Metrics + reports','module','go','workspace_metrics.go','Histograms / Series / Samples / Comparison'],
 ['ops','Operations + SLA','module','go','workspace_scheduler.go','Schedules / Inbox / Virtual terminal / Audit'],
 ['store','Workspace SQLite','store','disk','workspace.go','Entities / Sessions / Frozen bundles'],
 ['key','Environment encryption key','artifact','disk','workspace.go','AES-GCM / workspace.key / Mode 0600'],
 ['target','Bundled HTTP target','module','go','workspace.go','Native mode: measured loopback requests']
].map(([id,label,kind,plane,evidence,subtitle])=>({id,label,kind,plane,lifecycle:'existing',owner:plane==='browser'?'web client':'single Go deployment',evidence:'studio/'+evidence,subtitle}));
const flows=[
 ['console','api','sync-call','JSON / session cookie'],['api','scheduler','sync-call','Admit frozen run'],
 ['scheduler','workers','sync-call','Assign shards / cancel'],['workers','protocols','sync-call','Execute bounded samples'],
 ['workers','reports','data-write','Collect weighted samples'],['reports','ops','sync-call','Evaluate SLA windows'],
 ['scheduler','store','data-write','Commit lifecycle + bundles'],['key','store','data-write','Encrypt environment secrets'],
 ['protocols','target','sync-call','Native HTTP loopback only']
].map(([from,to,semantic,label])=>({from,to,semantic,label,direction:'forward'}));
const model={diagram:{title:'PerfMan · Implemented Go workspace',view:'as-is',direction:'left-to-right',question:'What runs today, and where does simulated execution end?'},nodes,flows,boundaries:[{id:'process',label:'Single Go process',type:'process',owner:'workspace server',lifecycle:'existing',evidence:'studio/cmd/perfman/main.go'}],constraints:['Workers and Pods are managed in-process simulations, not remote agents','Only native HTTP invokes the bundled target; no external SSH / Kubernetes / JVM','State and sessions persist in SQLite; encryption key is separate','Production HA, external providers and durable distributed ingestion remain extensions']};
// Content is defined above; layout follows repeated columns and rows.
const d=new ExcalidrawDiagram({width:1530,height:1090});
d.text({x:40,y:24,width:1440,height:44,value:model.diagram.title,fontSize:30});
d.text({x:42,y:80,width:1430,height:36,value:'AS IMPLEMENTED · One Go service owns the complete management flow and bounded worker simulation',fontSize:16,color:COLORS.muted});
d.boundary({id:'process',lifecycle:'existing',x:290,y:148,width:1210,height:520,title:'Single Go process',subtitle:'HTTP API + scheduler + execution + collection; shared transactional workspace ownership'});
const positions={console:[35,400,220,120],api:[330,220,290,100],scheduler:[330,425,290,105],workers:[755,425,300,105],protocols:[1160,425,300,105],reports:[755,220,300,100],ops:[1160,220,300,100],store:[330,765,290,100],key:[755,765,300,100],target:[1160,765,300,100]};
for(const n of nodes){const [x,y,width,height]=positions[n.id];d.node({id:n.id,x,y,width,height,title:n.label,subtitle:n.subtitle,kind:'existing',fontSize:17,subtitleSize:11});}
function edge(from,to,points,labelX,labelY,width=190){const f=flows.find(f=>f.from===from&&f.to===to);d.arrow({startId:from,endId:to,points,strokeColor:COLORS.added});d.text({x:labelX,y:labelY,width,height:28,value:f.label,fontSize:12,color:COLORS.added});}
edge('console','api',[[255,430],[270,430],[270,270],[330,270]],38,340,220);
edge('api','scheduler',[[475,320],[475,425]],490,365);
edge('scheduler','workers',[[620,477],[755,477]],624,440,130);
edge('workers','protocols',[[1055,477],[1160,477]],1060,545,175);
edge('workers','reports',[[905,425],[905,320]],920,365,220);
edge('reports','ops',[[1055,270],[1160,270]],1080,330,230);
edge('scheduler','store',[[475,530],[475,765]],490,705,260);
edge('key','store',[[755,815],[620,815]],625,890,330);
edge('protocols','target',[[1310,530],[1310,765]],1320,700,190);
d.text({x:760,y:590,width:660,height:55,value:'Simulated nodes and Pods: independent contexts, capacity and lifecycle.\nJMX compiles supported samplers; no JVM or uploaded plugin execution.',fontSize:13,color:COLORS.muted});
d.text({x:40,y:790,width:235,height:95,value:'Data artifacts are durable.\nBrowser state is not the\nauthority for runs, policies,\nresources or terminal commands.',fontSize:13,color:COLORS.muted});
d.text({x:45,y:975,width:1420,height:75,value:'Blue solid nodes = implemented components / owned artifacts. Green arrows = direct internal calls or persistence.\nBoundary: managed simulation runs inside this process; measured native HTTP reaches only the bundled target.\nExtensions: authenticated remote agents, Kubernetes / SSH providers, JVM JMeter and production HA.',fontSize:15,color:COLORS.muted});
d.write({excalidrawPath:path.join(out,'saas-runtime.excalidraw'),svgPath:path.join(out,'saas-runtime.svg')});
fs.writeFileSync(path.join(out,'saas-runtime-model.json'),JSON.stringify(model,null,2)+'\n');
const contract={canvas:{width:1530,height:1090},requiredLabels:nodes.map(n=>n.label),styleRules:nodes.map(n=>({label:n.label,strokeColor:COLORS.existing,strokeStyle:'solid'})),requiredRelations:flows.map(f=>({from:nodes.find(n=>n.id===f.from).label,to:nodes.find(n=>n.id===f.to).label})),overlapSets:[nodes.map(n=>n.label)],requireBoundArrows:true};
fs.writeFileSync(path.join(out,'saas-runtime-contract.json'),JSON.stringify(contract,null,2)+'\n');
console.log('Generated implemented runtime architecture.');
