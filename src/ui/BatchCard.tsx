// 页面操作层：批次卡片——列表行、展开明细、整批结论签发、检测项目调整、留样履历

import { useState } from "react";
import {
  Batch,
  TEST_ITEMS,
  TestItemId,
  BatchBadge,
  BADGE_LABELS,
  batchBadge,
  usedWidth,
  remainingWidth,
  isOversize,
  conclusionBlockers,
  canIssueConclusion,
  allStripsPass,
  stripStatus,
  lastInvalidation,
  issueConclusion,
  changeItems,
} from "../domain/splitting";
import { formatDateTime } from "../lib/format";
import { describeEvent, eventTime, eventActor } from "../lib/eventText";
import { Commit } from "./commit";
import StripCard from "./StripCard";

interface Props {
  batch: Batch;
  expanded: boolean;
  onToggle: () => void;
  commit: Commit;
}

const DOT_LABEL = {
  missing: "未剪",
  untested: "待检",
  pass: "合格",
  fail: "不合格",
} as const;

export default function BatchCard({ batch, expanded, onToggle, commit }: Props) {
  const badge: BatchBadge = batchBadge(batch);
  const used = usedWidth(batch);
  const remain = remainingWidth(batch);
  const oversize = isOversize(batch);
  const blockers = conclusionBlockers(batch);
  const issuable = canIssueConclusion(batch);
  const allPass = allStripsPass(batch);
  const invalidation = lastInvalidation(batch);
  const validConclusion = batch.conclusion && !batch.conclusionInvalidatedAt;

  const [signer, setSigner] = useState("");
  const [showItems, setShowItems] = useState(false);
  const [picked, setPicked] = useState<TestItemId[]>(batch.itemIds);
  const [itemBy, setItemBy] = useState("");

  const archivedItemIds = (Object.keys(batch.strips) as TestItemId[]).filter(
    (id) => !batch.itemIds.includes(id),
  );

  const sign = (verdict: "pass" | "fail") => {
    commit(batch.id, (b) =>
      issueConclusion(b, verdict, signer, new Date().toISOString()),
    );
    setSigner("");
  };

  const toggleItem = (id: TestItemId) => {
    setPicked((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const submitItems = () => {
    commit(batch.id, (b) =>
      changeItems(b, picked, itemBy, new Date().toISOString()),
    );
    setItemBy("");
    setShowItems(false);
  };

  return (
    <article className={`batch-card badge-${badge}`}>
      <button className="batch-head" onClick={onToggle}>
        <span className="caret">{expanded ? "▾" : "▸"}</span>
        <span className="batch-title">
          <strong>{batch.code}</strong>
          <small>{batch.fabric}</small>
        </span>
        <span className="batch-order">
          <strong>{batch.customer}</strong>
          <small>订单 {batch.orderNo}</small>
        </span>
        <span className="strip-dots">
          {batch.itemIds.map((id) => {
            const s = stripStatus(batch.strips[id]);
            return (
              <em key={id} className={`dot dot-${s}`} title={TEST_ITEMS[id].name}>
                {TEST_ITEMS[id].name}·{DOT_LABEL[s]}
              </em>
            );
          })}
        </span>
        <span className="remain-mini">
          余量<b className={oversize ? "neg" : ""}>{remain}cm</b>
        </span>
        <span className={`batch-badge b-${badge}`}>{BADGE_LABELS[badge]}</span>
      </button>

      {expanded && (
        <div className="batch-body">
          <section className="meta-grid">
            <div>
              <small>母样可剪长度</small>
              <strong>{batch.masterWidthCm}cm</strong>
            </div>
            <div>
              <small>三片宽度合计（已用）</small>
              <strong className={oversize ? "neg" : ""}>{used}cm</strong>
            </div>
            <div>
              <small>母样余量</small>
              <strong className={oversize ? "neg" : ""}>
                {remain}cm {oversize && "⚠ 已超限"}
              </strong>
            </div>
            <div>
              <small>登记人 / 建样时间</small>
              <strong>
                {batch.events[0] ? eventActor(batch.events[0]) : "—"} ·{" "}
                {formatDateTime(batch.createdAt)}
              </strong>
            </div>
          </section>
          {batch.note && <p className="batch-note">备注：{batch.note}</p>}

          {/* 整批结论区 */}
          <section className="conclusion-box">
            <h4>整批结论</h4>
            {validConclusion ? (
              <div className={`conclusion-issued c-${batch.conclusion!.verdict}`}>
                <strong>
                  {batch.conclusion!.verdict === "pass"
                    ? "✓ 批次通过"
                    : "✗ 批次不合格"}
                </strong>
                <span>
                  签发人 {batch.conclusion!.by} · {formatDateTime(batch.conclusion!.at)}
                </span>
                <em>此后任何一片复测、改剪或项目调整都会使结论失效，需重新判定</em>
              </div>
            ) : (
              <>
                {invalidation && (
                  <div className="invalid-banner">
                    原结论已失效（
                    {invalidation.reason === "resized"
                      ? "改剪尺寸"
                      : invalidation.reason === "itemsChanged"
                        ? "检测项目调整"
                        : "布条复测"}
                    ，{invalidation.by}，{formatDateTime(invalidation.at)}），三片重新确认合格后方可再判通过
                  </div>
                )}
                <ul className="blockers">
                  {oversize && (
                    <li className="block-fail">
                      三片尺寸合计 {used}cm 超过母样 {batch.masterWidthCm}cm，不能给出整批结论
                    </li>
                  )}
                  {blockers.map((b) => (
                    <li key={b.itemId} className="block-warn">
                      {TEST_ITEMS[b.itemId].name}片
                      {b.stage === "cut" ? "尚未剪样" : "尚未检测"}，不能给出整批结论
                    </li>
                  ))}
                  {issuable && !allPass && (
                    <li className="block-warn">
                      仍有布条不合格：三片都确认合格后才能判定批次通过；当前只能判定不合格
                    </li>
                  )}
                  {issuable && allPass && (
                    <li className="block-ok">三片均合格且尺寸未超限，可以签发批次通过</li>
                  )}
                </ul>
                <div className="sign-row">
                  <input
                    placeholder="结论签发人"
                    value={signer}
                    onChange={(e) => setSigner(e.target.value)}
                  />
                  <button
                    className="primary pass-btn"
                    disabled={!issuable || !allPass || !signer.trim()}
                    onClick={() => sign("pass")}
                  >
                    判定批次通过
                  </button>
                  <button
                    className="fail-issue-btn"
                    disabled={!issuable || !signer.trim()}
                    onClick={() => sign("fail")}
                  >
                    判定批次不合格
                  </button>
                </div>
              </>
            )}
          </section>

          {/* 各检测项目布条 */}
          <section className="strips-grid">
            {batch.itemIds.map((id) => (
              <StripCard key={id} batch={batch} itemId={id} commit={commit} />
            ))}
          </section>

          {/* 检测项目调整 */}
          <section className="items-editor">
            <div className="section-head">
              <h4>检测项目（{batch.itemIds.map((i) => TEST_ITEMS[i].name).join("、")}）</h4>
              <button onClick={() => { setPicked(batch.itemIds); setShowItems((v) => !v); }}>
                {showItems ? "收起" : "调整检测项目"}
              </button>
            </div>
            {showItems && (
              <div className="items-form">
                <p className="warn-text">
                  取消某项目会使该片布条失效归档；增选项目需补剪补检；整批结论同时失效，旧布条仍可追溯。
                </p>
                <div className="item-checks">
                  {(Object.keys(TEST_ITEMS) as TestItemId[]).map((id) => (
                    <label key={id} className="check-pill">
                      <input
                        type="checkbox"
                        checked={picked.includes(id)}
                        onChange={() => toggleItem(id)}
                      />
                      <span>
                        {TEST_ITEMS[id].fullName}
                        <em>常规剪宽 {TEST_ITEMS[id].standardWidthCm}cm</em>
                      </span>
                    </label>
                  ))}
                </div>
                <div className="items-confirm">
                  <input placeholder="操作人" value={itemBy} onChange={(e) => setItemBy(e.target.value)} />
                  <button
                    className="primary"
                    disabled={picked.length === 0 || itemBy.trim() === ""}
                    onClick={submitItems}
                  >
                    确认调整
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* 因取消项目而归档的布条 */}
          {archivedItemIds.length > 0 && (
            <details className="removed-archive">
              <summary>
                已移除项目的留样布条（{archivedItemIds.length} 项，归档可追溯）
              </summary>
              {archivedItemIds.map((id) => {
                const strip = batch.strips[id]!;
                return (
                  <div key={id} className="archive-item">
                    <strong>{TEST_ITEMS[id].fullName}片（项目已取消）</strong>
                    {strip.versions.map((v) => (
                      <div key={v.version} className="archive-version">
                        <div className="archive-head">
                          <strong>第 {v.version} 版</strong>
                          <span>
                            {v.positionCm}cm / 宽 {v.widthCm}cm · 剪样人 {v.cutBy} ·{" "}
                            {formatDateTime(v.cutAt)}
                          </span>
                        </div>
                        {v.invalidatedAt && (
                          <em className="archive-reason">
                            因检测项目取消作废，经手人 {v.invalidatedBy}，{formatDateTime(v.invalidatedAt)}
                          </em>
                        )}
                        {strip.tests
                          .filter((t) => t.cutVersion === v.version)
                          .map((t) => (
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
                  </div>
                );
              })}
            </details>
          )}

          {/* 留样履历 */}
          <section className="timeline">
            <h4>留样存档履历（{batch.events.length} 条）</h4>
            <ol>
              {[...batch.events].reverse().map((e, i) => (
                <li key={i}>
                  <time>{eventTime(e)}</time>
                  <span>{describeEvent(e)}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}
    </article>
  );
}
