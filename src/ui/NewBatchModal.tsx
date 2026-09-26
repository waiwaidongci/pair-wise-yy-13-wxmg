// 页面操作层：新建留样批次弹窗

import { useState } from "react";
import {
  TEST_ITEMS,
  TestItemId,
  DEFAULT_ITEMS,
  createBatch,
  Batch,
} from "../domain/splitting";

interface Props {
  onClose: () => void;
  onCreate: (result: Batch | string) => void;
}

export default function NewBatchModal({ onClose, onCreate }: Props) {
  const [code, setCode] = useState("");
  const [customer, setCustomer] = useState("");
  const [orderNo, setOrderNo] = useState("");
  const [fabric, setFabric] = useState("");
  const [note, setNote] = useState("");
  const [masterWidth, setMasterWidth] = useState("30");
  const [items, setItems] = useState<TestItemId[]>(DEFAULT_ITEMS);
  const [by, setBy] = useState("");

  const toggle = (id: TestItemId) =>
    setItems((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const plannedWidth = items.reduce((s, id) => s + TEST_ITEMS[id].standardWidthCm, 0);

  const submit = () => {
    onCreate(
      createBatch({
        code,
        orderNo,
        customer,
        fabric,
        note,
        masterWidthCm: parseFloat(masterWidth),
        itemIds: items,
        by,
        at: new Date().toISOString(),
      }),
    );
  };

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h3>新建留样批次</h3>
          <button className="close-x" onClick={onClose}>×</button>
        </header>
        <div className="modal-body">
          <div className="form-grid-2">
            <label>
              <span>批次号 *</span>
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="如 LAB-626A" />
            </label>
            <label>
              <span>客户名称 *</span>
              <input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="如 澜庭服饰" />
            </label>
            <label>
              <span>客户订单号 *</span>
              <input value={orderNo} onChange={(e) => setOrderNo(e.target.value)} placeholder="如 PO-2609-135" />
            </label>
            <label>
              <span>面料规格</span>
              <input value={fabric} onChange={(e) => setFabric(e.target.value)} placeholder="如 棉府绸 120g" />
            </label>
            <label>
              <span>母样可剪长度（cm）*</span>
              <input type="number" min="0" step="0.5" value={masterWidth} onChange={(e) => setMasterWidth(e.target.value)} />
            </label>
            <label>
              <span>登记人 *</span>
              <input value={by} onChange={(e) => setBy(e.target.value)} placeholder="如 王敏" />
            </label>
          </div>
          <label className="full-label">
            <span>备注</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="后整理、客户特殊要求等" />
          </label>

          <div className="item-checks">
            <span className="checks-title">检测项目（默认色差 / 耐水洗 / 手感）</span>
            {(Object.keys(TEST_ITEMS) as TestItemId[]).map((id) => (
              <label key={id} className="check-pill">
                <input type="checkbox" checked={items.includes(id)} onChange={() => toggle(id)} />
                <span>
                  {TEST_ITEMS[id].fullName}
                  <em>常规剪宽 {TEST_ITEMS[id].standardWidthCm}cm</em>
                </span>
              </label>
            ))}
          </div>
          <p className={`width-plan ${plannedWidth > parseFloat(masterWidth) ? "neg" : ""}`}>
            按常规尺寸预计三片合计 {plannedWidth}cm，母样 {masterWidth || 0}cm
            {plannedWidth > parseFloat(masterWidth)
              ? "，预计超限，剪样时需调整宽度"
              : `，预计余量 ${(parseFloat(masterWidth) || 0) - plannedWidth}cm`}
          </p>
        </div>
        <footer className="modal-foot">
          <button onClick={onClose}>取消</button>
          <button className="primary" onClick={submit}>建立批次档案</button>
        </footer>
      </div>
    </div>
  );
}
