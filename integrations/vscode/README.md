# Saladict Selection Translator for VS Code

鼠标划选文字并停止后，插件会自动查询并在选区旁打开 VS Code 原生 Hover。无需快捷键，也无需再次悬停。

## 功能

- Google 翻译主通道与 HTML 错误页回退
- 英语单词音标和英英释义
- 系统语音朗读
- 收藏词条（命令面板运行 `Saladict: 打开收藏词条`）
- 新选区自动取消旧请求，避免过期结果覆盖当前选词

## 开发运行

在 VS Code 中使用 `Run Extension`，并把 Extension Development Path 指向本目录。发布包由仓库根目录的 `node integrations/scripts/package.js` 生成。
