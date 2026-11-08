export const S = {
  data: {},
  user: null,
  workspace: {},
  project: localStorage.getItem("perfman.project") || "prj_commerce",
  view: "overview",
  id: "",
  sub: "",
  editorTab: "build",
  step: 0,
  script: 0,
  draft: null,
  filters: {},
  analysisDimension: "overall",
  analysisValue: "",
  charts: ["rps", "p95", "errorRate", "cpu"],
  compareA: "",
  compareB: "",
  term: null,
  overviewDays: 7,
};
export const items = (kind) => S.data[kind] || [];
export const find = (kind, id) => items(kind).find((x) => x.id === id);
export const projectItems = (kind) =>
  items(kind).filter(
    (x) => !x.projectId || x.projectId === S.project || S.project === "all",
  );
export const canEdit = () => S.user && S.user.role !== "viewer";
export const canOperate = () =>
  S.user && ["admin", "operator"].includes(S.user.role);
