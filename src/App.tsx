import "./styles.css";

import { useMemo, useState } from "react";
import {
  Batch,
  BatchBadge,
  BADGE_LABELS,
  batchBadge,
} from "./domain/splitting";
import { loadBatches, saveBatches, resetBatches } from "./archive/store";
import BatchCard from "./ui/BatchCard";
import NewBatchModal from "./ui/NewBatchModal";
import { Commit } from "./ui/commit";

type BadgeFilter = BatchBadge | "all";

const FILTER_ORDER: BadgeFilter[] = [
  "all",
  "awaitCut",
  "testing",
  "oversize",
  "ready",
  "invalidated",
  "pass",
  "fail",
];

interface Notice {
  type: "error" | "ok";
  text: string;
}

function App() {
  const [batches, setBatches] = useState<Batch[]>(() => loadBatches());
  const [expandedId, setExpandedId] = useState<string | null>(
    () => loadBatches()[0]?.id ?? null,
  );
  const [orderQuery, setOrderQuery] = useState("");
  const [badgeFilter, setBadgeFilter] = useState<BadgeFilter>("all");
  const [showModal, setShowModal] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const persist = (next: Batch[]) => {
    setBatches(next);
    saveBatches(next);
  };

  /** 页面操作层唯一的写入口：克隆 → 跑分片规则 → 通过才存档 */
  const commit: Commit = (batchId, mutate) => {
    let error: string | null = null;
    const next = batches.map((b) => {
      if (b.id !== batchId) return b;
      const draft = structuredClone(b);
      const result = mutate(draft);
      if (result !== null) {
        error = result;
        return b; // 规则驳回：丢弃本次修改
      }
      return draft;
    });
    if (error) {
      setNotice({ type: "error", text: error });
      return;
    }
    persist(next);
    setNotice({ type: "ok", text: "已按分片规则更新并写入留样存档" });
  };

  const handleCreate = (result: Batch | string) => {
    if (typeof result === "string") {
      setNotice({ type: "error", text: result });
      return;
    }
    const next = [result, ...batches];
    persist(next);
    setExpandedId(result.id);
    setShowModal(false);
    setNotice({ type: "ok", text: `批次 ${result.code} 已建档，请逐片登记剪样` });
  };

  const handleReset = () => {
    if (!window.confirm("将清空当前改动并恢复演示留样数据，确定？")) return;
    const seed = resetBatches();
    setBatches(seed);
    setExpandedId(seed[0]?.id ?? null);
    setNotice({ type: "ok", text: "已恢复演示留样" });
  };

  const filtered = useMemo(() => {
    const q = orderQuery.trim().toLowerCase();
    return batches.filter((b) => {
      if (badgeFilter !== "all" && batchBadge(b) !== badgeFilter) return false;
      if (!q) return true;
      return (
        b.customer.toLowerCase().includes(q) ||
        b.orderNo.toLowerCase().includes(q) ||
        b.code.toLowerCase().includes(q)
      );
    });
  }, [batches, orderQuery, badgeFilter]);

  const metrics = useMemo(() => {
    const pass = batches.filter((b) => batchBadge(b) === "pass").length;
    const oversize = batches.filter((b) => batchBadge(b) === "oversize").length;
    const pending = batches.filter((b) => {
      const g = batchBadge(b);
      return g === "awaitCut" || g === "testing";
    }).length;
    return [
      { label: "留样批次", value: String(batches.length) },
      { label: "待剪样/待检测", value: String(pending) },
      { label: "尺寸超限", value: String(oversize) },
      { label: "已判批次通过", value: `${pass}/${batches.length}` },
    ];
  }, [batches]);

  return (
    <main className="app">
      <section className="hero">
        <p>hxyfront-62012 · 纺织染整实验室 · 留样分片台</p>
        <h1>留样分片台</h1>
        <span>
          每批按色差、耐水洗、手感等检测项目剪出独立布条，登记剪样位置、尺寸、检验人与母样余量；
          三片合计超过母样或有项目未检测时不能出具整批结论，复测必须换人且只替换该片，三片全部合格方可判定批次通过。
        </span>
      </section>

      <section className="metrics">
        {metrics.map((m) => (
          <article key={m.label}>
            <small>{m.label}</small>
            <strong>{m.value}</strong>
          </article>
        ))}
      </section>

      <section className="workspace">
        <aside className="panel side-panel">
          <h2>分片规则</h2>
          <ul className="rule-list">
            <li>每个检测项目一片独立布条，默认色差 5cm、耐水洗 10cm、手感 8cm，位置顺接布边，不靠手估</li>
            <li>登记每片的剪样位置、尺寸、剪样人，并自动计算母样余量</li>
            <li>三片宽度合计超过母样，任何情况下都不能出具整批结论</li>
            <li>任何项目未剪样或未检测，不能给出整批结论</li>
            <li>复测必须换人，只替换该片结果，其余布条结论不受影响</li>
            <li>三片全部确认合格后，才能判定批次通过</li>
            <li>改剪尺寸或调整检测项目：相关布条失效、整批结论作废，旧片归档仍可追溯</li>
          </ul>

          <h2>留样存档</h2>
          <ul className="rule-list archive-rules">
            <li>剪样、初检、复测、改剪、项目调整、结论签发全程留痕</li>
            <li>失效布条与检测记录不删除，随批次长期可查</li>
            <li>数据保存在本机浏览器，刷新不丢失</li>
          </ul>
          <button className="reset-btn" onClick={handleReset}>恢复演示留样</button>

          <h2>页面操作</h2>
          <ul className="rule-list">
            <li>按客户订单关键词与结论状态筛选批次</li>
            <li>展开批次查看每片位置、尺寸与复核记录</li>
            <li>在布条卡片内登记剪样、录入检测、改剪尺寸</li>
          </ul>
        </aside>

        <section className="panel list-panel">
          <div className="heading">
            <div>
              <p>留样批次列表</p>
              <h2>按客户订单与结论筛选</h2>
            </div>
            <button className="primary" onClick={() => setShowModal(true)}>
              + 新建留样批次
            </button>
          </div>

          <div className="filters">
            <input
              className="order-search"
              placeholder="搜索客户 / 客户订单号 / 批次号，如 PO-2609"
              value={orderQuery}
              onChange={(e) => setOrderQuery(e.target.value)}
            />
            <div className="filter-chips">
              {FILTER_ORDER.map((f) => (
                <button
                  key={f}
                  className={badgeFilter === f ? "chip-on" : ""}
                  onClick={() => setBadgeFilter(f)}
                >
                  {f === "all" ? "全部结论" : BADGE_LABELS[f]}
                </button>
              ))}
            </div>
          </div>

          {notice && (
            <div className={`notice notice-${notice.type}`}>
              {notice.type === "error" ? "规则拦截：" : "操作完成："}
              {notice.text}
            </div>
          )}

          <div className="batch-list">
            {filtered.length === 0 && (
              <p className="empty-hint list-empty">没有符合筛选条件的批次</p>
            )}
            {filtered.map((b) => (
              <BatchCard
                key={b.id}
                batch={b}
                expanded={expandedId === b.id}
                onToggle={() =>
                  setExpandedId((cur) => (cur === b.id ? null : b.id))
                }
                commit={commit}
              />
            ))}
          </div>
        </section>
      </section>

      {showModal && (
        <NewBatchModal onClose={() => setShowModal(false)} onCreate={handleCreate} />
      )}
    </main>
  );
}

export default App;
