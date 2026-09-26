// 页面操作层：单个检测项目布条卡片——剪样登记、初检/复测录入、改剪尺寸、复核记录

import { useState } from "react";
import {
  Batch,
  TEST_ITEMS,
  TestItemId,
  Verdict,
  currentVersion,
  stripStatus,
  testsOnVersion,
  suggestedPosition,
  registerCut,
  recordTest,
  resizeStrip,
} from "../domain/splitting";
import { formatDateTime } from "../lib/format";
import { Commit } from "./commit";

interface Props {
  batch: Batch;
  itemId: TestItemId;
  commit: Commit;
}

const STATUS_TEXT = {
  missing: "未剪样",
  untested: "待检测",
  pass: "合格",
  fail: "不合格",
} as const;

export default function StripCard({ batch, itemId, commit }: Props) {
  const def = TEST_ITEMS[itemId];
  const strip = batch.strips[itemId];
  const cut = currentVersion(strip);
  const status = stripStatus(strip);
  const tests = cut && strip ? testsOnVersion(strip, cut.version) : [];
  const lastTest = tests[tests.length - 1];
  const archived = strip
    ? strip.versions.filter((v) => v.invalidatedAt).reverse()
    : [];

  const [showCut, setShowCut] = useState(!cut);
  const [pos, setPos] = useState(String(suggestedPosition(batch)));
  const [width, setWidth] = useState(String(def.standardWidthCm));
  const [cutter, setCutter] = useState("");

  const [showTest, setShowTest] = useState(false);
  const [value, setValue] = useState("");
  const [verdict, setVerdict] = useState<Verdict>("pass");
  const [inspector, setInspector] = useState("");

  const [showResize, setShowResize] = useState(false);
  const [rPos, setRPos] = useState(cut ? String(cut.positionCm) : "0");
  const [rWidth, setRWidth] = useState(cut ? String(cut.widthCm) : "");
  const [rBy, setRBy] = useState("");

  const isRetest = tests.length > 0;

  const submitCut = () => {
    commit(batch.id, (b) =>
      registerCut(b, {
        itemId,
        positionCm: parseFloat(pos),
        widthCm: parseFloat(width),
        by: cutter,
        at: new Date().toISOString(),
      }),
    );
    setCutter("");
    setShowCut(false);
  };

  const submitTest = () => {
    commit(batch.id, (b) =>
      recordTest(b, {
        itemId,
        value,
        result: verdict,
        inspector,
        at: new Date().toISOString(),
      }),
    );
    setValue("");
    setInspector("");
    setShowTest(false);
  };

  const submitResize = () => {
    commit(batch.id, (b) =>
      resizeStrip(b, {
        itemId,
        positionCm: parseFloat(rPos),
        widthCm: parseFloat(rWidth),
        by: rBy,
        at: new Date().toISOString(),
      }),
    );
    setRBy("");
    setShowResize(false);
  };

  const openResize = () => {
    if (cut) {
      setRPos(String(cut.positionCm));
      setRWidth(String(cut.widthCm));
    }
    setShowResize(true);
  };

  return (
    <article className={`strip st-${status}`}>
      <header className="strip-head">
        <div>
          <h4>{def.name}片</h4>
          <small>{def.fullName} · {def.method}</small>
        </div>
        <span className={`chip chip-${status}`}>{STATUS_TEXT[status]}</span>
      </header>

      {cut ? (
        <div className="cut-info">
          <div>
            <small>剪样位置</small>
            <strong>{cut.positionCm}cm</strong>
            <em>距母样布边</em>
          </div>
          <div>
            <small>布条尺寸</small>
            <strong>{cut.widthCm}cm</strong>
            <em>宽（沿布边）</em>
          </div>
          <div>
            <small>剪样人</small>
            <strong>{cut.cutBy}</strong>
            <em>{formatDateTime(cut.cutAt)}</em>
          </div>
        </div>
      ) : (
        <p className="empty-hint">该项目尚未剪样，复核时将无法找到对应布条</p>
      )}

      {cut && (
        <section className="review-list">
          <h5>
            复核记录
            {isRetest && <em className="retest-tag">已复测 {tests.length - 1} 次，仅替换本片</em>}
          </h5>
          {tests.length === 0 && <p className="empty-hint">暂无检测记录</p>}
          {tests.map((t) => (
            <div key={t.id} className={`review-row r-${t.result}`}>
              <span className="attempt">
                {t.attempt === 1 ? "初检" : `第${t.attempt}次复测`}
              </span>
              <span className={`chip chip-${t.result}`}>
                {t.result === "pass" ? "合格" : "不合格"}
              </span>
              <span className="review-value">{t.value}</span>
              <span className="review-meta">
                {t.inspector} · {formatDateTime(t.at)}
              </span>
            </div>
          ))}
        </section>
      )}

      <div className="strip-actions">
        {cut && !showTest && (
          <button onClick={() => setShowTest(true)}>
            {isRetest ? `登记复测（须换人）` : "录入检测"}
          </button>
        )}
        {cut && !showResize && (
          <button className="warn-btn" onClick={openResize}>
            改剪尺寸
          </button>
        )}
      </div>

      {showCut && !cut && (
        <div className="inline-form">
          <div className="form-grid-3">
            <label>
              <span>剪样位置（cm）</span>
              <input value={pos} onChange={(e) => setPos(e.target.value)} type="number" min="0" step="0.5" />
            </label>
            <label>
              <span>布条宽度（cm）</span>
              <input value={width} onChange={(e) => setWidth(e.target.value)} type="number" min="0" step="0.5" />
            </label>
            <label>
              <span>剪样人</span>
              <input value={cutter} onChange={(e) => setCutter(e.target.value)} placeholder="如 王敏" />
            </label>
          </div>
          <div className="form-foot">
            <em>默认宽 {def.standardWidthCm}cm，位置顺接已剪布条，避免手估</em>
            <button className="primary" onClick={submitCut}>登记剪样</button>
          </div>
        </div>
      )}

      {cut && showTest && (
        <div className="inline-form">
          <div className="form-grid-3">
            <label className="grow2">
              <span>{def.valueLabel}</span>
              <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={def.valuePlaceholder} />
            </label>
            <label>
              <span>检验人</span>
              <input value={inspector} onChange={(e) => setInspector(e.target.value)} placeholder="如 陈芳" />
            </label>
          </div>
          <div className="form-foot">
            <em>
              {isRetest ? (
                <>复测必须换人，上次检验人：<b>{lastTest?.inspector}</b></>
              ) : (
                "初检登记"
              )}
            </em>
            <div className="verdict-toggle">
              <button
                type="button"
                className={verdict === "pass" ? "pick picked-pass" : "pick"}
                onClick={() => setVerdict("pass")}
              >
                合格
              </button>
              <button
                type="button"
                className={verdict === "fail" ? "pick picked-fail" : "pick"}
                onClick={() => setVerdict("fail")}
              >
                不合格
              </button>
              <button className="primary" onClick={submitTest}>提交</button>
            </div>
          </div>
        </div>
      )}

      {cut && showResize && (
        <div className="inline-form danger-zone">
          <p className="warn-text">
            改剪后当前布条作废归档（历史记录保留可追溯），新布条需重新检测，整批结论同时失效。
          </p>
          <div className="form-grid-3">
            <label>
              <span>新位置（cm）</span>
              <input value={rPos} onChange={(e) => setRPos(e.target.value)} type="number" min="0" step="0.5" />
            </label>
            <label>
              <span>新宽度（cm）</span>
              <input value={rWidth} onChange={(e) => setRWidth(e.target.value)} type="number" min="0" step="0.5" />
            </label>
            <label>
              <span>操作人</span>
              <input value={rBy} onChange={(e) => setRBy(e.target.value)} placeholder="如 赵磊" />
            </label>
          </div>
          <div className="form-foot">
            <em>旧片：{cut.positionCm}cm / 宽 {cut.widthCm}cm</em>
            <div>
              <button onClick={() => setShowResize(false)}>取消</button>{" "}
              <button className="danger-btn" onClick={submitResize}>确认改剪并归档旧片</button>
            </div>
          </div>
        </div>
      )}

      {archived.length > 0 && (
        <details className="archive-box">
          <summary>
            历史布条（{archived.length} 版已归档，旧检测随片可追溯）
          </summary>
          {archived.map((v) => (
            <div key={v.version} className="archive-version">
              <div className="archive-head">
                <strong>第 {v.version} 版</strong>
                <span>
                  {v.positionCm}cm / 宽 {v.widthCm}cm · 剪样人 {v.cutBy} · {formatDateTime(v.cutAt)}
                </span>
              </div>
              <em className="archive-reason">
                {v.invalidateReason === "resized" ? "因改剪尺寸作废" : "因检测项目取消作废"}
                ，经手人 {v.invalidatedBy}，{v.invalidatedAt ? formatDateTime(v.invalidatedAt) : ""}
              </em>
              {strip && testsOnVersion(strip, v.version).map((t) => (
                <div key={t.id} className="review-row archived-row">
                  <span className="attempt">
                    {t.attempt === 1 ? "初检" : `第${t.attempt}次复测`}
                  </span>
                  <span className={`chip chip-${t.result}`}>
                    {t.result === "pass" ? "合格" : "不合格"}
                  </span>
                  <span className="review-value">{t.value}</span>
                  <span className="review-meta">
                    {t.inspector} · {formatDateTime(t.at)}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </details>
      )}
    </article>
  );
}
