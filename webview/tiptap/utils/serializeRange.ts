/**
 * serializeRange —— 把选区可靠序列化为 markdown
 *
 * 标准做法 `doc.slice(from, to)` 在选区落在列表内部时，
 * 不会包含 orderedList/bulletList 包装节点，导致：
 *   - 有序列表编号丢失
 *   - 列表外观降级为普通段落
 *
 * 本函数在选区命中"同一 list 节点"时显式重建该 list 的子集，
 * 并把 orderedList.start 调整为原始起始编号 + 偏移，再交给 serializer。
 */
import type { EditorState } from '@tiptap/pm/state';
import type { MarkdownSerializer } from 'prosemirror-markdown';

export function serializeRange(
  state: EditorState,
  from: number,
  to: number,
  serializer: MarkdownSerializer,
): string {
  const $from = state.doc.resolve(from);
  const $to = state.doc.resolve(to);

  // 找最深的"同一 list 父节点"
  let listDepth = -1;
  for (let d = Math.min($from.depth, $to.depth); d > 0; d--) {
    const node = $from.node(d);
    const name = node.type.name;
    if ((name === 'orderedList' || name === 'bulletList') && $from.node(d) === $to.node(d)) {
      listDepth = d;
      break;
    }
  }

  if (listDepth >= 0) {
    const listNode = $from.node(listDepth);
    const startIdx = $from.index(listDepth);
    // $to.index(listDepth) 指向"to 所在的子节点 index"；包括它
    const endIdx = Math.min($to.index(listDepth), listNode.childCount - 1);
    const items: any[] = [];
    for (let i = startIdx; i <= endIdx; i++) {
      items.push(listNode.child(i));
    }
    if (items.length > 0) {
      const newAttrs: Record<string, any> = { ...listNode.attrs };
      if (listNode.type.name === 'orderedList') {
        const origStart = (listNode.attrs as { start?: number }).start ?? 1;
        newAttrs.start = origStart + startIdx;
      }
      const newList = listNode.type.create(newAttrs, items);
      const tmpDoc = state.schema.topNodeType.create(null, newList);
      return serializer.serialize(tmpDoc);
    }
  }

  // 兜底：常规 slice
  const slice = state.doc.slice(from, to);
  const tmpDoc = state.schema.topNodeType.create(null, slice.content);
  return serializer.serialize(tmpDoc);
}
