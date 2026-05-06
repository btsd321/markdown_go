# Markdown Go

一个面向零基础用户的所见即所得 VSCode Markdown 编辑器。

## 功能特性

- 🎯 所见即所得编辑体验
- 📝 无需掌握 Markdown 语法
- 🎨 支持 LaTeX 公式渲染
- 📊 支持 Mermaid 流程图
- 🌍 中英文界面切换
- 🔄 三种显示模式（编辑/预览/纯文本）

## 开发状态

当前版本：**0.0.1-alpha**

### 已完成

- ✅ 项目脚手架搭建
- ✅ Extension 端基础架构
- ✅ Webview 通信桥
- ✅ 文档模型（块级结构）
- ✅ 命令注册系统
- ✅ 基础构建流程

### 进行中

- 🚧 UI 组件实现
- 🚧 渲染引擎集成
- 🚧 国际化支持

### 待开发

- ⏳ 行首按钮与下拉菜单
- ⏳ 模式切换控制器
- ⏳ 完整的编辑交互

## 开发

```bash
# 安装依赖
npm install

# 构建
npm run build

# 监听模式
npm run watch

# 类型检查
npm run typecheck

# 调试
# 按 F5 启动 Extension Development Host
```

## 项目结构

```
markdown-go/
├── src/                    # Extension 端
│   ├── extension.ts        # 插件入口
│   └── editorProvider/     # 自定义编辑器
├── webview/                # Webview 端
│   ├── index.ts            # Webview 入口
│   ├── core/               # 核心模块
│   ├── model/              # 文档模型
│   ├── components/         # UI 组件
│   └── renderers/          # 渲染引擎
├── shared/                 # 共享类型
├── l10n/                   # 语言包
└── agent_docs/             # 设计文档
```

## 技术栈

- TypeScript
- VSCode Extension API
- esbuild
- Tiptap (基于 ProseMirror) — 编辑器内核 / Schema / 跨块选区 / 撤销重做
- prosemirror-markdown — Markdown ↔ 文档双向序列化
- KaTeX — LaTeX 公式
- Mermaid — 流程图

## 许可证

MIT