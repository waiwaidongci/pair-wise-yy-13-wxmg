// 事件流的展示文案：仅用于页面操作层回放留样履历

import { BatchEvent, TEST_ITEMS } from "../domain/splitting";
import { formatDateTime } from "./format";

export function describeEvent(e: BatchEvent): string {
  switch (e.kind) {
    case "created":
      return `建立批次母样档案，登记人 ${e.by}`;
    case "itemsChanged": {
      const parts: string[] = [];
      if (e.added.length)
        parts.push(`增选 ${e.added.map((i) => TEST_ITEMS[i].name).join("、")}`);
      if (e.removed.length)
        parts.push(`取消 ${e.removed.map((i) => TEST_ITEMS[i].name).join("、")}`);
      return `调整检测项目：${parts.join("，")}（${e.by}），相关布条与整批结论失效`;
    }
    case "cut":
      return `${TEST_ITEMS[e.itemId].name}片第 ${e.version} 版剪样登记：距布边 ${e.positionCm}cm，宽 ${e.widthCm}cm，剪样人 ${e.by}`;
    case "cutInvalidated": {
      const reason =
        e.reason === "resized" ? "改剪尺寸，旧片归档" : "检测项目取消，布条归档";
      return `${TEST_ITEMS[e.itemId].name}片第 ${e.version} 版布条失效（${reason}），经手人 ${e.by}`;
    }
    case "test":
      return `${TEST_ITEMS[e.itemId].name}片${
        e.attempt === 1 ? "初检" : `第 ${e.attempt} 次复测（换人）`
      }：${e.result === "pass" ? "合格" : "不合格"} · ${e.value}，检验人 ${e.inspector}`;
    case "conclusionIssued":
      return `签发整批结论：${e.verdict === "pass" ? "批次通过" : "批次不合格"}，签发人 ${e.by}`;
    case "conclusionInvalidated": {
      const reason =
        e.reason === "resized"
          ? "改剪样尺寸"
          : e.reason === "itemsChanged"
            ? "检测项目调整"
            : "布条复测换人";
      return `原整批结论因${reason}失效，需三片重新确认后再判定（${e.by}）`;
    }
  }
}

export function eventTime(e: BatchEvent): string {
  return formatDateTime(e.at);
}

export function eventActor(e: BatchEvent): string {
  return e.kind === "test" ? e.inspector : e.by;
}
