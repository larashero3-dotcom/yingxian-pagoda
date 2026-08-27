# 第三方素材

## 代码

**Three.js r149** — MIT License，© 2010–2023 three.js authors。
`assets/three.js` 为 vendored 压缩构建，文件头保留 SPDX 声明。
https://github.com/mrdoob/three.js

**ThreeUI Country Towers** — MIT License，© 2026 Meng To。
塔身的程序化几何构件、剖切面建造动画、材质系统与地景/天气系统改自该组件。
`assets/tex.js` 中的贴图为 ThreeUI 所作，按其 `ASSET-LICENSES.md` 的声明包含在
MIT 授权范围内。
https://github.com/MengTo/threeui

配套方法论（MIT）：https://github.com/MengTo/Skills
`agent-skills/web-design/threejs-towers`、`threejs-landscape`、`threejs-weather`

## 音频

**《空山箫语 · Whisper of Empty Mountains》** — RainStreetCat，Pixabay 曲目
428655，发布 2025-10-30。Pixabay Content License：免费商用、无须署名、无须授权费。
作品页标注为 AI generated。

本项目使用的不是原档。原曲段落间起伏约十二分贝，作背景床会在旁白底下一阵阵涌上来，
因此做了以下处理：取 2.0s–236.5s 区间，两端各保留一截淡入淡出作为循环接缝（两侧
量级 −34.6 / −38.4 dB，相差不到四分贝）；`dynaudnorm f=500 g=31 m=3` 将起伏压到
七分贝；末尾三秒等功率交叉折回开头；单声道 32 kHz 56 kbps；整体 RMS −23 dBFS。

其余音效（风铎等）在页面内实时合成，无外部素材。

## 字体

页面使用系统字体栈，未内嵌字体文件。

## 数据来源

塔身几何的毫米制实测表取自陈明达实测，经 *Buildings* 2024, 14, 1472
（https://www.mdpi.com/2075-5309/14/5/1472）表 1、表 2 整理。

逐层柱头偏移取 2020 年 8 月中国文化遗产研究院测量数据。

修缮方案的官方口径出自国家文物局与中国文化遗产研究院项目组 2020-10-20；
2026 年落架建议出自全国人大山西团两会建议，见山西省人民政府网 2026-03-12
《实施应县木塔营造及技艺研究项目》（山西日报　闫书敏）。
