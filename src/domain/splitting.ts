// 分片规则层：纯类型与纯函数，负责母样分片、检测登记、复测换人与整批判定规则。
// 不依赖 React、不读写存储，页面层与存档层都只能通过这里的规则改数据。

import { uid } from "../lib/format";

export type TestItemId = "color" | "wash" | "feel" | "rub";
export type Verdict = "pass" | "fail";
export type InvalidateReason = "resized" | "itemsChanged" | "retested";

export interface TestItemDef {
  id: TestItemId;
  name: string;
  fullName: string;
  /** 该项目常规剪样宽度（cm），用于默认尺寸，不再手估 */
  standardWidthCm: number;
  method: string;
  valueLabel: string;
  valuePlaceholder: string;
}

/** 检测项目目录：小样默认同时做色差、耐水洗、手感三项；耐摩擦可按批增选 */
export const TEST_ITEMS: Record<TestItemId, TestItemDef> = {
  color: {
    id: "color",
    name: "色差",
    fullName: "色差检查",
    standardWidthCm: 5,
    method: "色差仪 ΔE 评定",
    valueLabel: "色差数据",
    valuePlaceholder: "如 ΔE 0.84",
  },
  wash: {
    id: "wash",
    name: "耐水洗",
    fullName: "耐水洗色牢度",
    standardWidthCm: 10,
    method: "GB/T 3921 耐皂洗",
    valueLabel: "牢度级数",
    valuePlaceholder: "如 变色4级 / 沾色4级",
  },
  feel: {
    id: "feel",
    name: "手感",
    fullName: "手感检查",
    standardWidthCm: 8,
    method: "手摸评级 + 评语",
    valueLabel: "手感评级",
    valuePlaceholder: "如 3.5级，柔软滑爽",
  },
  rub: {
    id: "rub",
    name: "耐摩擦",
    fullName: "耐摩擦色牢度",
    standardWidthCm: 5,
    method: "GB/T 3920 干/湿摩擦",
    valueLabel: "牢度级数",
    valuePlaceholder: "如 干摩4级 / 湿摩3.5级",
  },
};

export const DEFAULT_ITEMS: TestItemId[] = ["color", "wash", "feel"];

export interface StripVersion {
  version: number;
  /** 距母样布边的剪样位置（cm），复核时据此找回布条 */
  positionCm: number;
  widthCm: number;
  cutBy: string;
  cutAt: string;
  invalidatedAt?: string;
  invalidatedBy?: string;
  invalidateReason?: "resized" | "itemRemoved";
}

export interface StripTest {
  id: string;
  cutVersion: number;
  /** 第几次检测：1 为初检，2 起为复测 */
  attempt: number;
  result: Verdict;
  value: string;
  inspector: string;
  at: string;
}

export interface Strip {
  itemId: TestItemId;
  versions: StripVersion[];
  /** 历次检测，按时间排列；复测只追加，旧记录保留为复核记录 */
  tests: StripTest[];
}

export type BatchEvent =
  | { kind: "created"; at: string; by: string }
  | {
      kind: "itemsChanged";
      at: string;
      by: string;
      added: TestItemId[];
      removed: TestItemId[];
    }
  | {
      kind: "cut";
      at: string;
      by: string;
      itemId: TestItemId;
      version: number;
      positionCm: number;
      widthCm: number;
    }
  | {
      kind: "cutInvalidated";
      at: string;
      by: string;
      itemId: TestItemId;
      version: number;
      reason: "resized" | "itemRemoved";
    }
  | {
      kind: "test";
      at: string;
      itemId: TestItemId;
      testId: string;
      cutVersion: number;
      attempt: number;
      result: Verdict;
      value: string;
      inspector: string;
    }
  | { kind: "conclusionIssued"; at: string; by: string; verdict: Verdict }
  | {
      kind: "conclusionInvalidated";
      at: string;
      by: string;
      reason: InvalidateReason;
    };

export interface BatchConclusion {
  verdict: Verdict;
  at: string;
  by: string;
}

export interface Batch {
  id: string;
  code: string;
  orderNo: string;
  customer: string;
  fabric: string;
  note: string;
  /** 母样可剪长度（cm），剪片宽度合计不得超过它 */
  masterWidthCm: number;
  itemIds: TestItemId[];
  strips: Partial<Record<TestItemId, Strip>>;
  conclusion: BatchConclusion | null;
  /** 最近一次整批结论被作废的时间；为空表示当前结论（若有）仍然有效 */
  conclusionInvalidatedAt?: string;
  events: BatchEvent[];
  createdAt: string;
}

// ---------------------------------------------------------------------------
// 派生查询
// ---------------------------------------------------------------------------

export function currentVersion(strip: Strip | undefined): StripVersion | null {
  if (!strip || strip.versions.length === 0) return null;
  for (let i = strip.versions.length - 1; i >= 0; i--) {
    const v = strip.versions[i];
    if (!v.invalidatedAt) return v;
  }
  return null;
}

export function testsOnVersion(strip: Strip, version: number): StripTest[] {
  return strip.tests.filter((t) => t.cutVersion === version);
}

export function latestTest(strip: Strip | undefined): StripTest | null {
  const v = currentVersion(strip);
  if (!v || !strip) return null;
  const list = testsOnVersion(strip, v.version);
  return list.length ? list[list.length - 1] : null;
}

export type StripStatus =
  | "missing" // 未剪样
  | "untested" // 已剪未检
  | "pass"
  | "fail";

export function stripStatus(strip: Strip | undefined): StripStatus {
  const cut = currentVersion(strip);
  if (!cut) return "missing";
  const t = latestTest(strip);
  if (!t) return "untested";
  return t.result;
}

export function usedWidth(batch: Batch): number {
  return batch.itemIds.reduce((sum, id) => {
    const cut = currentVersion(batch.strips[id]);
    return sum + (cut ? cut.widthCm : 0);
  }, 0);
}

/** 母样余量 = 母样长度 - 当前有效布条宽度合计；超限时为负数 */
export function remainingWidth(batch: Batch): number {
  return batch.masterWidthCm - usedWidth(batch);
}

export function isOversize(batch: Batch): boolean {
  return remainingWidth(batch) < 0;
}

export interface MissingItem {
  itemId: TestItemId;
  stage: "cut" | "test";
}

/** 出具整批结论前的硬性阻塞项 */
export function conclusionBlockers(batch: Batch): MissingItem[] {
  const blockers: MissingItem[] = [];
  for (const itemId of batch.itemIds) {
    const strip = batch.strips[itemId];
    const status = stripStatus(strip);
    if (status === "missing") blockers.push({ itemId, stage: "cut" });
    else if (status === "untested") blockers.push({ itemId, stage: "test" });
  }
  return blockers;
}

export function canIssueConclusion(batch: Batch): boolean {
  return !isOversize(batch) && conclusionBlockers(batch).length === 0;
}

export function allStripsPass(batch: Batch): boolean {
  if (!canIssueConclusion(batch)) return false;
  return batch.itemIds.every(
    (id) => stripStatus(batch.strips[id]) === "pass",
  );
}

export type BatchBadge =
  | "pass"
  | "fail"
  | "invalidated"
  | "oversize"
  | "testing"
  | "awaitCut"
  | "ready";

export const BADGE_LABELS: Record<BatchBadge, string> = {
  pass: "批次通过",
  fail: "批次不合格",
  invalidated: "结论失效",
  oversize: "尺寸超限",
  testing: "待检测",
  awaitCut: "待剪样",
  ready: "待出结论",
};

export function batchBadge(batch: Batch): BatchBadge {
  if (batch.conclusion && !batch.conclusionInvalidatedAt) {
    return batch.conclusion.verdict;
  }
  if (isOversize(batch)) return "oversize";
  const blockers = conclusionBlockers(batch);
  if (blockers.some((b) => b.stage === "cut")) return "awaitCut";
  if (blockers.length > 0) return "testing";
  if (batch.conclusionInvalidatedAt) return "invalidated";
  return "ready";
}

/** 结论失效原因取最近一次作废事件 */
export function lastInvalidation(batch: Batch): {
  at: string;
  by: string;
  reason: InvalidateReason;
} | null {
  for (let i = batch.events.length - 1; i >= 0; i--) {
    const e = batch.events[i];
    if (e.kind === "conclusionInvalidated") {
      return { at: e.at, by: e.by, reason: e.reason };
    }
  }
  return null;
}

/** 建议的下一剪位置：紧靠当前已剪布条之后，避免手估和重叠 */
export function suggestedPosition(batch: Batch): number {
  let end = 0;
  for (const id of batch.itemIds) {
    const cut = currentVersion(batch.strips[id]);
    if (cut) end = Math.max(end, cut.positionCm + cut.widthCm);
  }
  return end;
}

// ---------------------------------------------------------------------------
// 变更规则：所有写操作都返回错误信息字符串（null 表示成功），并追加留样事件
// ---------------------------------------------------------------------------

export interface CreateBatchInput {
  code: string;
  orderNo: string;
  customer: string;
  fabric: string;
  note: string;
  masterWidthCm: number;
  itemIds: TestItemId[];
  by: string;
  at: string;
}

export function createBatch(input: CreateBatchInput): Batch | string {
  if (!input.code.trim()) return "请填写批次号";
  if (!input.customer.trim()) return "请填写客户名称";
  if (!input.orderNo.trim()) return "请填写客户订单号";
  if (!input.by.trim()) return "请填写登记人";
  if (!Number.isFinite(input.masterWidthCm) || input.masterWidthCm <= 0) {
    return "母样可剪长度必须大于 0";
  }
  if (input.itemIds.length === 0) return "至少选择一个检测项目";
  if (input.itemIds.some((id) => !TEST_ITEMS[id])) return "检测项目不合法";

  const batch: Batch = {
    id: uid(),
    code: input.code.trim(),
    orderNo: input.orderNo.trim(),
    customer: input.customer.trim(),
    fabric: input.fabric.trim(),
    note: input.note.trim(),
    masterWidthCm: input.masterWidthCm,
    itemIds: [...input.itemIds],
    strips: {},
    conclusion: null,
    events: [{ kind: "created", at: input.at, by: input.by.trim() }],
    createdAt: input.at,
  };
  return batch;
}

interface CutInput {
  itemId: TestItemId;
  positionCm: number;
  widthCm: number;
  by: string;
  at: string;
}

function validateCut(
  batch: Batch,
  cut: Omit<CutInput, "at">,
): string | null {
  if (!batch.itemIds.includes(cut.itemId)) return "该项目不在本批检测范围内";
  if (!cut.by.trim()) return "请填写剪样人";
  if (!Number.isFinite(cut.widthCm) || cut.widthCm <= 0) {
    return "布条宽度必须大于 0";
  }
  if (!Number.isFinite(cut.positionCm) || cut.positionCm < 0) {
    return "剪样位置不能为负";
  }
  // 单条剪样登记只校验自身合法性；三片合计是否超过母样属于整批规则，
  // 允许现场手估失误被如实登记，并在余量与结论环节拦截
  return null;
}

/** 首次登记剪样 */
export function registerCut(batch: Batch, input: CutInput): string | null {
  const existing = batch.strips[input.itemId];
  if (currentVersion(existing)) {
    return "该项目已剪样；如需调整请使用“改剪尺寸”，旧布条会归档";
  }
  const err = validateCut(batch, input);
  if (err) return err;

  const version = existing ? existing.versions.length + 1 : 1;
  const strip: Strip =
    existing ?? { itemId: input.itemId, versions: [], tests: [] };
  strip.versions.push({
    version,
    positionCm: input.positionCm,
    widthCm: input.widthCm,
    cutBy: input.by.trim(),
    cutAt: input.at,
  });
  batch.strips[input.itemId] = strip;
  batch.events.push({
    kind: "cut",
    at: input.at,
    by: input.by.trim(),
    itemId: input.itemId,
    version,
    positionCm: input.positionCm,
    widthCm: input.widthCm,
  });
  return null;
}

/**
 * 改剪尺寸：旧布条立即失效归档（旧检测随旧片保留可追溯），
 * 新版布条需重新检测；整批结论同时失效。
 */
export function resizeStrip(batch: Batch, input: CutInput): string | null {
  const strip = batch.strips[input.itemId];
  const old = currentVersion(strip);
  if (!strip || !old) return "该项目尚无布条，可直接登记剪样";
  const err = validateCut(batch, input);
  if (err) return err;

  old.invalidatedAt = input.at;
  old.invalidatedBy = input.by.trim();
  old.invalidateReason = "resized";
  const version = strip.versions.length + 1;
  strip.versions.push({
    version,
    positionCm: input.positionCm,
    widthCm: input.widthCm,
    cutBy: input.by.trim(),
    cutAt: input.at,
  });
  batch.events.push(
    {
      kind: "cutInvalidated",
      at: input.at,
      by: input.by.trim(),
      itemId: input.itemId,
      version: old.version,
      reason: "resized",
    },
    {
      kind: "cut",
      at: input.at,
      by: input.by.trim(),
      itemId: input.itemId,
      version,
      positionCm: input.positionCm,
      widthCm: input.widthCm,
    },
  );
  invalidateConclusion(batch, input.at, input.by.trim(), "resized");
  return null;
}

interface TestInput {
  itemId: TestItemId;
  value: string;
  result: Verdict;
  inspector: string;
  at: string;
}

/** 登记初检/复测；复测必须换人，且只替换该片结论，不影响其他片 */
export function recordTest(batch: Batch, input: TestInput): string | null {
  const strip = batch.strips[input.itemId];
  const cut = currentVersion(strip);
  if (!strip || !cut) return "请先登记剪样再录入检测";
  if (!input.value.trim()) return "请填写检测数据";
  if (!input.inspector.trim()) return "请填写检验人";

  const prior = testsOnVersion(strip, cut.version);
  const last = prior[prior.length - 1];
  if (last && last.inspector === input.inspector.trim()) {
    return `复测必须换人：该片上次检验人为「${last.inspector}」`;
  }

  const test: StripTest = {
    id: uid(),
    cutVersion: cut.version,
    attempt: prior.length + 1,
    result: input.result,
    value: input.value.trim(),
    inspector: input.inspector.trim(),
    at: input.at,
  };
  strip.tests.push(test);
  batch.events.push({
    kind: "test",
    at: input.at,
    itemId: input.itemId,
    testId: test.id,
    cutVersion: cut.version,
    attempt: test.attempt,
    result: test.result,
    value: test.value,
    inspector: test.inspector,
  });

  // 新检测（含复测）只影响本片；若整批已出结论，则结论失效，需重新判定
  if (batch.conclusion && !batch.conclusionInvalidatedAt) {
    invalidateConclusion(batch, input.at, input.inspector.trim(), "retested");
  }
  return null;
}

/** 调整检测项目：相关布条与整批结论失效，旧布条归档可追溯 */
export function changeItems(
  batch: Batch,
  itemIds: TestItemId[],
  by: string,
  at: string,
): string | null {
  if (!by.trim()) return "请填写操作人";
  if (itemIds.length === 0) return "至少保留一个检测项目";
  if (itemIds.some((id) => !TEST_ITEMS[id])) return "检测项目不合法";

  const next = new Set(itemIds);
  const added = itemIds.filter((id) => !batch.itemIds.includes(id));
  const removed = batch.itemIds.filter((id) => !next.has(id));
  if (added.length === 0 && removed.length === 0) return null;

  for (const itemId of removed) {
    const cut = currentVersion(batch.strips[itemId]);
    if (cut) {
      cut.invalidatedAt = at;
      cut.invalidatedBy = by.trim();
      cut.invalidateReason = "itemRemoved";
      batch.events.push({
        kind: "cutInvalidated",
        at,
        by: by.trim(),
        itemId,
        version: cut.version,
        reason: "itemRemoved",
      });
    }
  }
  batch.itemIds = [...itemIds];
  batch.events.push({
    kind: "itemsChanged",
    at,
    by: by.trim(),
    added,
    removed,
  });
  invalidateConclusion(batch, at, by.trim(), "itemsChanged");
  return null;
}

/** 出具整批结论：尺寸超限或有项目未检测时一律驳回 */
export function issueConclusion(
  batch: Batch,
  verdict: Verdict,
  by: string,
  at: string,
): string | null {
  if (!by.trim()) return "请填写结论签发人";
  if (isOversize(batch)) {
    return `布条宽度合计 ${usedWidth(batch)}cm 已超过母样 ${batch.masterWidthCm}cm，不能出具整批结论`;
  }
  const blockers = conclusionBlockers(batch);
  if (blockers.length > 0) {
    const names = blockers
      .map((b) => `${TEST_ITEMS[b.itemId].name}${b.stage === "cut" ? "未剪样" : "未检测"}`)
      .join("、");
    return `仍有项目未完成（${names}），不能出具整批结论`;
  }
  if (verdict === "pass" && !allStripsPass(batch)) {
    return "存在不合格布条，不能判定批次通过；请先复测或改判不合格";
  }

  batch.conclusion = { verdict, at, by: by.trim() };
  batch.conclusionInvalidatedAt = undefined;
  batch.events.push({
    kind: "conclusionIssued",
    at,
    by: by.trim(),
    verdict,
  });
  return null;
}

function invalidateConclusion(
  batch: Batch,
  at: string,
  by: string,
  reason: InvalidateReason,
): void {
  if (!batch.conclusion || batch.conclusionInvalidatedAt) return;
  batch.conclusionInvalidatedAt = at;
  batch.events.push({ kind: "conclusionInvalidated", at, by, reason });
}
