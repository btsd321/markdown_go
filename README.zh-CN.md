# Markdown Go

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

[English](./README.MD) | **简体中文**

一个面向零基础用户的所见即所得（WYSIWYG）VS Code Markdown 编辑器：所看即所得，无需记忆任何 Markdown 语法。

> 仍处于活跃开发阶段，欢迎试用与反馈。

## 功能特性

### 编辑体验

- 🎯 **所见即所得** —— 直接看到渲染后的样式，不暴露原始 `#`、`*`、`>` 等符号
- ➕ **行首 `+` 按钮** —— 一键插入标题（H1–H6，子菜单选择 H4–H6）、段落、列表、引用、代码块、分割线、LaTeX、Mermaid、图片、视频
- ⌨️ **斜杠菜单** —— 输入 `/` 即时唤起插入菜单，支持模糊搜索（如 `/h5`、`/mermaid`）
- 🫧 **气泡菜单** —— 选中文字后浮现，调整段落类型、对齐、加粗/斜体/链接、文字颜色等
- 📋 **智能粘贴** —— 自动识别 Markdown 文本、富文本、图片
- ↩️ **顺手的快捷键** —— 列表内 Enter 自动续接、空列表项 Enter 退出、行首 Backspace 还原对齐与列表

### 块级渲染

- 🧮 **LaTeX 公式**（KaTeX）—— 块级 `$$ … $$`，支持双击源码编辑
- 📊 **Mermaid 流程图** —— 实时渲染，双击切换源码模式
- 🖼️ **图片** —— 本地相对路径 / 绝对路径 / 在线 URL，自动注册 `localResourceRoots`
- 🎬 **视频 / iframe** —— `<video>` 与 `<iframe>` 嵌入，URL 与本地文件双 Tab 选择
- 📐 **块对齐** —— 段落 / 标题 / 图片左中右对齐（写入 `<div align="…">` 兼容 GitHub）
- 🎨 **行内文字颜色** —— 通过 `<span style="color:…">` 序列化

### 三种显示模式

| 模式      | 说明                           |
| --------- | ------------------------------ |
| `edit`    | 所见即所得编辑（默认）         |
| `preview` | 只读预览，隐藏所有编辑控件     |
| `plain`   | 显示原始 Markdown 源码         |

### 集成

- 📁 **资源管理器右键** —— "用 Markdown Go 打开"
- 🪟 **编辑器标题栏 / 右键菜单** —— 同样的入口
- ⌨️ **快捷键** `Ctrl+Shift+M` / `Cmd+Shift+M`（在 Markdown 文件上）
- 🌍 **中英文界面** —— 跟随 VS Code 显示语言或手动切换

## 安装与使用

```bash
# 克隆并构建
npm install
npm run build

# 在 VS Code 中按 F5 启动 Extension Development Host 调试
```

打开任意 `.md` 文件后：

- 通过 `Ctrl+Shift+P` 运行 **Markdown Go: Open With Markdown Go**
- 或在资源管理器 / 编辑器标签页右键选择 **用 Markdown Go 打开**
- 或按 `Ctrl+Shift+M`

## 命令

| 命令 ID                      | 名称                        | 说明                            |
| ---------------------------- | --------------------------- | ------------------------------- |
| `markdownGo.openWith`        | Open With Markdown Go       | 用本插件打开当前 Markdown       |
| `markdownGo.switchMode`      | Switch Display Mode         | 在编辑 / 只读 / 纯文本之间切换  |
| `markdownGo.switchLanguage`  | Switch Language             | 切换中文 / 英文界面             |

## 配置参数

在 `settings.json` 中通过 `markdownGo.*` 配置：

| 配置项                         | 类型                              | 默认值       | 说明                                                 |
| ------------------------------ | --------------------------------- | ------------ | ---------------------------------------------------- |
| `markdownGo.language`          | `"zh-cn" \| "en"`                 | `"en"`       | 编辑器界面语言                                       |
| `markdownGo.defaultMode`       | `"edit" \| "preview" \| "plain"`  | `"edit"`     | 打开文档时的默认显示模式                             |
| `markdownGo.slashTrigger`      | `string`                          | `"/"`        | 触发斜杠菜单的字符                                   |
| `markdownGo.defaultCopyFormat` | `"markdown" \| "plain"`           | `"markdown"` | 复制时默认输出格式                                   |
| `markdownGo.keybindings`       | `object`                          | `{}`         | 覆盖编辑器内部快捷键（命令 ID → 快捷键字符串或数组） |

`markdownGo.keybindings` 支持的命令 ID：

- `editor.undo` / `editor.redo`
- `editor.enter` / `editor.softLineBreak`
- `editor.backspaceAtStart`
- `editor.indent` / `editor.outdent`

修饰键支持 `Ctrl` / `Cmd` / `Shift` / `Alt`，以及跨平台 `Mod`（Mac → Cmd，其他 → Ctrl）。值为空字符串则解绑该默认快捷键。示例：

```json
"markdownGo.keybindings": {
  "editor.indent": "Tab",
  "editor.redo": ["Mod+Y", "Mod+Shift+Z"]
}
```

## 项目结构

```
markdown-go/
├── src/                    # Extension 端
│   ├── extension.ts        # 插件入口与命令注册
│   └── editorProvider/     # 自定义编辑器 Provider
├── webview/                # Webview 端（Tiptap 编辑器）
│   ├── index.ts            # 入口
│   ├── core/               # 通信桥、命令注册表
│   ├── tiptap/             # Tiptap 节点 / 扩展 / 菜单 / Markdown 序列化
│   ├── ui/                 # 对话框等 UI 组件
│   ├── runtime/            # 运行时工具（图片解析等）
│   ├── i18n/               # Webview 国际化
│   └── styles/             # 样式
├── shared/                 # Extension ↔ Webview 共享类型
├── scripts/                # 构建脚本（esbuild）
├── assets/                 # 静态资源
└── agent_docs/             # 设计 / 需求 / 任务文档
```

## 技术栈

- **TypeScript** + **VS Code Extension API**
- **esbuild** —— 构建
- **Tiptap 2 / ProseMirror** —— 编辑器内核（Schema、跨块选区、撤销重做）
- **prosemirror-markdown** + **markdown-it (commonmark)** —— Markdown ↔ ProseMirror 文档双向序列化
- **KaTeX** —— LaTeX 公式渲染
- **Mermaid** —— 流程图渲染

## 开发

```bash
npm install            # 安装依赖
npm run build          # 一次性构建
npm run watch          # 监听增量构建
npm run typecheck      # 类型检查（extension + webview 双工程）
# F5 启动 Extension Development Host 调试
```

## 参考工程

本项目在功能与实现上参考了以下优秀的 VS Code Markdown 相关插件：

- [Markdown All in One](https://github.com/yzhang-gh/vscode-markdown)
- [Markdown Preview Mermaid Support](https://github.com/mjbvz/vscode-markdown-mermaid)
- [LaTeX (vscode-latex)](https://github.com/mathematic-inc/vscode-latex)
- [Markdown+Math (mdmath)](https://github.com/goessner/mdmath)

## 许可证

本项目基于 [MIT License](./LICENSE) 发布。
