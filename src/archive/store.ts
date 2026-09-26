// 留样存档层：负责留样批次的持久化（localStorage）与初始留样数据。
// 不包含判定规则（规则在 domain/splitting），不包含页面交互。

import {
  Batch,
  createBatch,
  registerCut,
  resizeStrip,
  recordTest,
  changeItems,
  issueConclusion,
  TestItemId,
  Verdict,
} from "../domain/splitting";

const STORAGE_KEY = "hxyfront-62012-sample-archive-v1";

function makeClock(base: Date): () => string {
  let t = base.getTime();
  return () => {
    t += 7 * 60 * 1000; // 每步相隔 7 分钟，保证事件顺序真实可读
    return new Date(t).toISOString();
  };
}

function assertOk(result: string | null): asserts result {
  if (result !== null) throw new Error(`种子数据规则校验失败: ${result}`);
}

/** 用领域规则逐步构造初始留样，保证事件链与状态自洽 */
function buildSeedBatches(): Batch[] {
  const batches: Batch[] = [];
  const clock = makeClock(new Date("2026-09-21T08:30:00"));

  // 批次一：三片全部合格，已签发批次通过
  {
    const t = clock;
    const b = createBatch({
      code: "LAB-620A",
      orderNo: "PO-2609-118",
      customer: "澜庭服饰",
      fabric: "棉府绸 120g",
      note: "客户来样对色，柔软剂后整理",
      masterWidthCm: 30,
      itemIds: ["color", "wash", "feel"],
      by: "王敏",
      at: t(),
    });
    if (typeof b === "string") throw new Error(b);
    assertOk(registerCut(b, { itemId: "color", positionCm: 0, widthCm: 5, by: "王敏", at: t() }));
    assertOk(registerCut(b, { itemId: "wash", positionCm: 5, widthCm: 10, by: "王敏", at: t() }));
    assertOk(registerCut(b, { itemId: "feel", positionCm: 15, widthCm: 8, by: "王敏", at: t() }));
    assertOk(recordTest(b, { itemId: "color", value: "ΔE 0.84", result: "pass", inspector: "陈芳", at: t() }));
    assertOk(recordTest(b, { itemId: "wash", value: "变色4级 / 沾色4-5级", result: "pass", inspector: "李建国", at: t() }));
    assertOk(recordTest(b, { itemId: "feel", value: "4级，柔软滑爽", result: "pass", inspector: "周芸", at: t() }));
    assertOk(issueConclusion(b, "pass", "孙丽华", t()));
    batches.push(b);
  }

  // 批次二：三片尺寸合计超过母样，规则上不允许给出整批结论
  {
    const t = clock;
    const b = createBatch({
      code: "LAB-621C",
      orderNo: "PO-2609-121",
      customer: "启弘运动",
      fabric: "涤纶针织 180g",
      note: "升温曲线偏快，留档复查",
      masterWidthCm: 18,
      itemIds: ["color", "wash", "feel"],
      by: "赵磊",
      at: t(),
    });
    if (typeof b === "string") throw new Error(b);
    assertOk(registerCut(b, { itemId: "color", positionCm: 0, widthCm: 5, by: "赵磊", at: t() }));
    assertOk(registerCut(b, { itemId: "wash", positionCm: 5, widthCm: 10, by: "赵磊", at: t() }));
    // 手感片剪宽 8cm：合计 23cm > 母样 18cm（单片 13cm 仍在母样内，剪样登记不拦截，结论环节拦截）
    assertOk(registerCut(b, { itemId: "feel", positionCm: 15, widthCm: 8, by: "赵磊", at: t() }));
    assertOk(recordTest(b, { itemId: "color", value: "ΔE 1.32", result: "pass", inspector: "陈芳", at: t() }));
    batches.push(b);
  }

  // 批次三：耐水洗初检不合格，换人复测合格；结论因复测作废后重新签发
  {
    const t = clock;
    const b = createBatch({
      code: "LAB-622F",
      orderNo: "PO-2609-124",
      customer: "锦和家纺",
      fabric: "锦纶混纺斜纹 210g",
      note: "深色，皂洗重点关注",
      masterWidthCm: 32,
      itemIds: ["color", "wash", "feel"],
      by: "王敏",
      at: t(),
    });
    if (typeof b === "string") throw new Error(b);
    assertOk(registerCut(b, { itemId: "color", positionCm: 0, widthCm: 5, by: "王敏", at: t() }));
    assertOk(registerCut(b, { itemId: "wash", positionCm: 5, widthCm: 10, by: "王敏", at: t() }));
    assertOk(registerCut(b, { itemId: "feel", positionCm: 15, widthCm: 8, by: "王敏", at: t() }));
    assertOk(recordTest(b, { itemId: "color", value: "ΔE 0.95", result: "pass", inspector: "陈芳", at: t() }));
    assertOk(recordTest(b, { itemId: "feel", value: "3.5级，基本柔软", result: "pass", inspector: "周芸", at: t() }));
    assertOk(recordTest(b, { itemId: "wash", value: "变色3级", result: "fail", inspector: "李建国", at: t() }));
    assertOk(issueConclusion(b, "fail", "孙丽华", t()));
    // 复测必须换人：由高远复测，只替换耐水洗这一片结果，整批结论随之失效
    assertOk(recordTest(b, { itemId: "wash", value: "变色4级 / 沾色4级（复洗后）", result: "pass", inspector: "高远", at: t() }));
    assertOk(issueConclusion(b, "pass", "孙丽华", t()));
    batches.push(b);
  }

  // 批次四：改剪过手感片 + 增删过检测项目；旧布条归档仍可追溯，结论当前失效
  {
    const t = clock;
    const b = createBatch({
      code: "LAB-624B",
      orderNo: "PO-2609-129",
      customer: "澜庭服饰",
      fabric: "棉莫代尔汗布 150g",
      note: "客户确认中，手感片第一次剪偏窄",
      masterWidthCm: 36,
      itemIds: ["color", "wash", "feel"],
      by: "赵磊",
      at: t(),
    });
    if (typeof b === "string") throw new Error(b);
    assertOk(registerCut(b, { itemId: "color", positionCm: 0, widthCm: 5, by: "赵磊", at: t() }));
    assertOk(registerCut(b, { itemId: "wash", positionCm: 5, widthCm: 10, by: "赵磊", at: t() }));
    // 手感片先按 5cm 剪了，初检也做了
    assertOk(registerCut(b, { itemId: "feel", positionCm: 15, widthCm: 5, by: "赵磊", at: t() }));
    assertOk(recordTest(b, { itemId: "color", value: "ΔE 0.71", result: "pass", inspector: "陈芳", at: t() }));
    assertOk(recordTest(b, { itemId: "wash", value: "变色4级 / 沾色4级", result: "pass", inspector: "李建国", at: t() }));
    assertOk(recordTest(b, { itemId: "feel", value: "3级，样片偏窄手感不充分", result: "fail", inspector: "周芸", at: t() }));
    assertOk(issueConclusion(b, "fail", "孙丽华", t()));
    // 改剪手感片为 8cm：旧片归档、旧检保留，结论失效
    assertOk(resizeStrip(b, { itemId: "feel", positionCm: 20, widthCm: 8, by: "赵磊", at: t() }));
    assertOk(recordTest(b, { itemId: "feel", value: "4级，柔软度足够", result: "pass", inspector: "周芸", at: t() }));
    // 临时增选耐摩擦后又取消：耐摩擦片随项目移除归档
    assertOk(changeItems(b, ["color", "wash", "feel", "rub"], "王敏", t()));
    assertOk(registerCut(b, { itemId: "rub", positionCm: 28, widthCm: 5, by: "王敏", at: t() }));
    assertOk(recordTest(b, { itemId: "rub", value: "干摩4级", result: "pass", inspector: "高远", at: t() }));
    assertOk(changeItems(b, ["color", "wash", "feel"], "王敏", t()));
    batches.push(b);
  }

  // 批次五：刚登记，尚未剪样
  {
    const t = clock;
    const b = createBatch({
      code: "LAB-625D",
      orderNo: "PO-2609-131",
      customer: "启弘运动",
      fabric: "涤氨网眼 135g",
      note: "新增急单，客户要求同批附耐摩擦",
      masterWidthCm: 34,
      itemIds: ["color", "wash", "feel", "rub"],
      by: "王敏",
      at: t(),
    });
    if (typeof b === "string") throw new Error(b);
    batches.push(b);
  }

  return batches;
}

export function loadBatches(): Batch[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { batches: Batch[] };
      if (Array.isArray(parsed.batches)) return parsed.batches;
    }
  } catch {
    // 存档损坏时回退到初始留样
  }
  const seed = buildSeedBatches();
  saveBatches(seed);
  return seed;
}

export function saveBatches(batches: Batch[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ batches }));
  } catch {
    // 存储不可用时只影响刷新后的留存，不阻断当前操作
  }
}

export function resetBatches(): Batch[] {
  const seed = buildSeedBatches();
  saveBatches(seed);
  return seed;
}

export type { Batch, TestItemId, Verdict };
