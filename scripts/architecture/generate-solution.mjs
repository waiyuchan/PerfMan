import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ExcalidrawDiagram,COLORS} from './excalidraw-kit.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');const out=path.join(root,'docs/architecture');
const nodes=[
 ['console','Bilingual web console','module','client','Login / Author / Run / Operate'],
 ['identity','Identity + policy','module','control','Sessions / roles / project + tag scope'],
 ['assets','Projects + assets','module','control','Environments / files / recordings'],
 ['scheduler','Run + resource scheduler','module','control','Snapshots / queue / lease / capacity / plans'],
 ['metrics','Metrics + reports','module','control','Histograms / checks / samples / views'],
 ['operations','Operations gateway','module','control','SLA / notifications / terminal / audit'],
 ['agent','Go agent','process','execution','Claim / heartbeat / isolate / stop'],
 ['engine','Engine adapters','module','execution','Script / HTTP / protocols / JMeter'],
 ['provider','Resource providers','module','execution','Simulator / Agent / Docker / K8s'],
 ['target','Target transports','module','execution','Fixtures or authorised endpoints'],
 ['meta','Metadata store','store','persistence','SQLite first / PostgreSQL scale-out'],
 ['files','Versioned artifact store','store','persistence','Local content-addressed / object storage']
].map(([id,label,kind,plane,subtitle])=>({id,label,kind,plane,subtitle,lifecycle:'new',owner:plane,evidence:'Proposal: docs/product/SOLUTION_SPEC.zh.md'}));
const flows=[
 ['console','identity','sync-call','HTTP / session / policy'],['identity','scheduler','sync-call','Authorise actions'],['assets','scheduler','data-read','Freeze immutable bundle'],['scheduler','agent','async-event','Assignment / epoch / cancel'],['agent','engine','sync-call','Start / update / collect'],['scheduler','provider','sync-call','Provision / observe / release'],['engine','target','sync-call','Invoke protocol adapter'],['agent','metrics','async-event','Metric batch / log / sample'],['metrics','operations','async-event','SLA / report events'],['scheduler','meta','data-write','Persist task state / outbox'],['assets','files','data-write','Store versions / content hash']
].map(([from,to,semantic,label])=>({from,to,semantic,label,direction:'forward'}));
const model={diagram:{title:'PerfMan Go · Complete solution design',view:'to-be',direction:'left-to-right',question:'How does one managed workflow connect identity, authoring, scheduling, execution and operations?'},nodes,flows,boundaries:[{id:'control',label:'Go control plane',owner:'server',lifecycle:'new',evidence:'Proposal'},{id:'execution',label:'Execution + provider plane',owner:'agents',lifecycle:'new',evidence:'Proposal'}],constraints:['All components are target design, not a completion claim','Simulator replaces external providers; control workflows remain server-owned','SSH and Kubernetes exec use different terminal transports','JMeter engine retains JVM; management and orchestration are Go']};
const d=new ExcalidrawDiagram({width:1620,height:1230});
d.text({x:40,y:25,width:1480,height:45,value:model.diagram.title,fontSize:30});
d.text({x:42,y:80,width:1480,height:30,value:'PROPOSAL · Expanded scope after PTS feature review · all green dashed modules are planned',fontSize:14,color:COLORS.muted});
d.boundary({id:'control',x:330,y:150,width:610,height:750,title:'Go control plane',subtitle:'One modular service first / server-owned durable workflow'});
d.boundary({id:'execution',x:1030,y:150,width:540,height:750,title:'Execution + provider plane',subtitle:'Bounded simulator first / replaceable real adapters'});
const coords={console:[35,290,220,100],identity:[370,250,240,95],assets:[650,250,250,95],scheduler:[370,430,530,100],metrics:[370,655,240,95],operations:[650,655,250,95],agent:[1070,250,460,95],engine:[1070,465,460,100],provider:[1070,690,215,100],target:[1315,690,215,100],meta:[370,995,280,95],files:[720,995,280,95]};
for(const n of nodes){const [x,y,width,height]=coords[n.id];d.node({id:n.id,x,y,width,height,title:n.label,subtitle:n.subtitle,fontSize:17,subtitleSize:11});}
const arrow=(from,to,points,label,semantic='internal',dx=10,dy=-28)=>d.arrow({startId:from,endId:to,points,label,labelWidth:260,labelSize:11,labelDx:dx,labelDy:dy,strokeColor:semantic==='async'?COLORS.bridge:semantic==='read'?COLORS.read:COLORS.added,strokeStyle:semantic==='async'?'dashed':semantic==='read'?'dotted':'solid'});
arrow('console','identity',[[255,340],[295,340],[295,297],[370,297]],'','internal');
d.text({x:45,y:225,width:250,height:25,value:'HTTP / session / policy',fontSize:11,color:COLORS.added});
arrow('identity','scheduler',[[490,345],[490,430]],'Authorise actions','internal',15,-5);
arrow('assets','scheduler',[[775,345],[775,430]],'Freeze bundle','read',15,-5);
arrow('scheduler','agent',[[900,480],[985,480],[985,297],[1070,297]],'Assignment / epoch / cancel','async',-90,-5);
arrow('agent','engine',[[1300,345],[1300,465]],'Start / update / collect','internal',15,-5);
arrow('scheduler','provider',[[900,510],[995,510],[995,850],[1177,850],[1177,790]],'','internal');
d.text({x:1050,y:815,width:430,height:25,value:'Provision / observe / release resources',fontSize:11,color:COLORS.added});
arrow('engine','target',[[1422,565],[1422,690]],'','internal');
d.text({x:1437,y:610,width:140,height:25,value:'Invoke protocols',fontSize:11,color:COLORS.added});
arrow('agent','metrics',[[1070,320],[1010,320],[1010,610],[490,610],[490,655]],'Metric batch / log / sample','async',-108,-28);
arrow('metrics','operations',[[610,702],[650,702]],'','async');
d.text({x:615,y:765,width:290,height:55,value:'SLA / report events → operations\nNotifications + terminal sessions audited',fontSize:11,color:COLORS.muted});
arrow('scheduler','meta',[[370,510],[310,510],[310,1042],[370,1042]],'','internal');
d.text({x:45,y:805,width:250,height:60,value:'Task state + outbox\ntransactional persistence',fontSize:12,color:COLORS.added});
arrow('assets','files',[[900,297],[1018,297],[1018,1042],[1000,1042]],'','internal');
d.text({x:1060,y:940,width:450,height:30,value:'Versioned content / immutable file hashes',fontSize:12,color:COLORS.added});
d.text({x:1070,y:995,width:450,height:85,value:'Simulator: persistent pods, leases and virtual terminal.\nReal adapters: agents, Docker, Kubernetes, SSH.\nMetrics retain measured / simulated provenance.\nJMeter keeps its JVM; orchestration is Go.',fontSize:13,color:COLORS.muted});
d.node({x:40,y:1145,width:300,height:45,title:'Green dashed = proposed component',fontSize:12});
d.text({x:380,y:1145,width:1180,height:50,value:'Green solid: call / persistence    Orange dashed: asynchronous handoff / events\nGray dotted: read-only snapshot lookup    This design supersedes the earlier HTTP-only target scope.',fontSize:12,color:COLORS.muted});
d.write({excalidrawPath:path.join(out,'solution-target.excalidraw'),svgPath:path.join(out,'solution-target.svg')});
fs.writeFileSync(path.join(out,'solution-target-model.json'),JSON.stringify(model,null,2)+'\n');
const contract={canvas:{width:1620,height:1230},requiredLabels:nodes.map(n=>n.label),styleRules:nodes.map(n=>({label:n.label,strokeColor:COLORS.added,strokeStyle:'dashed'})),requiredRelations:flows.map(f=>({from:nodes.find(n=>n.id===f.from).label,to:nodes.find(n=>n.id===f.to).label})),overlapSets:[nodes.map(n=>n.label)],requireBoundArrows:true};
fs.writeFileSync(path.join(out,'solution-target-contract.json'),JSON.stringify(contract,null,2)+'\n');
console.log('Generated expanded solution architecture.');
