import { useState } from "react";
import {
  Batch,
  STATUS_LABEL,
  SpecEntry,
  Strip,
  activeStrips,
  deriveConclusion,
  itemLabel,
  lastInspector,
  parentAreaCm2,
  remainingAreaCm2,
  retiredStrips,
  stripAreaCm2,
  usedAreaCm2,
} from "../domain/slicing";
import { SpecEditor } from "./SpecEditor";

interface Props {
  batch: Batch;
  expanded: boolean;
  onToggle: () => void;
  onRecord: (
    batchId: string,
    stripId: string,
    inspector: string,
    result: "pass" | "fail",
    note: string
  ) => string | null;
  onSpecSave: (batchId: string, spec: SpecEntry[]) => string | null;
  onReposition: (batchId: string, stripId: string, position: string) => void;
}

export function BatchCard({
  batch,
  expanded,
  onToggle,
  onRecord,
  onSpecSave,
  onReposition,
}: Props) {
  const [specOpen, setSpecOpen] = useState(false);
  const [formStripId, setFormStripId] = useState<string | null>(null);

  const conclusion = deriveConclusion(batch);
  const parent = parentAreaCm2(batch);
  const used = usedAreaCm2(batch);
  const remaining = remainingAreaCm2(batch);
  const active = activeStrips(batch);
  const retired = retiredStrips(batch);
  const usedPct = Math.min(100, Math.round((used / parent) * 100));

  const renderStrip = (strip: Strip) => {
    const inspector = lastInspector(strip);
    return (
      <div className="strip" key={strip.id}>
        <div className="strip-top">
          <b className="strip-item">{itemLabel(strip.item)}</b>
          <label className="position">
            <span>剪样位置</span>
            <input
              key={`${strip.id}-${strip.position}`}
              defaultValue={strip.position}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== strip.position) onReposition(batch.id, strip.id, v);
              }}
            />
          </label>
          <span className="dim">
            尺寸 {strip.widthCm}×{strip.lengthCm}cm（{stripAreaCm2(strip)}cm²）
          </span>
          <span className={`badge sm ${strip.status}`}>{STATUS_LABEL[strip.status]}</span>
          {inspector && <span className="muted">最近检验：{inspector}</span>}
          <button
            className="ghost"
            onClick={() => setFormStripId(formStripId === strip.id ? null : strip.id)}
          >
            {strip.reviews.length ? "申请复测" : "登记检测"}
          </button>
        </div>
        {strip.reviews.length > 0 && (
          <ul className="reviews">
            {strip.reviews.map((r) => (
              <li key={r.id}>
                <b>
                  #{r.round} {r.inspector}
                </b>{" "}
                · {r.result === "pass" ? "合格" : "不合格"} · {r.note || "—"} ·{" "}
                <time>{r.at}</time>
                {r.round > 1 && <em>（复测已换人）</em>}
              </li>
            ))}
          </ul>
        )}
        {formStripId === strip.id && (
          <ResultForm
            strip={strip}
            onCancel={() => setFormStripId(null)}
            onSubmit={(i, r, n) => {
              const err = onRecord(batch.id, strip.id, i, r, n);
              if (!err) setFormStripId(null);
              return err;
            }}
          />
        )}
      </div>
    );
  };

  const renderRetired = (strip: Strip) => (
    <div className="strip retired" key={strip.id}>
      <div className="strip-top">
        <b className="strip-item">{itemLabel(strip.item)}</b>
        <span className="muted">{strip.position}</span>
        <span className="dim">
          尺寸 {strip.widthCm}×{strip.lengthCm}cm（{stripAreaCm2(strip)}cm²）
        </span>
        <span className="badge sm invalid">已失效</span>
        <span className="muted">{strip.invalidatedBy} · 规则 v{strip.specVersion}</span>
      </div>
      {strip.reviews.length > 0 && (
        <ul className="reviews">
          {strip.reviews.map((r) => (
            <li key={r.id}>
              <b>
                #{r.round} {r.inspector}
              </b>{" "}
              · {r.result === "pass" ? "合格" : "不合格"} · {r.note || "—"} ·{" "}
              <time>{r.at}</time>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <article className={`batch-card ${expanded ? "open" : ""}`}>
      <button className="batch-head" onClick={onToggle} aria-expanded={expanded}>
        <span className="batch-id">
          <b>{batch.id}</b>
          <small>
            {batch.orderNo} · {batch.customer}
          </small>
        </span>
        <span className="batch-fabric">
          {batch.fabric}
          <small>
            母样 {batch.parentLengthCm}×{batch.parentWidthCm}cm
          </small>
        </span>
        <span className="batch-remaining">
          <small className={remaining < 0 ? "danger" : ""}>
            {remaining >= 0 ? `母样余量 ${remaining}cm²` : `超裁 ${-remaining}cm²`}
          </small>
          <span className={`meter ${remaining < 0 ? "over" : ""}`}>
            <i style={{ width: `${usedPct}%` }} />
          </span>
        </span>
        <span className={`badge ${conclusion.kind}`}>{conclusion.label}</span>
        <span className="toggle">{expanded ? "收起 ▲" : "展开 ▼"}</span>
      </button>

      {expanded && (
        <div className="batch-body">
          <p className={`conclusion-detail ${conclusion.kind}`}>{conclusion.detail}</p>
          <div className="meta-row">
            <span>
              母样 {batch.parentLengthCm}×{batch.parentWidthCm}cm（{parent}cm²）
            </span>
            <span>已裁 {used}cm²</span>
            <span className={remaining < 0 ? "danger" : ""}>余量 {remaining}cm²</span>
            <span>分片规则 v{batch.specVersion}</span>
            <button className="ghost" onClick={() => setSpecOpen(!specOpen)}>
              {specOpen ? "收起规则" : "调整分片规则"}
            </button>
          </div>

          {specOpen && (
            <SpecEditor
              current={batch.spec}
              version={batch.specVersion}
              onSave={(spec) => onSpecSave(batch.id, spec)}
              onClose={() => setSpecOpen(false)}
            />
          )}

          <h4>在检布条（{active.length}）</h4>
          <div className="strips">{active.map(renderStrip)}</div>

          {retired.length > 0 && (
            <>
              <h4>历史布条 · 可追溯（{retired.length}）</h4>
              <div className="strips">{retired.map(renderRetired)}</div>
            </>
          )}
        </div>
      )}
    </article>
  );
}

function ResultForm({
  strip,
  onSubmit,
  onCancel,
}: {
  strip: Strip;
  onSubmit: (inspector: string, result: "pass" | "fail", note: string) => string | null;
  onCancel: () => void;
}) {
  const isRetest = strip.reviews.length > 0;
  const [inspector, setInspector] = useState("");
  const [result, setResult] = useState<"pass" | "fail">("pass");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="result-form"
      onSubmit={(e) => {
        e.preventDefault();
        setError(onSubmit(inspector, result, note));
      }}
    >
      <label>
        <span>
          检验人{isRetest ? `（复测须换人，上次：${lastInspector(strip)}）` : ""}
        </span>
        <input
          list="inspector-options"
          value={inspector}
          placeholder="姓名"
          onChange={(e) => setInspector(e.target.value)}
        />
      </label>
      <label>
        <span>结果</span>
        <select value={result} onChange={(e) => setResult(e.target.value as "pass" | "fail")}>
          <option value="pass">合格</option>
          <option value="fail">不合格</option>
        </select>
      </label>
      <label>
        <span>备注</span>
        <input
          value={note}
          placeholder="检测数据 / 说明"
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <div className="form-actions">
        <button type="submit" className="primary">
          {isRetest ? "提交复测" : "提交检测"}
        </button>
        <button type="button" onClick={onCancel}>
          取消
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}
    </form>
  );
}
