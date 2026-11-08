import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ExcalidrawDiagram,COLORS} from './excalidraw-kit.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const out=path.join(root,'docs/architecture');fs.mkdirSync(out,{recursive:true});
const write=(name,d,model,contract)=>{d.write({excalidrawPath:path.join(out,name+'.excalidraw'),svgPath:path.join(out,name+'.svg')});fs.writeFileSync(path.join(out,name+'-model.json'),JSON.stringify(model,null,2)+'\n');fs.writeFileSync(path.join(out,name+'-contract.json'),JSON.stringify(contract,null,2)+'\n')};
const title=(d,text,sub)=>{d.text({x:45,y:25,width:1350,height:45,value:text,fontSize:30});d.text({x:46,y:77,width:1350,height:28,value:sub,fontSize:13,color:COLORS.muted})};
const specNode=(id,label,kind,plane,evidence,lifecycle='existing')=>({id,label,kind,lifecycle,plane,owner:plane,evidence});
// Model first: the first view contains only code present in studio/.
const runtime={diagram:{title:'PerfMan Studio · Local runtime',view:'as-is',direction:'left-to-right',question:'What actually runs in the delivered demonstration?'},boundaries:[{id:'single',label:'Single Go process',lifecycle:'existing',owner:'studio',evidence:'studio/cmd/perfman/main.go'}],nodes:[
 specNode('browser','Web console','module','browser','studio/web/app.js'),specNode('control','Control modules','module','single','studio/http.go; studio/model.go'),specNode('runner','HTTP runner','module','single','studio/engine.go'),specNode('sut','Demo target','module','single','studio/http.go Handler /demo-api/'),specNode('store','Atomic JSON state','store','storage','studio/model.go saveLocked'),specNode('exports','Reports / k6 export','module','single','studio/http.go exportK6; studio/web/app.js')],flows:[
 {from:'browser',to:'control',semantic:'sync-call',label:'HTTP JSON / poll every 1.1s'},
 {from:'control',to:'runner',semantic:'async-event',label:'Freeze snapshot / launch goroutines'},
 {from:'runner',to:'sut',semantic:'sync-call',label:'HTTP / real loopback requests'},
 {from:'control',to:'store',semantic:'data-write',label:'Save / fsync / atomic rename'},
 {from:'control',to:'exports',semantic:'data-read',label:'Read frozen scenario and result'}],assumptions:['Single trusted local workspace; no production auth','No distributed workers or external load targets','Source synthetic appears only in separately deployed browser showcase']};
{
 const d=new ExcalidrawDiagram({width:1450,height:820});title(d,runtime.diagram.title,'Delivered implementation · no external database, registry or config server required');
 d.boundary({x:355,y:135,width:1035,height:420,title:'Single Go process',subtitle:'Logical modules share one process · Runner can be extracted later',lifecycle:'existing',id:'single'});
 const node=(id,x,y,width,height,subtitle)=>d.node({id,x,y,width,height,title:runtime.nodes.find(n=>n.id===id).label,subtitle,kind:'existing',fontSize:18,subtitleSize:12});
 node('browser',45,265,220,100,'HTML / CSS / JavaScript');node('control',405,265,250,100,'Projects · Scenarios · Runs');node('runner',745,265,240,100,'VU stages · cancel · histogram');node('sut',1080,265,260,100,'Normal / bottleneck responses');node('exports',405,435,250,80,'JSON · CSV · printable compare');node('store',405,630,320,85,'data/state.json · final results');
 const arrow=(from,to,points,label,style='solid',dx=-40,dy=-30)=>d.arrow({startId:from,endId:to,points,label,labelWidth:230,labelSize:11,labelDx:dx,labelDy:dy,strokeColor:COLORS.existing,strokeStyle:style});
 arrow('browser','control',[[265,315],[405,315]],'HTTP JSON + polling','solid',-62,-31);
 arrow('control','runner',[[655,315],[745,315]],'Start / cancel','solid',-35,-30);
 arrow('runner','sut',[[985,315],[1080,315]],'HTTP requests','solid',-32,-30);
 arrow('control','exports',[[530,365],[530,435]],'Read snapshot / result','dotted',18,-10);
 arrow('control','store',[[405,345],[325,345],[325,672],[405,672]],'','solid',-20,0);
 d.text({x:85,y:520,width:230,height:25,value:'fsync + atomic rename',fontSize:11,color:COLORS.existing});
 d.text({x:800,y:430,width:520,height:85,value:'Runner collects per-request histograms and 1s windows.\nSLA can cancel a run; completion and verdict are separate.\nRestarted active runs are marked interrupted.',fontSize:15,color:COLORS.muted});
 d.text({x:800,y:630,width:565,height:85,value:'Local storage is a demo choice, not an HA database.\nMetrics persist at completion; a crash can lose active samples.\nShowcase hosting uses synthetic browser data only.',fontSize:14,color:COLORS.muted});
 d.node({x:45,y:755,width:255,height:40,title:'Blue solid = verified implementation',kind:'existing',fontSize:12});
 d.text({x:350,y:760,width:1020,height:25,value:'Solid blue arrow: execution / persistence   ·   Dotted blue arrow: read-only projection',fontSize:12,color:COLORS.muted});
 write('studio-runtime',d,runtime,{canvas:{width:1450,height:820},requiredLabels:runtime.nodes.map(n=>n.label),styleRules:runtime.nodes.map(n=>({label:n.label,strokeColor:COLORS.existing,strokeStyle:'solid'})),requiredRelations:runtime.flows.map(f=>({from:runtime.nodes.find(n=>n.id===f.from).label,to:runtime.nodes.find(n=>n.id===f.to).label})),overlapSets:[runtime.nodes.map(n=>n.label)],requireBoundArrows:true});
 fs.copyFileSync(path.join(out,'studio-runtime.svg'),path.join(root,'studio/web/architecture.svg'));
}
const target={diagram:{title:'PerfMan · Distributed target architecture',view:'to-be',direction:'left-to-right',question:'How can the control plane evolve independently from load generation?'},boundaries:[{id:'control-plane',label:'Modular control plane',lifecycle:'new',owner:'control',evidence:'proposal: docs/product/REDESIGN.zh.md'},{id:'execution-plane',label:'Execution plane',lifecycle:'new',owner:'workers',evidence:'proposal: docs/product/REDESIGN.zh.md'}],nodes:[
 specNode('ui','Web console / CI API','module','clients','proposal','new'),specNode('cp','Project / Scenario / Run','module','control-plane','proposal','new'),specNode('scheduler','Scheduler / Lease','module','control-plane','proposal','new'),specNode('aggregator','Metric ingestion / SLA','module','control-plane','proposal','new'),specNode('worker','Worker agent / k6','process','execution-plane','proposal','new'),specNode('target','Authorised target','external','SUT','proposal','new'),specNode('pg','PostgreSQL','store','control-owned','proposal','new'),specNode('objects','Object storage','store','artifact-owned','proposal','new'),specNode('timeseries','Metric storage','store','metrics-owned','proposal','new')],flows:[
 {from:'ui',to:'cp',semantic:'sync-call',label:'Create / debug / start'},
 {from:'cp',to:'scheduler',semantic:'data-write',label:'Enqueue run transaction'},
 {from:'scheduler',to:'worker',semantic:'poll',label:'Claim shard / heartbeat / cancel'},
 {from:'worker',to:'target',semantic:'sync-call',label:'HTTP / WS / gRPC via engine'},
 {from:'worker',to:'aggregator',semantic:'async-event',label:'run + shard + epoch + seq'},
 {from:'cp',to:'pg',semantic:'data-write',label:'Version / outbox / run state'},
 {from:'worker',to:'objects',semantic:'data-read',label:'Fetch immutable bundle'},
 {from:'aggregator',to:'timeseries',semantic:'data-write',label:'Merge histograms / persist'},
 {from:'aggregator',to:'scheduler',semantic:'sync-call',label:'SLA stop command'}],assumptions:['All green dashed nodes are proposals, not implemented','Initially one control instance + PostgreSQL lease queue; no Kafka required','k6 is the first future engine; JMeter/Locust come after metric contracts']};
{
 const d=new ExcalidrawDiagram({width:1600,height:1010});title(d,target.diagram.title,'PROPOSAL · all green dashed modules are future work · this is not the delivered runtime');
 d.boundary({id:'control-plane',x:335,y:140,width:475,height:550,title:'Modular control plane',subtitle:'One service first · durable task state'});d.boundary({id:'execution-plane',x:905,y:140,width:325,height:550,title:'Execution plane',subtitle:'Scale workers, not business services'});
 const node=(id,x,y,width,height,subtitle)=>d.node({id,x,y,width,height,title:target.nodes.find(n=>n.id===id).label,subtitle,fontSize:17,subtitleSize:11});
 node('ui',45,250,220,95,'Browser / versioned API');node('cp',370,250,405,90,'Immutable version + run snapshot');node('scheduler',370,415,405,90,'Lease / epoch / barrier / reconciliation');node('aggregator',370,570,405,85,'Dedup / watermark / partial verdict');node('worker',940,415,255,90,'Short-lived container jobs');node('target',1320,415,235,90,'Egress policy / scoped credentials');node('pg',370,785,405,90,'Owns projects, snapshots, runs, shards');node('objects',940,785,255,90,'Bundles / params / sampled logs');node('timeseries',45,785,255,90,'Mergeable buckets / retention');
 const arrows=[
 ['ui','cp',[[265,295],[370,295]],'Create / debug / start','solid',COLORS.added,-50,-30],
 ['cp','scheduler',[[570,340],[570,415]],'Transactional enqueue','solid',COLORS.added,20,-12],
 ['scheduler','worker',[[775,460],[940,460]],'Claim / heartbeat','dotted',COLORS.read,-55,-33],
 ['worker','target',[[1195,460],[1320,460]],'Load protocols','solid',COLORS.added,-35,-30],
 ['worker','aggregator',[[1065,505],[1065,612],[775,612]],'Metrics: shard / epoch / seq','dashed',COLORS.bridge,-100,12],
 ['aggregator','scheduler',[[405,570],[405,505]],'Stop on SLA','solid',COLORS.added,18,-10],
 ['cp','pg',[[775,295],[850,295],[850,830],[775,830]],'Persist versions / task state','solid',COLORS.added,10,-20],
 ['worker','objects',[[1195,490],[1260,490],[1260,830],[1195,830]],'Fetch immutable bundle','dotted',COLORS.read,15,-30],
 ['aggregator','timeseries',[[370,612],[173,612],[173,785]],'Merge buckets / persist','solid',COLORS.added,10,-18]];
 for(const [from,to,points,label,style,color,dx,dy]of arrows)d.arrow({startId:from,endId:to,points,label,labelWidth:250,labelSize:12,labelDx:dx,labelDy:dy,strokeColor:color,strokeStyle:style});
 d.text({x:940,y:250,width:270,height:140,value:'Explicit terminal run states.\nMissing shards yield partial results.\nWorkers must use the current\nlease epoch to finish a shard.',fontSize:13,color:COLORS.muted});
 d.node({x:45,y:937,width:280,height:42,title:'Green dashed = proposed component',fontSize:12});
 d.text({x:360,y:937,width:1150,height:45,value:'Green solid: internal call / persistence    Orange dashed: asynchronous metric batches\nGray dotted: claim / heartbeat / artifact reads    All arrows name their transport or purpose',fontSize:12,color:COLORS.muted});
 write('distributed-target',d,target,{canvas:{width:1600,height:1010},requiredLabels:target.nodes.map(n=>n.label),styleRules:target.nodes.map(n=>({label:n.label,strokeColor:COLORS.added,strokeStyle:'dashed'})),requiredRelations:target.flows.map(f=>({from:target.nodes.find(n=>n.id===f.from).label,to:target.nodes.find(n=>n.id===f.to).label})),overlapSets:[target.nodes.map(n=>n.label)],requireBoundArrows:true});
}
console.log('Generated runtime + target diagrams, models and contracts.');
