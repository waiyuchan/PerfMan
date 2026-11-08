export const copy = value => structuredClone(value);
export function validate(s) {
 if (!s.name?.trim() || new TextEncoder().encode(s.name).length > 120) throw Error('请填写场景名称，最多 120 字节');
 if (!(s.vus >= 1 && s.vus <= 20 && Number.isInteger(s.vus) && s.duration >= 3 && s.duration <= 120 && Number.isInteger(s.duration) && s.thinkMs >= 50 && s.thinkMs <= 5000)) throw Error('演示范围：1–20 VU、3–120 秒、50–5000 ms 思考时间');
 if (!['constant','ramp'].includes(s.mode) || !['healthy','bottleneck'].includes(s.profile)) throw Error('负载模型或环境不支持');
 if (!(s.p95Limit >= 1 && s.p95Limit <= 10000 && s.errorLimit >= 0 && s.errorLimit <= 100)) throw Error('请检查 SLA 阈值');
 if (!s.steps?.length || s.steps.length > 8) throw Error('场景需要 1–8 个请求');
 const names = new Set();
 for (const step of s.steps) {
  if (!step.name || names.has(step.name) || new TextEncoder().encode(step.name).length > 80) throw Error('请求名称不能为空或重复，最多 80 字节');
  names.add(step.name);
  if (!['GET','POST'].includes(step.method) || !step.path.startsWith('/demo-api/') || step.path.includes('..') || /[\r\n#]/.test(step.path)) throw Error('演示请求需使用 GET/POST 和 /demo-api/ 相对路径');
  if (!(step.expect >= 100 && step.expect <= 599) || step.body.length > 4096) throw Error('预期状态码或请求体不合法');
  if (typeof step.headers !== 'object' || Array.isArray(step.headers) || step.headers === null || Object.values(step.headers).some(v=>typeof v!=='string')) throw Error('请求头应是 JSON 字符串字典');
 }
 return s;
}
export function comparable(a,b) {
 if (!a || !b) return false;
 const signature = r => JSON.stringify({steps:r.scenario.steps, mode:r.scenario.mode, vus:r.scenario.vus, duration:r.scenario.duration, thinkMs:r.scenario.thinkMs, profile:r.scenario.profile});
 return signature(a) === signature(b);
}
export function difference(current,baseline) {return baseline === 0 ? null : (current-baseline)/baseline*100;}
