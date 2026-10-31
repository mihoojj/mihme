# mihme

一页式个人介绍页。一个 HTML 文件 + 四张截图，零依赖、零构建，双击 `index.html` 就能在浏览器里打开。

深色 / 浅色双主题，带开屏动画、滚动揭幕和一套克制的指针动效。没有构建步骤，也没有外部字体——断网也能完整显示（图片是同目录的本地文件）。

## 看效果

直接打开 `index.html`。

- 右上角的玻璃球开关切换明暗主题（首次按系统偏好初始化，之后记住选择）。
- 开屏动画每个标签页只播一次；想再看一次，地址后面加 `?boot=1`，想跳过就加 `?boot=0`。
- 系统开启「减少动态效果」时，开屏和大部分动效会自动关闭。

## 文件

| 路径 | 内容 |
| --- | --- |
| `index.html` | 全部结构、样式、脚本（约 60 KB） |
| `assets/` | 作品区用的四张截图，共约 330 KB |
| `tools/` | 调试用的 CDP 脚本，不上线 |

## 改成你自己的

结构和样式都在 `index.html` 里，按注释找位置：

| 要改的东西 | 位置 |
| --- | --- |
| 名字、定位、自我描述、CTA | `.hero__role` / `.hero__tagline` / `.hero__bio` / `.btn` |
| 首屏大字 | `.hero__title` 里的三行 `.line` |
| 「现在」四条 | `#now` 区块里的 `.now__row` |
| 第一件作品（这个站点） | `#work` 的第一段 `.work__entry`：`<h3>` + `.work__facts` + `work__plate` / `work__strip` |
| 第二件作品（tools/） | `#work` 的第二段 `.work__entry`：`.work__split`，右边是 `<pre class="work__code">` |
| 作品图片 | `assets/` 里的四张 JPEG，换掉同名文件即可；`<img>` 上留好 `width` / `height` 避免布局跳动 |
| 经历时间线 | `#path` 区块的 `.path__row` |
| 那句话 | `#statementText`（`<em>` 是高亮的那半句） |
| 联系与社交 | `#contact` 的 `.contact__big` / `.contact__mail` / `.contact__note` / `.socials` |
| 主题色 | `:root` 里 `html[data-theme="dark"]` / `[data-theme="light"]` 两组变量 |
| 跑马灯文案 | `.band__track` 里的两段 `<span>`（两段必须一致，用于无缝循环） |

加新作品时照抄一段 `.work__entry`：有图的用 `.work__plate` + `.work__strip`，没图的用 `.work__split`（左文右码）。相邻两件不要用同一个版式。

## 工具（可选）

`tools/` 里是调试这个页面时写的截图与检查脚本，直接连 Chrome DevTools Protocol，不装 Puppeteer：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\ab-run.ps1 `
  -Script tools\ab-page.js `
  -ScriptArgs '"file:///C:/path/index.html","shots/full.png","1440","900","0","1"'
```

- 用独立的临时 profile 和独立端口，不和本机正在使用的浏览器发生关系。
- 端口被占用就直接报错退出，不会去抢。
- 收尾只 `Stop-Process -Id <自己启动的 PID>`，不按进程名批量关闭。这条是踩过坑才改成这样的：之前按进程名批量关，把自己日常用的浏览器关掉过两次。

| 脚本 | 作用 |
| --- | --- |
| `ab-page.js` | 先滚到底触发入场动画，再整页截图 |
| `ab-full.js` | 打开即整页截图 |
| `ab-scroll.js` | 滚到指定位置截图 |
| `ab-sec.js` | 把某个选择器滚到顶部后截图（近距离看版式） |
| `ab-timed.js` | 按毫秒时间点连拍（抓开屏动画用） |
| `ab-shots.js` | 拍作品区要用的四张截图（桌面暗/亮、陈述带、手机） |
| `ab-band.js` | 逐帧采样跑马灯的位移，量它有没有跳位 |
| `ab-check.js` | 运行时自检：横向溢出、时钟、主题、控制台异常 |

## 说明

- 页面上的事实都是真的：单文件、0 依赖、0 构建、2 套主题、0 外部请求，屏数和词数是量出来的。
- 作品区里的四张图就是这个站点自己的截图，不是别的项目的图。等有第二件作品再替进来。
- 有两句话是代拟的，发之前请确认：`#work` 第二段里「结束了只关自己起的那个进程——这条是先把别人的浏览器关掉两次才学会的」，以及 `#contact` 里「我一般当天回」。
- 设计上参考了几个公开站点的手法（固定 HUD、发丝网格、巨型字、玻璃球开关），实现全部是手写的 CSS 与原生 JS，没有引入任何库。

## 审计

站点的静态与运行时检查用 [taste-skill](https://github.com/) 的 `inspect.mjs` 跑过（1440 / 768 / 390 三个宽度）。它的一套规则和这里的风格是冲突的（等宽标签、01/02/03 编号、发丝线、渐变都被它判 FAIL），那些是刻意保留的；能被它量出来、并且当真改了的是这几条：

| 项 | 改之前 | 改之后 |
| --- | --- | --- |
| 真实图片 | 0 张 | 4 张 |
| 页面长度 / 词数 | 4.3 屏 / 144 词 | 6.1 屏 / 225 词 |
| 联系区大标题 | 4 行 135px | 2 行 109px |
| 作品区 | 一整屏空态 | 两件作品，三种版式 |
