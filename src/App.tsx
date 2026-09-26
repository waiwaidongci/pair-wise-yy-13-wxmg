import { useEffect, useMemo, useState } from "react";
import "./styles.css";
import { ConclusionKind, SpecEntry, deriveConclusion, retiredStrips } from "./domain/slicing";
import {
  NewBatchDraft,
  addBatchOp,
  changeSpecOp,
  loadBatches,
  registerResultOp,
  repositionStripOp,
  resetArchive,
  saveBatches,
} from "./store/archive";
import { BatchCard } from "./ui/BatchCard";
import { NewBatchForm } from "./ui/NewBatchForm";

const KIND_OPTIONS: { key: ConclusionKind | "all"; label: string }[] = [
  { key: "all", label: "全部结论" },
  { key: "pass", label: "整批通过" },
  { key: "fail", label: "整批不通过" },
  { key: "pending", label: "待检测" },
  { key: "overcut", label: "超裁·禁止结论" },
  { key: "invalid", label: "规则失效" },
];

function App() {
  const [batches, setBatches] = useState(loadBatches);
  const [orderFilter, setOrderFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState<ConclusionKind | "all">("all");
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [newOpen, setNewOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    saveBatches(batches);
  }, [batches]);

  const conclusions = useMemo(
    () => new Map(batches.map((b) => [b.id, deriveConclusion(b)] as const)),
    [batches]
  );

  const orders = useMemo(() => {
    const seen = new Map<string, string>();
    batches.forEach((b) => seen.set(b.orderNo, b.customer));
    return [...seen.entries()].map(([orderNo, customer]) => ({ orderNo, customer }));
  }, [batches]);

  const visible = batches.filter((b) => {
    if (orderFilter !== "all" && b.orderNo !== orderFilter) return false;
    if (kindFilter !== "all" && conclusions.get(b.id)?.kind !== kindFilter) return false;
    return true;
  });

  const metrics = useMemo(() => {
    const kinds = batches.map((b) => conclusions.get(b.id)!.kind);
    return {
      total: batches.length,
      pass: kinds.filter((k) => k === "pass").length,
      pending: kinds.filter((k) => k === "pending").length,
      archived: batches.reduce((n, b) => n + retiredStrips(b).length, 0),
    };
  }, [batches, conclusions]);

  const toggle = (id: string) =>
    setExpandedIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  // —— 页面操作：只调用存档层暴露的操作，不直接改数据 ——

  const handleRecord = (
    batchId: string,
    stripId: string,
    inspector: string,
    result: "pass" | "fail",
    note: string
  ): string | null => {
    const r = registerResultOp(batches, batchId, stripId, inspector, result, note);
    if (!r.error) setBatches(r.batches);
    return r.error;
  };

  const handleSpecSave = (batchId: string, spec: SpecEntry[]): string | null => {
    const r = changeSpecOp(batches, batchId, spec);
    if (!r.error) {
      setBatches(r.batches);
      setNotice("分片规则已变更：相关布条失效转入存档，整批结论已重置。");
    }
    return r.error;
  };

  const handleReposition = (batchId: string, stripId: string, position: string) =>
    setBatches(repositionStripOp(batches, batchId, stripId, position));

  const handleAdd = (draft: NewBatchDraft): string | null => {
    const r = addBatchOp(batches, draft);
    if (r.error) return r.error;
    setBatches(r.batches);
    setNewOpen(false);
    setNotice(`批次 ${r.batches[0].id} 已建立，按默认规则剪出 ${r.batches[0].strips.length} 片。`);
    return null;
  };

  return (
    <main className="app">
      <section className="hero">
        <p>hxyfront-62012 · 纺织染整实验室</p>
        <h1>留样分片台</h1>
        <span>
          每批小样按检测项目（色差 / 耐水洗 / 手感）剪出独立布条，登记剪样位置、尺寸与检验人，实时核算母样余量。
          三片合计超过母样或任一项目未检测时不出整批结论；复测必须换人且只替换该片结果，三片全部确认合格才判定批次通过；
          调整剪样尺寸或检测项目后相关布条与整批结论失效，旧布条转入存档仍可追溯。
        </span>
      </section>

      <section className="metrics">
        <article>
          <small>在检批次</small>
          <strong>{metrics.total}</strong>
        </article>
        <article>
          <small>整批通过</small>
          <strong>{metrics.pass}</strong>
        </article>
        <article>
          <small>待检测</small>
          <strong>{metrics.pending}</strong>
        </article>
        <article>
          <small>存档布条（可追溯）</small>
          <strong>{metrics.archived}</strong>
        </article>
      </section>

      <section className="workspace">
        <aside className="panel">
          <h2>筛选</h2>
          <p className="filter-title">客户订单</p>
          <div className="chips">
            <button className={orderFilter === "all" ? "on" : ""} onClick={() => setOrderFilter("all")}>
              全部
            </button>
            {orders.map((o) => (
              <button
                key={o.orderNo}
                className={orderFilter === o.orderNo ? "on" : ""}
                title={o.customer}
                onClick={() => setOrderFilter(o.orderNo)}
              >
                {o.orderNo}
              </button>
            ))}
          </div>
          <p className="filter-title">整批结论</p>
          <div className="chips">
            {KIND_OPTIONS.map((k) => (
              <button
                key={k.key}
                className={kindFilter === k.key ? "on" : ""}
                onClick={() => setKindFilter(k.key)}
              >
                {k.label}
              </button>
            ))}
          </div>
          <p className="filter-title">判定规则</p>
          <ul className="rules-note">
            <li>各片合计超母样 → 禁止结论</li>
            <li>任一项目未检测 → 不出结论</li>
            <li>复测必须换人，只替换该片</li>
            <li>三片全合格 → 批次通过</li>
            <li>改规则 → 布条失效、结论重置</li>
          </ul>
        </aside>

        <section className="panel">
          <div className="heading">
            <div>
              <p>留样批次</p>
              <h2>
                {visible.length} / {batches.length} 批
              </h2>
            </div>
            <button className="primary" onClick={() => setNewOpen(!newOpen)}>
              {newOpen ? "收起" : "新增批次"}
            </button>
          </div>

          {newOpen && <NewBatchForm onAdd={handleAdd} onClose={() => setNewOpen(false)} />}
          {notice && <p className="notice">{notice}</p>}

          <div className="batches">
            {visible.map((b) => (
              <BatchCard
                key={b.id}
                batch={b}
                expanded={expandedIds.includes(b.id)}
                onToggle={() => toggle(b.id)}
                onRecord={handleRecord}
                onSpecSave={handleSpecSave}
                onReposition={handleReposition}
              />
            ))}
            {visible.length === 0 && <p className="empty">当前筛选条件下没有批次。</p>}
          </div>
        </section>
      </section>

      <footer className="footer">
        <span>分片规则 domain/slicing · 留样存档 store/archive · 页面操作 ui/*</span>
        <button
          onClick={() => {
            if (window.confirm("恢复示例数据将清空当前存档，继续？")) {
              setBatches(resetArchive());
              setNotice("已恢复示例数据。");
            }
          }}
        >
          恢复示例数据
        </button>
      </footer>

      <datalist id="inspector-options">
        <option value="王莉" />
        <option value="陈浩" />
        <option value="赵敏" />
        <option value="刘洋" />
      </datalist>
    </main>
  );
}

export default App;
