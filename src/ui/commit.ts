// 页面操作层共享类型：所有写操作都经由 commit 走领域规则

import { Batch } from "../domain/splitting";

/**
 * 提交一次批次变更：mutate 返回错误文案则本次修改被丢弃并提示，
 * 返回 null 表示规则校验通过，存档层随之持久化。
 */
export type Commit = (
  batchId: string,
  mutate: (batch: Batch) => string | null,
) => void;
