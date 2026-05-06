/**
 * 自定义 Image 扩展：在 renderHTML 时把相对路径的 src 替换成 webview 可加载的 URI。
 * 序列化到 markdown 时仍写原始相对路径（attrs.src 保持不变）。
 */
import Image from '@tiptap/extension-image';
import { resolveImageSrc } from '../../runtime/imageBase';
import { bridge } from '../../core/bridge';

const loggedSrc = new Set<string>();

export const ImageWithBase = Image.extend({
  name: 'image',
  inline: true,
  group: 'inline',
  draggable: true,
  renderHTML({ HTMLAttributes }) {
    const src = (HTMLAttributes as { src?: string }).src ?? '';
    const display = resolveImageSrc(src);
    if (src && !loggedSrc.has(src)) {
      loggedSrc.add(src);
      bridge.log('info', '[ImageWithBase] resolveImageSrc', { src, display });
    }
    return ['img', { ...HTMLAttributes, src: display }];
  },
});
