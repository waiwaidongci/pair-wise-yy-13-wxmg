// ============================================================================
// 留样存档（存储层）
// 负责：批次与布条的持久化（localStorage）、种子数据、变更操作的组装。
// 所有规则判断委托 domain/slicing，页面只调用本层暴露的操作。
// ============================================================================

import {
  Batch,
  DEFAULT_SPEC,
  ReviewRecord,
  SpecEntry,
  Strip,
  TestItemKey,
  applySpecChange,
  checkRecordResult,
  cutStrips,
  recordResult,
  specChanged,
  timestamp,
  uid,
} from "../domain/slicing";

const STORAGE_KEY = "hxyfront-62012.sample-archive";

export interface OpResult {
  batches: Batch[];
  error: string | null;
}

const ok = (batches: Batch[]): OpResult => ({ batches, error: null });
const fail = (batches: Batch[], error: string): OpResult => ({ batches, error });

// ---- 持久化 ----

export function loadBatches(): Batch[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed as Batch[];
    }
  } catch {
    /* 存档损坏时回退到种子数据 */
  }
  return seedBatches();
}

export function saveBatches(batches: Batch[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(batches));
  } catch {
    /* 存储不可用时仅保留内存态 */
  }
}

export function resetArchive(): Batch[] {
  const seed = seedBatches();
  saveBatches(seed);
  return seed;
}

// ---- 变更操作 ----

/** 登记检测/复测结果：复测换人由领域层校验，只替换该片结果 */
export function registerResultOp(
  batches: Batch[],
  batchId: string,
  stripId: string,
  inspector: string,
  result: "pass" | "fail",
  note: string
): OpResult {
  const batch = batches.find((b) => b.id === batchId);
  const strip = batch?.strips.find((s) => s.id === stripId);
  if (!batch || !strip) return fail(batches, "未找到对应布条");
  const error = checkRecordResult(strip, inspector);
  if (error) return fail(batches, error);
  const next = recordResult(strip, inspector, result, note, timestamp());
  return ok(
    batches.map((b) =>
      b.id === batchId
        ? { ...b, strips: b.strips.map((s) => (s.id === stripId ? next : s)) }
        : b
    )
  );
}

/** 调整分片规则：相关布条与整批结论失效，旧布条转入存档可追溯 */
export function changeSpecOp(batches: Batch[], batchId: string, spec: SpecEntry[]): OpResult {
  const batch = batches.find((b) => b.id === batchId);
  if (!batch) return fail(batches, "未找到批次");
  if (!specChanged(batch.spec, spec)) return fail(batches, "检测项目与尺寸均未变化");
  const next = applySpecChange(batch, spec);
  return ok(batches.map((b) => (b.id === batchId ? next : b)));
}

/** 修正某片的剪样位置登记 */
export function repositionStripOp(
  batches: Batch[],
  batchId: string,
  stripId: string,
  position: string
): Batch[] {
  return batches.map((b) =>
    b.id === batchId
      ? {
          ...b,
          strips: b.strips.map((s) => (s.id === stripId && s.active ? { ...s, position } : s)),
        }
      : b
  );
}

export interface NewBatchDraft {
  orderNo: string;
  customer: string;
  fabric: string;
  parentLengthCm: number;
  parentWidthCm: number;
}

/** 新增批次：立即按默认分片规则剪样 */
export function addBatchOp(batches: Batch[], draft: NewBatchDraft): OpResult {
  const orderNo = draft.orderNo.trim();
  const customer = draft.customer.trim();
  const fabric = draft.fabric.trim();
  if (!orderNo || !customer || !fabric) return fail(batches, "订单号、客户、面料均为必填");
  if (!(draft.parentLengthCm > 0) || !(draft.parentWidthCm > 0))
    return fail(batches, "母样尺寸必须为正数");
  const id = nextBatchId(batches);
  const spec = DEFAULT_SPEC.map((e) => ({ ...e }));
  const batch: Batch = {
    id,
    orderNo,
    customer,
    fabric,
    parentWidthCm: draft.parentWidthCm,
    parentLengthCm: draft.parentLengthCm,
    spec,
    specVersion: 1,
    strips: cutStrips(id, spec, 1),
    createdAt: timestamp(),
  };
  return ok([batch, ...batches]);
}

function nextBatchId(batches: Batch[]): string {
  const max = batches.reduce((m, b) => {
    const match = /SL-2609-(\d+)/.exec(b.id);
    return match ? Math.max(m, Number(match[1])) : m;
  }, 0);
  return `SL-2609-${String(max + 1).padStart(2, "0")}`;
}

// ---- 种子数据 ----

function rev(
  round: number,
  inspector: string,
  result: "pass" | "fail",
  note: string,
  at: string
): ReviewRecord {
  return { id: uid("rev"), round, inspector, result, note, at };
}

function attachReviews(
  strips: Strip[],
  byItem: Partial<Record<TestItemKey, ReviewRecord[]>>
): Strip[] {
  return strips.map((s) => {
    const reviews = byItem[s.item] ?? [];
    return {
      ...s,
      reviews,
      status: reviews.length ? reviews[reviews.length - 1].result : ("pending" as const),
    };
  });
}

export function seedBatches(): Batch[] {
  // 批次 1：三项全部合格 → 整批通过
  const b1Spec = DEFAULT_SPEC.map((e) => ({ ...e }));
  const b1: Batch = {
    id: "SL-2609-01",
    orderNo: "PO-8801",
    customer: "华纺集团",
    fabric: "棉府绸 120g",
    parentLengthCm: 50,
    parentWidthCm: 40,
    spec: b1Spec,
    specVersion: 1,
    strips: attachReviews(cutStrips("SL-2609-01", b1Spec, 1), {
      color: [rev(1, "王莉", "pass", "ΔE 0.72，允差 1.0 内", "2026-09-24 09:30")],
      wash: [rev(1, "陈浩", "pass", "洗后变色 4 级、沾色 4 级", "2026-09-24 11:05")],
      handle: [rev(1, "赵敏", "pass", "柔软度、滑爽度达标", "2026-09-24 14:20")],
    }),
    createdAt: "2026-09-23 16:40",
  };

  // 批次 2：色差初检不合格、换人复测合格；手感未检 → 待检测
  const b2Spec = DEFAULT_SPEC.map((e) => ({ ...e }));
  const b2: Batch = {
    id: "SL-2609-02",
    orderNo: "PO-8801",
    customer: "华纺集团",
    fabric: "涤纶针织 180g",
    parentLengthCm: 45,
    parentWidthCm: 40,
    spec: b2Spec,
    specVersion: 1,
    strips: attachReviews(cutStrips("SL-2609-02", b2Spec, 1), {
      color: [
        rev(1, "陈浩", "fail", "ΔE 1.6 超出允差", "2026-09-24 10:10"),
        rev(2, "王莉", "pass", "复染后 ΔE 0.90", "2026-09-25 09:05"),
      ],
      wash: [rev(1, "赵敏", "pass", "洗后变色 4 级", "2026-09-25 10:30")],
    }),
    createdAt: "2026-09-24 08:15",
  };

  // 批次 3：规则变更过一次，v1 布条失效存档可追溯，v2 新布条待检
  const b3OldSpec: SpecEntry[] = [
    { item: "color", widthCm: 10, lengthCm: 10 },
    { item: "wash", widthCm: 20, lengthCm: 20 },
    { item: "handle", widthCm: 12, lengthCm: 12 },
  ];
  const b3Retired = attachReviews(cutStrips("SL-2609-03", b3OldSpec, 1), {
    color: [rev(1, "王莉", "pass", "ΔE 0.66", "2026-09-22 15:10")],
  }).map((s) => ({ ...s, active: false, invalidatedBy: "分片规则 v1→v2 变更" }));
  const b3Spec = DEFAULT_SPEC.map((e) => ({ ...e }));
  const b3: Batch = {
    id: "SL-2609-03",
    orderNo: "PO-8802",
    customer: "明洲服饰",
    fabric: "混纺斜纹 210g",
    parentLengthCm: 50,
    parentWidthCm: 40,
    spec: b3Spec,
    specVersion: 2,
    strips: [...b3Retired, ...cutStrips("SL-2609-03", b3Spec, 2)],
    createdAt: "2026-09-22 11:00",
  };

  // 批次 4：三片合计超过母样 → 超裁，禁止结论
  const b4Spec: SpecEntry[] = [
    { item: "color", widthCm: 20, lengthCm: 20 },
    { item: "wash", widthCm: 30, lengthCm: 25 },
    { item: "handle", widthCm: 20, lengthCm: 15 },
  ];
  const b4: Batch = {
    id: "SL-2609-04",
    orderNo: "PO-8803",
    customer: "锦程家纺",
    fabric: "锦纶塔夫绸 90g",
    parentLengthCm: 40,
    parentWidthCm: 30,
    spec: b4Spec,
    specVersion: 1,
    strips: attachReviews(cutStrips("SL-2609-04", b4Spec, 1), {
      color: [rev(1, "刘洋", "pass", "ΔE 0.81", "2026-09-25 13:40")],
    }),
    createdAt: "2026-09-25 09:20",
  };

  // 批次 5：耐水洗不合格 → 整批不通过
  const b5Spec = DEFAULT_SPEC.map((e) => ({ ...e }));
  const b5: Batch = {
    id: "SL-2609-05",
    orderNo: "PO-8802",
    customer: "明洲服饰",
    fabric: "棉麻交织 160g",
    parentLengthCm: 50,
    parentWidthCm: 40,
    spec: b5Spec,
    specVersion: 1,
    strips: attachReviews(cutStrips("SL-2609-05", b5Spec, 1), {
      color: [rev(1, "王莉", "pass", "ΔE 0.58", "2026-09-25 15:00")],
      wash: [rev(1, "陈浩", "fail", "沾色 3 级，不达 4 级", "2026-09-25 16:20")],
      handle: [rev(1, "赵敏", "pass", "手感达标", "2026-09-25 16:45")],
    }),
    createdAt: "2026-09-25 14:05",
  };

  return [b1, b2, b3, b4, b5];
}
