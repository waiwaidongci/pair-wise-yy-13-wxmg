import { useState } from "react";
import { DEFAULT_SPEC, itemLabel } from "../domain/slicing";
import { NewBatchDraft } from "../store/archive";

interface Props {
  onAdd: (draft: NewBatchDraft) => string | null;
  onClose: () => void;
}

/** 新增批次：登记母样信息，建批后立即按默认分片规则剪样 */
export function NewBatchForm({ onAdd, onClose }: Props) {
  const [orderNo, setOrderNo] = useState("");
  const [customer, setCustomer] = useState("");
  const [fabric, setFabric] = useState("");
  const [parentLength, setParentLength] = useState("50");
  const [parentWidth, setParentWidth] = useState("40");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const err = onAdd({
      orderNo,
      customer,
      fabric,
      parentLengthCm: Number(parentLength),
      parentWidthCm: Number(parentWidth),
    });
    if (err) {
      setError(err);
      return;
    }
    setOrderNo("");
    setCustomer("");
    setFabric("");
    setError(null);
  };

  return (
    <form className="new-batch" onSubmit={submit}>
      <div className="field-grid">
        <label>
          <span>客户订单号</span>
          <input value={orderNo} placeholder="如 PO-8804" onChange={(e) => setOrderNo(e.target.value)} />
        </label>
        <label>
          <span>客户</span>
          <input value={customer} placeholder="客户名称" onChange={(e) => setCustomer(e.target.value)} />
        </label>
        <label>
          <span>面料</span>
          <input value={fabric} placeholder="如 棉府绸 120g" onChange={(e) => setFabric(e.target.value)} />
        </label>
        <label>
          <span>母样长度 cm</span>
          <input
            type="number"
            min={1}
            value={parentLength}
            onChange={(e) => setParentLength(e.target.value)}
          />
        </label>
        <label>
          <span>母样幅宽 cm</span>
          <input
            type="number"
            min={1}
            value={parentWidth}
            onChange={(e) => setParentWidth(e.target.value)}
          />
        </label>
      </div>
      <p className="muted">
        建批后按默认分片规则剪样：
        {DEFAULT_SPEC.map((s) => `${itemLabel(s.item)} ${s.widthCm}×${s.lengthCm}cm`).join("、")}
        ，可在批次内调整。
      </p>
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions">
        <button type="submit" className="primary">
          建批并剪样
        </button>
        <button type="button" onClick={onClose}>
          取消
        </button>
      </div>
    </form>
  );
}
