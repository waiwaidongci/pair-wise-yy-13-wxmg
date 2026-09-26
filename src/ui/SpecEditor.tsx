import { useState } from "react";
import {
  DEFAULT_SPEC,
  SpecEntry,
  TEST_ITEM_CATALOG,
  TestItemKey,
  itemLabel,
} from "../domain/slicing";

interface Props {
  current: SpecEntry[];
  version: number;
  onSave: (spec: SpecEntry[]) => string | null;
  onClose: () => void;
}

interface Row {
  item: TestItemKey;
  enabled: boolean;
  width: string;
  length: string;
}

/** 分片规则编辑器：保存即变更规则，相关布条与整批结论失效 */
export function SpecEditor({ current, version, onSave, onClose }: Props) {
  const [rows, setRows] = useState<Row[]>(() =>
    TEST_ITEM_CATALOG.map((def) => {
      const hit = current.find((e) => e.item === def.key);
      const dft = DEFAULT_SPEC.find((e) => e.item === def.key);
      return {
        item: def.key,
        enabled: Boolean(hit),
        width: String(hit?.widthCm ?? dft?.widthCm ?? 10),
        length: String(hit?.lengthCm ?? dft?.lengthCm ?? 10),
      };
    })
  );
  const [error, setError] = useState<string | null>(null);

  const patch = (item: TestItemKey, part: Partial<Row>) =>
    setRows((cur) => cur.map((r) => (r.item === item ? { ...r, ...part } : r)));

  const save = () => {
    const spec: SpecEntry[] = [];
    for (const row of rows) {
      if (!row.enabled) continue;
      const widthCm = Number(row.width);
      const lengthCm = Number(row.length);
      if (!Number.isFinite(widthCm) || !Number.isFinite(lengthCm) || widthCm <= 0 || lengthCm <= 0) {
        setError(`${itemLabel(row.item)} 的剪样尺寸必须为正数`);
        return;
      }
      spec.push({ item: row.item, widthCm, lengthCm });
    }
    if (spec.length === 0) {
      setError("至少保留一个检测项目");
      return;
    }
    const err = onSave(spec);
    if (err) {
      setError(err);
      return;
    }
    onClose();
  };

  return (
    <div className="spec-editor">
      <p className="warn">
        当前规则 v{version}。变更检测项目或剪样尺寸后，在检布条将全部失效并按新规则重新剪样，
        旧布条转入存档仍可追溯，整批结论重置。
      </p>
      <div className="spec-rows">
        <div className="spec-row spec-row-head">
          <span />
          <span>检测项目</span>
          <span>宽 cm</span>
          <span>长 cm</span>
        </div>
        {rows.map((row) => (
          <div className="spec-row" key={row.item}>
            <input
              type="checkbox"
              checked={row.enabled}
              aria-label={`启用${itemLabel(row.item)}`}
              onChange={(e) => patch(row.item, { enabled: e.target.checked })}
            />
            <span>{itemLabel(row.item)}</span>
            <input
              type="number"
              min={1}
              value={row.width}
              disabled={!row.enabled}
              onChange={(e) => patch(row.item, { width: e.target.value })}
            />
            <input
              type="number"
              min={1}
              value={row.length}
              disabled={!row.enabled}
              onChange={(e) => patch(row.item, { length: e.target.value })}
            />
          </div>
        ))}
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions">
        <button className="primary" onClick={save}>
          保存规则（旧布条失效）
        </button>
        <button onClick={onClose}>取消</button>
      </div>
    </div>
  );
}
