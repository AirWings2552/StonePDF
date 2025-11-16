# StonePDF
为了使用软件请保证25552号端口未被占用。
To use this software please make sure port 25552 is not in use.

轻量的 PDF 阅读与标注工具（基于 React + PDF.js + Electron）。(This is a student project written out of personal interest, and it makes a lot of use of GenAI to help with rapid development. If you have any suggestions or ideas on how I can improve the code, code structure or add new features, please leave a comment and let me know. Thank you very much.)

## 特点功能简介
- 内链导航：支持鼠标悬停预览内部链接（如目录、引用），点击跳转后可像浏览器一样一键“后退”至原阅读位置。

## 功能简介
- PDF 渲染与文本层（基于 PDF.js）
- 划词高亮、自由文字、书签管理
- 多标签打开（每个文件独立状态）
- 右键弹出菜单 / 预览卡 / 内部链接跳转

## 快速开始（开发）
1. 安装依赖：
   ```bash
   npm install
   ```
2. 启动开发服务器（Web 前端）：
   ```bash
   npm run dev
   ```
3. 在 Electron 中运行（示例）：
   ```bash
   npx electron . "C:\path\to\file.pdf"
   ```

4. 打包
    ```bash
   npm run dist
   ```

> 详见项目根目录的 package.json 中的 scripts 和依赖声明。

## 许可证与合规
- 本项目源代码（StonePDF）默认采用 MIT 许可证

## 致谢
感谢以上开源项目的贡献者，特别是 PDF.js 与 React 社区，使本项目能够专注业务功能实现而快速落地。

# StonePDF

A lightweight PDF reader and annotation tool (based on React + PDF.js + Electron).

## ✨ Features

* **Smart Link Navigation:** Hover to preview internal links (e.g., table of contents, references). After clicking, you can navigate "Back" to the previous reading position, just like in a browser.
* **PDF Rendering:** High-fidelity rendering with a selectable text layer, powered by PDF.js.
* **Annotation Tools:** Includes text highlighting, free-text comments, and bookmark management.
* **Multi-Tab Interface:** Open multiple documents in tabs, with each file retaining its own independent state.
* **Context Menu:** Rich right-click context menu for quick actions.

## 🚀 Quick Start (Development)

1.  **Install dependencies**:
    ```bash
    npm install
    ```
2.  **Start the development server (Web Frontend)**:
    ```bash
    npm run dev
    ```
3.  **Run in Electron (Example)**:
    ```bash
    npx electron . "C:\path\to\file.pdf"
    ```
4. Pack 
    ```bash
   npm run dist
   ```

> See the scripts and dependencies in the root `package.json` for more details.

## ⚖️ License and Compliance

This project (StonePDF) source code is released under the **MIT License**.

You are free to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software.

**Copyright (c) 2025 AirWings2552**

> Note: This project includes third-party components (e.g., PDF.js) which are governed by their own respective licenses (e.g., Apache-2.0). When distributing compiled versions of this software, please ensure the inclusion of the corresponding third-party license declaration file (`THIRD_PARTY_NOTICES.txt`).

## ❤️ Acknowledgments

Thank you to the contributors of all the open-source projects listed above, especially the **PDF.js** and **React** communities, which enabled this project to be developed quickly while focusing on its core features.
