// This adapter is used ONLY when runtime.json explicitly selects "showcase".
// It never sends load traffic. All runs and metrics below are synthetic.
import {copy,validate} from './domain.mjs';
const storageKey='perfman-showcase-v1';
const stamp=()=>new Date().toISOString();
let state;
function fresh(){
 const steps=[{name:'登录获取令牌',method:'POST',path:'/demo-api/login',body:'{"username":"demo"}',headers:{},expect:200,extract:'token'},{name:'浏览商品',method:'GET',path:'/demo-api/products',body:'',headers:{Authorization:'Bearer {{token}}'},expect:200,extract:''},{name:'提交订单',method:'POST',path:'/demo-api/checkout',body:'{"sku":"desk-01","quantity":1}',headers:{Authorization:'Bearer {{token}}'},expect:201,extract:''}];
 const scenarios=[{id:'checkout',projectId:'commerce',name:'商城下单链路',description:'登录、浏览商品、提交订单，验证完整业务事务。',version:1,mode:'ramp',vus:8,duration:20,thinkMs:200,p95Limit:300,errorLimit:1,protect:true,profile:'healthy',steps},{id:'bottleneck',projectId:'commerce',name:'订单服务瓶颈复现',description:'内置慢响应与错误，验证 SLA 保护和定位。',version:1,mode:'constant',vus:8,duration:25,thinkMs:150,p95Limit:250,errorLimit:1,protect:true,profile:'bottleneck',steps:copy(steps)},{id:'catalog',projectId:'platform',name:'商品接口基准',description:'单接口恒定并发，建立可重复的性能基线。',version:1,mode:'constant',vus:4,duration:15,thinkMs:200,p95Limit:200,errorLimit:1,protect:true,profile:'healthy',steps:[{name:'商品查询',method:'GET',path:'/demo-api/products',body:'',headers:{},expect:200,extract:''}]}];
 return {revision:1,projects:[{id:'commerce',name:'Commerce API',description:'电商核心链路的性能回归'},{id:'platform',name:'Platform services',description:'基础服务与接口基准'}],scenarios,runs:[]};
}
try{state=JSON.parse(localStorage.getItem(storageKey))}catch{}
if(!state?.scenarios)state=fresh();
const save=()=>{try{localStorage.setItem(storageKey,JSON.stringify(state))}catch{throw Error('浏览器存储已满，请导出数据后清理站点存储')}};
function point(run,sec){const s=run.scenario;const vus=s.mode==='constant'?s.vus:sec<s.duration*.25?Math.max(1,Math.floor(s.vus/4)):sec<s.duration*.5?Math.max(1,Math.floor(s.vus/2)):s.vus;const slow=s.profile==='bottleneck';return {second:sec,vus,requests:Math.round(vus*(slow?3.4:8.7)*(1+Math.sin(sec*.8)*.06)),rps:vus*(slow?3.4:8.7)*(1+Math.sin(sec*.8)*.06),p95:slow?475+Math.round(Math.sin(sec)*40):80+Math.round(Math.sin(sec)*10),errorRate:slow?6.5:0};}
function calculate(run,elapsed){
 const max=run.kind==='debug'?1:run.scenario.duration;
 const protection=run.scenario.protect && run.scenario.profile==='bottleneck';
 const end=protection?Math.min(max,5):max;
 const seconds=Math.min(Math.floor(elapsed),end);
 run.points=Array.from({length:seconds},(_,i)=>point(run,i+1));run.elapsed=Math.min(elapsed,end);
 const n=run.points.reduce((v,p)=>v+p.requests,0);const slow=run.scenario.profile==='bottleneck';
 const errors=slow?Math.round(n*.065):0;
 run.metrics={requests:n,errors,transactions:Math.floor(n/run.scenario.steps.length),failedTransactions:errors,rps:n/Math.max(1,run.elapsed),p50:slow?45:34,p95:seconds?(slow?510:88):0,p99:seconds?(slow?585:97):0,mean:slow?180:48,errorRate:n?100*errors/n:0};
 run.endpoints=run.scenario.steps.map((s,i)=>({name:s.name,requests:Math.round(n/run.scenario.steps.length),errors:i===2?errors:0,p95:i===2?(slow?510:88):39,mean:i===2?(slow?480:73):30}));
 run.samples=run.scenario.steps.map((s,i)=>({step:s.name,status:i===2&&slow?503:s.expect,ms:i===2?(slow?510:88):31,error:i===2&&slow?'合成示例：订单服务返回 503':''}));
 if(elapsed>=end){run.status=protection?'protected':'completed';run.verdict=slow?'failed':'passed';run.finishedAt=stamp();run.events.push({at:stamp(),level:protection?'warning':'info',message:protection?'合成示例：SLA 保护触发，演示已停止':'交互演示结束；所有数据均为浏览器合成'});}
}
function tick(){for(const r of state.runs)if(r.status==='running')calculate(r,(Date.now()-Date.parse(r.startedAt))/1000);save();}
export async function demoAPI(path,method='GET',body){tick();
 if(path==='state')return copy(state);
 if(path==='capabilities')return {mode:'showcase',engine:'synthetic',maxVUs:20,maxDuration:120,workers:0,distributed:false};
 if(path==='projects'&&method==='POST'){if(!body.name?.trim())throw Error('请输入项目名称');const p={...body,id:'project-'+Date.now()};state.projects.push(p);save();return copy(p)}
 if(path==='scenarios'&&method==='POST'){validate(body);const s=copy(body);const i=state.scenarios.findIndex(x=>x.id===s.id);if(i>=0){if(s.version!==state.scenarios[i].version)throw Error('场景已更新，请重新打开');s.version++;state.scenarios[i]=s}else{s.id='scenario-'+Date.now();s.version=1;state.scenarios.push(s)};state.revision++;save();return copy(s)}
 if(path==='runs'&&method==='POST'){if(state.runs.some(r=>r.status==='running'))throw Error('请先等待或停止当前演示');const s=copy(state.scenarios.find(x=>x.id===body.scenarioId));if(!s)throw Error('场景不存在');if(body.kind==='debug'){s.vus=1;s.mode='constant';s.protect=false};const r={id:'demo-'+Date.now(),scenario:s,kind:body.kind,status:'running',verdict:'pending',source:'synthetic',startedAt:stamp(),finishedAt:'',elapsed:0,metrics:{},points:[],endpoints:[],samples:[],events:[{at:stamp(),level:'info',message:'浏览器合成演示已开始，不发送真实压测流量'}]};state.runs.unshift(r);calculate(r,0);state.runs=state.runs.slice(0,200);save();return copy(r)}
 if(path.endsWith('/stop')){const r=state.runs.find(x=>x.id===path.split('/')[1]);if(r&&r.status==='running'){r.status='stopped';r.verdict='incomplete';r.finishedAt=stamp();r.events.push({at:stamp(),level:'warning',message:'手动停止交互演示'})};save();return copy(r)}
 throw Error('交互演示不支持此操作');
}
// Initial fixtures are conspicuously tagged as synthetic, including in downloads.
if(!state.runs.length){
 for(const [i,s]of state.scenarios.slice(0,2).entries()){
  const r={id:'sample-'+(i+1),scenario:copy(s),kind:'load',status:'running',verdict:'pending',source:'synthetic',startedAt:new Date(Date.now()-(i+1)*600000).toISOString(),events:[{at:stamp(),level:'info',message:'预置合成样例，用于展示报告结构'}]};calculate(r,60);state.runs.push(r);
 }
 save();
}
