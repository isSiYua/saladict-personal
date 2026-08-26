# 沙拉查词-个人自用版

基于开源项目 Saladict v7.22.8 修改，保留原有“划词后直接弹出翻译面板”的使用方式，主要针对 Edge、Chrome、Firefox、PDF 阅读和技术资料翻译进行了个人化改进。

## 个人版主要改进

- 统一自然语音朗读，支持单词和句子，并增强划词后的自动播放稳定性。
- 改进 PDF 换行、公式与页面杂项文本的预处理，减少断句和数学公式造成的乱码。
- 增加 DeepL 与 Gemini 免费层的句子翻译降级链；单词查询不消耗两者额度。
- 保留并修复谷歌、彩云、有道和百度等原有翻译器的兼容性。
- 简化查词记录与生词本显示，提供朗读按钮；`Ctrl+D` 和顶部红心均可再次操作以取消收藏。
- 有道词典默认显示基础释义，柯林斯与长例句通过卡片底部箭头展开。
- 增加 Firefox 兼容构建与系统语音降级方案；Firefox 没有 `chrome.tts` 时仍可朗读单词和句子。

## 安装包

- Edge：使用 Release 中的 Edge MV3 ZIP，解压后在 `edge://extensions` 开启开发人员模式并选择“加载解压缩的扩展”。
- Chrome：可使用同一个 Edge MV3 ZIP，解压后在 `chrome://extensions` 开启开发者模式并选择“加载已解压的扩展程序”。
- Firefox：使用 Release 中经 Mozilla 签名的 XPI，打开文件即可安装。名称带 `unsigned` 的 ZIP 只用于 `about:debugging#/runtime/this-firefox` 临时测试，Firefox 重启后会自动移除，不能作为日常安装包。

浏览器配置和 API 密钥不会写入源码或安装包。换到另一台电脑或给其他人使用时，需要导入自己的 `.saladict` 配置；DeepL、Gemini 等服务应填写使用者自己的密钥。

---

## 上游项目说明

# Saladict 沙拉查词

[![Version](https://badgen.net/github/tag/crimx/ext-saladict?label=version&icon=github&color=6D5DFB)](https://github.com/crimx/ext-saladict/releases)
[![Build Status](https://github.com/crimx/ext-saladict/actions/workflows/build.yml/badge.svg)](https://github.com/crimx/ext-saladict/actions/workflows/build.yml)  
[![Edge Addons version](https://badgen.net/edge-addons/v/idghocbbahafpfhjnfhpbfbmpegphmmp?icon=windows&color=0078d4&label=version)](https://microsoftedge.microsoft.com/addons/detail/idghocbbahafpfhjnfhpbfbmpegphmmp)
[![Edge Addons stars](https://badgen.net/edge-addons/stars/idghocbbahafpfhjnfhpbfbmpegphmmp?icon=windows&color=0078d4)](https://microsoftedge.microsoft.com/addons/detail/idghocbbahafpfhjnfhpbfbmpegphmmp)
[![Edge Addons users](https://badgen.net/edge-addons/users/idghocbbahafpfhjnfhpbfbmpegphmmp?icon=windows&color=0078d4)](https://microsoftedge.microsoft.com/addons/detail/idghocbbahafpfhjnfhpbfbmpegphmmp)  
[![Chrome Web Store version](https://badgen.net/chrome-web-store/v/cdonnmffkdaoajfknoeeecmchibpmkmg?icon=chrome&color=0f9d58&label=version)](https://chrome.google.com/webstore/detail/cdonnmffkdaoajfknoeeecmchibpmkmg)
[![Chrome Web Store stars](https://badgen.net/chrome-web-store/stars/cdonnmffkdaoajfknoeeecmchibpmkmg?icon=chrome&color=0f9d58)](https://chrome.google.com/webstore/detail/cdonnmffkdaoajfknoeeecmchibpmkmg)
[![Chrome Web Store users](https://badgen.net/chrome-web-store/users/cdonnmffkdaoajfknoeeecmchibpmkmg?icon=chrome&color=0f9d58)](https://chrome.google.com/webstore/detail/cdonnmffkdaoajfknoeeecmchibpmkmg)  
[![Firefox Add-ons version](https://badgen.net/amo/v/ext-saladict?icon=firefox&color=ff9500&label=version)](https://addons.mozilla.org/firefox/addon/ext-saladict/)
[![Firefox Add-ons stars](https://badgen.net/amo/stars/ext-saladict?icon=firefox&color=ff9500)](https://addons.mozilla.org/firefox/addon/ext-saladict/)
[![Firefox Add-ons users](https://badgen.net/amo/users/ext-saladict?icon=firefox&color=ff9500)](https://addons.mozilla.org/firefox/addon/ext-saladict/)

[![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg?maxAge=2592000)](http://commitizen.github.io/cz-cli/)
[![Conventional Commits](https://img.shields.io/badge/Conventional%20Commits-1.0.0-brightgreen.svg?maxAge=2592000)](https://conventionalcommits.org)
[![Standard - JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg?maxAge=2592000)](https://standardjs.com/)
[![License](https://img.shields.io/github/license/crimx/ext-saladict.svg?colorB=44cc11?maxAge=2592000)](https://github.com/crimx/ext-saladict/blob/dev/LICENSE)

Chrome/Firefox WebExtension. Feature-rich inline translator with PDF support.

[【中文说明】](./README-zh.md)Chrome/Firefox 浏览器插件，网页划词翻译。

<p align="center">
  <a href="https://github.com/crimx/ext-saladict/releases/" target="_blank"><img src="https://raw.githubusercontent.com/wiki/crimx/ext-saladict/images/notebook.gif" /></a>
</p>

## Downloads

- [Chrome Web Store](https://chrome.google.com/webstore/detail/cdonnmffkdaoajfknoeeecmchibpmkmg?hl=en)
- [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/ext-saladict/)
- [Microsoft Edge Addons](https://microsoftedge.microsoft.com/addons/detail/idghocbbahafpfhjnfhpbfbmpegphmmp)(Uploaded by @rumosky)
- See [releases](https://github.com/crimx/ext-saladict/releases) for more.

Saladict 7 is a complete rewrite with sophisticated interaction and buttery smooth experience. Built for speed, stability and customization.

## Change Log

[CHANGELOG.md](./CHANGELOG.md)

## build from source

```bash
git clone git@github.com:crimx/ext-saladict.git
cd ext-saladict
yarn install
yarn pdf
```

Add a `.env` file following the `.env.example` format(leave empty if you don't use these dictionaries).

```bash
yarn build
```

Artifacts can be found in `build/`.

## Development

See the [contributing guide](./CONTRIBUTING.md).

## How can I contribute?

See [CONTRIBUTING.md](./CONTRIBUTING.md).

Thanks to the following contributors for their work on Saladict:

<a href="https://github.com/crimx/ext-saladict/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=crimx/ext-saladict" />
</a>

## License and Brand

Saladict is a free and open-source project. The source code is licensed under the [MIT License](./LICENSE). You may use, copy, modify, publish, and distribute the source code as long as you include the license and copyright notice.

The Saladict name, the 沙拉查词 name, logos, icons, and related brand assets are not licensed under MIT. Public forks and derived products should use their own name, icon, and branding, and must not suggest that they are official Saladict releases or are authorized by the Saladict maintainer. See [TRADEMARKS.md](./TRADEMARKS.md).

DO NOT use Saladict for any illegal or criminal activity. Saladict strongly condemns this behavior and will cooperate to the fullest extent possible in holding it accountable.

## More screenshots:

<p align="center">
  <a href="https://github.com/crimx/ext-saladict/releases/" target="_blank"><img src="https://github.com/crimx/ext-saladict/wiki/images/screen-notebook.png" /></a>
</p>

<p align="center">
  <a href="https://github.com/crimx/ext-saladict/releases/" target="_blank"><img src="https://github.com/crimx/ext-saladict/wiki/images/pin.gif" /></a>
</p>
