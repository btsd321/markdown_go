/**
 * VideoBlock —— 块级 atom 节点，承载 `<video>` 或 `<iframe>`。
 *
 * attrs:
 *   - kind:  'video' | 'iframe'   （决定 renderHTML 选哪个标签）
 *   - src:   string               （markdown 中保存的原始 src，可为相对/绝对/远端）
 *   - title: string | null
 *   - width / height: string | number | null
 *
 * - 渲染时 `<video>` 的 src 走 resolveImageSrc，把相对/本地绝对路径转成 webview URI；
 *   `<iframe>` 仅用远端 URL，不做改写。
 * - 序列化输出 HTML 块（详见 serializer.ts）。
 */
import { Node, mergeAttributes } from '@tiptap/core';
import { resolveImageSrc } from '../../runtime/imageBase';

export interface VideoBlockAttrs {
  kind: 'video' | 'iframe';
  src: string;
  title: string | null;
  width: string | number | null;
  height: string | number | null;
}

export const VideoBlock = Node.create({
  name: 'videoBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      kind: { default: 'video' },
      src: { default: '' },
      title: { default: null },
      width: { default: null },
      height: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'video[src]',
        getAttrs: (el) => ({
          kind: 'video',
          src: (el as HTMLElement).getAttribute('src') || '',
          title: (el as HTMLElement).getAttribute('title'),
          width: (el as HTMLElement).getAttribute('width'),
          height: (el as HTMLElement).getAttribute('height'),
        }),
      },
      {
        tag: 'video',
        getAttrs: (el) => {
          const source = (el as HTMLElement).querySelector('source[src]');
          if (!source) return false;
          return {
            kind: 'video',
            src: source.getAttribute('src') || '',
            title: (el as HTMLElement).getAttribute('title'),
            width: (el as HTMLElement).getAttribute('width'),
            height: (el as HTMLElement).getAttribute('height'),
          };
        },
      },
      {
        tag: 'iframe[src]',
        getAttrs: (el) => ({
          kind: 'iframe',
          src: (el as HTMLElement).getAttribute('src') || '',
          title: (el as HTMLElement).getAttribute('title'),
          width: (el as HTMLElement).getAttribute('width'),
          height: (el as HTMLElement).getAttribute('height'),
        }),
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const attrs = HTMLAttributes as unknown as VideoBlockAttrs;
    const src = attrs.src || '';
    if (attrs.kind === 'iframe') {
      const iframeAttrs: Record<string, unknown> = {
        src,
        frameborder: '0',
        allowfullscreen: 'true',
        loading: 'lazy',
        class: 'tiptap-video-iframe',
      };
      if (attrs.title) iframeAttrs.title = attrs.title;
      if (attrs.width) iframeAttrs.width = attrs.width;
      if (attrs.height) iframeAttrs.height = attrs.height;
      return [
        'div',
        { class: 'tiptap-video-iframe-wrap' },
        ['iframe', mergeAttributes(iframeAttrs)],
      ];
    }
    // <video>
    const videoAttrs: Record<string, unknown> = {
      src: resolveImageSrc(src),
      controls: 'true',
      class: 'tiptap-video',
    };
    if (attrs.title) videoAttrs.title = attrs.title;
    if (attrs.width) videoAttrs.width = attrs.width;
    if (attrs.height) videoAttrs.height = attrs.height;
    return ['video', mergeAttributes(videoAttrs)];
  },
});
