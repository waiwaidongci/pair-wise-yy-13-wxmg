// ============================================================================
// 分片规则（领域层）
// 负责：检测项目目录、布条裁剪布局、母样余量核算、整批结论推导、
//       复测换人校验、规则变更失效。全部为纯函数，不依赖存储与页面。
// ============================================================================

export type TestItemKey = "color" | "wash" | "handle" | "rub" | "shrink";

export interface TestItemDef {
  key: TestItemKey;
  label: string;
}

/** 可配置的检测项目目录，默认启用前三项 */
export const TEST_ITEM_CATALOG: TestItemDef[] = [
  { key: "color", label: "色差" },
  { key: "wash", label: "耐水洗" },
  { key: "handle", label: "手感" },
  { key: "rub", label: "摩擦牢度" },
  { key: "shrink", label: "缩水率" },
];

/** 分片规则中的一行：某个检测项目对应的剪样尺寸 */
export interface SpecEntry {
  item: TestItemKey;
  widthCm: number;
  lengthCm: number;
}

export const DEFAULT_SPEC: SpecEntry[] = [
  { item: "color", widthCm: 12, lengthCm: 12 },
  { item: "wash", widthCm: 25, lengthCm: 20 },
  { item: "handle", widthCm: 15, lengthCm: 15 },
];

export type StripStatus = "pending" | "pass" | "fail";

export const STATUS_LABEL: Record<StripStatus, string> = {
  pending: "待检测",
  pass: "合格",
  fail: "不合格",
};

/** 一条检验/复核记录；round=1 为初检，>=2 为复测 */
export interface ReviewRecord {
  id: string;
  round: number;
  inspector: string;
  result: "pass" | "fail";
  note: string;
  at: string;
}

/** 布条（留样分片）。active=false 表示已失效的旧布条，仅可追溯 */
export interface Strip {
  id: string;
  batchId: string;
  item: TestItemKey;
  position: string;
  widthCm: number;
  lengthCm: number;
  status: StripStatus;
  active: boolean;
  specVersion: number;
  invalidatedBy?: string;
  reviews: ReviewRecord[];
}

export interface Batch {
  id: string;
  orderNo: string;
  customer: string;
  fabric: string;
  parentWidthCm: number;
  parentLengthCm: number;
  spec: SpecEntry[];
  specVersion: number;
  strips: Strip[];
  createdAt: string;
}

export type ConclusionKind = "pass" | "fail" | "pending" | "overcut" | "invalid";

export interface Conclusion {
  kind: ConclusionKind;
  label: string;
  detail: string;
}

// ---- 工具 ----

let seq = 0;

export function uid(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}`;
}

export function timestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function itemLabel(key: TestItemKey): string {
  return TEST_ITEM_CATALOG.find((d) => d.key === key)?.label ?? key;
}

// ---- 面积与母样余量 ----

export function stripAreaCm2(s: Pick<Strip, "widthCm" | "lengthCm">): number {
  return s.widthCm * s.lengthCm;
}

export function parentAreaCm2(b: Pick<Batch, "parentWidthCm" | "parentLengthCm">): number {
  return b.parentWidthCm * b.parentLengthCm;
}

export const activeStrips = (b: Batch): Strip[] => b.strips.filter((s) => s.active);

export const retiredStrips = (b: Batch): Strip[] => b.strips.filter((s) => !s.active);

export function usedAreaCm2(b: Batch): number {
  return activeStrips(b).reduce((sum, s) => sum + stripAreaCm2(s), 0);
}

/** 母样余量；为负即“三片加起来超过母样” */
export function remainingAreaCm2(b: Batch): number {
  return parentAreaCm2(b) - usedAreaCm2(b);
}

// ---- 剪样布局 ----

const SLOT_NAMES = ["左幅", "中幅", "右幅"];

/** 按分片规则沿布头依次剪出独立布条，并登记剪样位置 */
export function cutStrips(batchId: string, spec: SpecEntry[], specVersion: number): Strip[] {
  let cursor = 0;
  return spec.map((entry, index) => {
    const position = `距布头${cursor}cm · ${SLOT_NAMES[index % SLOT_NAMES.length]}`;
    cursor += entry.lengthCm;
    return {
      id: uid("strip"),
      batchId,
      item: entry.item,
      position,
      widthCm: entry.widthCm,
      lengthCm: entry.lengthCm,
      status: "pending" as StripStatus,
      active: true,
      specVersion,
      reviews: [],
    };
  });
}

// ---- 规则变更：相关布条与整批结论失效，旧布条保留可追溯 ----

export function specSignature(spec: SpecEntry[]): string {
  return spec
    .map((e) => `${e.item}:${e.widthCm}x${e.lengthCm}`)
    .sort()
    .join("|");
}

export function specChanged(current: SpecEntry[], next: SpecEntry[]): boolean {
  return specSignature(current) !== specSignature(next);
}

export function applySpecChange(batch: Batch, nextSpec: SpecEntry[]): Batch {
  const nextVersion = batch.specVersion + 1;
  const retired = batch.strips.map((s) =>
    s.active
      ? { ...s, active: false, invalidatedBy: `分片规则 v${batch.specVersion}→v${nextVersion} 变更` }
      : s
  );
  const fresh = cutStrips(batch.id, nextSpec, nextVersion);
  return {
    ...batch,
    spec: nextSpec.map((e) => ({ ...e })),
    specVersion: nextVersion,
    strips: [...retired, ...fresh],
  };
}

// ---- 结果登记与复测（复测必须换人，只替换该片结果） ----

export function lastInspector(strip: Strip): string | null {
  return strip.reviews.length ? strip.reviews[strip.reviews.length - 1].inspector : null;
}

/** 返回 null 表示允许登记，否则为拒绝原因 */
export function checkRecordResult(strip: Strip, inspector: string): string | null {
  const name = inspector.trim();
  if (!strip.active) return "该布条已失效，仅作追溯，不能再登记结果";
  if (!name) return "请填写检验人";
  if (strip.reviews.length > 0 && lastInspector(strip) === name) {
    return `复测必须更换检验人，上次检验为 ${name}`;
  }
  return null;
}

export function recordResult(
  strip: Strip,
  inspector: string,
  result: "pass" | "fail",
  note: string,
  at: string
): Strip {
  const entry: ReviewRecord = {
    id: uid("rev"),
    round: strip.reviews.length + 1,
    inspector: inspector.trim(),
    result,
    note: note.trim(),
    at,
  };
  // 只替换该片的状态，复核记录全量保留
  return { ...strip, status: result, reviews: [...strip.reviews, entry] };
}

// ---- 整批结论 ----

export function deriveConclusion(batch: Batch): Conclusion {
  const parent = parentAreaCm2(batch);
  const used = usedAreaCm2(batch);
  if (used > parent) {
    return {
      kind: "overcut",
      label: "超裁·禁止结论",
      detail: `在检布条合计 ${used}cm²，超过母样 ${parent}cm²（超出 ${used - parent}cm²），须调整分片规则后才能给结论`,
    };
  }

  const required = batch.spec.map((e) => e.item);
  if (required.length === 0) {
    return { kind: "invalid", label: "规则失效", detail: "分片规则未配置检测项目，不能给出整批结论" };
  }

  const active = activeStrips(batch);
  const missing = required.filter((item) => !active.some((s) => s.item === item));
  if (missing.length > 0) {
    return {
      kind: "invalid",
      label: "布条缺失",
      detail: `缺少 ${missing.map(itemLabel).join("、")} 布条，不能给出整批结论`,
    };
  }

  const untested = required.filter(
    (item) => active.find((s) => s.item === item)!.status === "pending"
  );
  if (untested.length > 0) {
    return {
      kind: "pending",
      label: "待检测",
      detail: `${untested.map(itemLabel).join("、")} 尚未检测，不能给出整批结论`,
    };
  }

  const failed = required.filter(
    (item) => active.find((s) => s.item === item)!.status === "fail"
  );
  if (failed.length > 0) {
    return {
      kind: "fail",
      label: "整批不通过",
      detail: `${failed.map(itemLabel).join("、")} 不合格`,
    };
  }

  return {
    kind: "pass",
    label: "整批通过",
    detail: `${required.map(itemLabel).join("、")} ${required.length} 项全部确认合格`,
  };
}
