/**
 * 撤销 / 重做 - 基于 markdown 快照
 *
 * 简单实现：每次外部调用 push(snapshot)，保存到 undo 栈；
 * undo() 时把当前快照压入 redo 栈，返回上一次快照。
 */

export interface HistorySnapshot {
  markdown: string;
  /** 焦点块 id（可选，用于 undo 后恢复光标） */
  activeBlockId: string | null;
  /** 焦点块内偏移量（可选） */
  caretOffset: number;
}

export class History {
  private undoStack: HistorySnapshot[] = [];
  private redoStack: HistorySnapshot[] = [];
  private readonly limit: number;

  constructor(limit = 100) {
    this.limit = limit;
  }

  /** 压入新快照（清空 redo 栈） */
  push(snapshot: HistorySnapshot): void {
    const top = this.undoStack[this.undoStack.length - 1];
    if (top && top.markdown === snapshot.markdown) {
      // 内容相同则只更新光标信息
      top.activeBlockId = snapshot.activeBlockId;
      top.caretOffset = snapshot.caretOffset;
      return;
    }
    this.undoStack.push(snapshot);
    if (this.undoStack.length > this.limit) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  /** 撤销：返回应该恢复的快照（即栈顶之下的一个） */
  undo(current: HistorySnapshot): HistorySnapshot | null {
    if (this.undoStack.length === 0) return null;
    // 顶部一般就是 current，把它移到 redo
    const top = this.undoStack.pop()!;
    this.redoStack.push(current);
    if (top.markdown !== current.markdown) {
      // 顶部不是 current，则它就是要恢复的目标，再放回 undo 顶
      this.undoStack.push(top);
      return top;
    }
    return this.undoStack[this.undoStack.length - 1] ?? null;
  }

  redo(current: HistorySnapshot): HistorySnapshot | null {
    const target = this.redoStack.pop();
    if (!target) return null;
    this.undoStack.push(current);
    return target;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  reset(initial?: HistorySnapshot): void {
    this.undoStack = initial ? [initial] : [];
    this.redoStack = [];
  }
}
