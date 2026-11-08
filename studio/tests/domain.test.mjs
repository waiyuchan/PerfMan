import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validate,comparable,difference,copy} from '../web/domain.mjs';
const scene={name:'valid',vus:4,duration:10,thinkMs:200,mode:'constant',profile:'healthy',p95Limit:300,errorLimit:1,steps:[{name:'products',method:'GET',path:'/demo-api/products',body:'',headers:{},expect:200}]};
test('reject external targets, duplicate names and unbounded load',()=>{assert.equal(validate(scene),scene);for(const change of [{vus:21},{duration:121},{steps:[{...scene.steps[0],path:'https://example.com'}]},{steps:[...scene.steps,...scene.steps]}])assert.throws(()=>validate({...scene,...change}));});
test('compare only identical workload signatures and do not divide by zero',()=>{const a={scenario:scene},b=copy(a);assert.equal(comparable(a,b),true);b.scenario.profile='bottleneck';assert.equal(comparable(a,b),false);assert.equal(difference(2,0),null);assert.equal(difference(120,100),20)});
