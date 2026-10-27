# mihme

一页式个人介绍页。单文件、零依赖，双击 `personal-intro.html` 就能在浏览器里打开。

深色 / 浅色双主题，带开屏动画、滚动揭幕和一套克制的指针动效。没有任何构建步骤，也没有外部字体和图片请求——断网也能完整显示。

## 看效果

直接打开 `personal-intro.html`。

- 右上角的玻璃球开关切换明暗主题（首次按系统偏好初始化，之后记住选择）。
- 开屏动画每个标签页只播一次；想再看一次，地址后面加 `?boot=1`。
- 系统开启「减少动态效果」时，开屏和大部分动效会自动关闭。

## 改成你自己的

所有内容都在 `personal-intro.html` 一个文件里，按注释找位置：

| 要改的东西 | 位置 |
| --- | --- |
| 名字、定位、自我描述、CTA | `hero__role` / `hero__tagline` / `hero__bio` / `.btn` |
| 首屏大字 | `.hero__title` 里的三行 `.line` |
| 「现在」四条 | `#now` 区块里的 `.now__row` |
| 作品四张卡 | `#work` 区块；把 `.card__art` 的内容换成 `<img src="...">` 即可 |
| 经历时间线 | `#path` 区块的 `.path__row` |
| 那句话 | `#statementText`（`<em>` 是高亮的那半句） |
| 联系与社交 | `#contact` 的 `.contact__mail` 和 `.socials` |
| 主题色 | `:root` 里 `html[data-theme="dark"]` / `[data-theme="light"]` 两组变量 |
| 跑马灯文案 | `.band__track` 里的两段 `<span>`（两段必须一致，用于无缝循环） |

卡片的封面目前是用 CSS 画的占位图形，换成真图后记得给 `<img>` 加上 `width` / `height`，避免布局跳动。

## 工具（可选）

`tools/` 里是调试这个页面时用的截图与检查脚本，基于 Chrome DevTools Protocol：

```powershell
# 启动隔离的 headless Chrome，跑 scripts 里任何 ab-*.js，然后只关自己启动的那个进程
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\ab-run.ps1 `
  -Script tools\ab-page.js `
  -ScriptArgs '"file:///C:/path/personal-intro.html","shots/full.png","1440","900","0","1"'
```

- 用独立的临时 profile 和独立端口，不和本机正在使用的浏览器发生关系。
- 端口被占用就直接报错退出，不会去抢。
- 收尾只 `Stop-Process -Id <自己启动的 PID>`，不按进程名批量关闭。

| 脚本 | 作用 |
| --- | --- |
| `ab-page.js` | 先滚到底触发入场动画，再整页截图 |
| `ab-full.js` | 打开即整页截图 |
| `ab-scroll.js` | 滚到指定位置截图 |
| `ab-timed.js` | 按毫秒时间点连拍（抓开屏动画用） |
| `ab-check.js` | 运行时自检：横向溢出、时钟、主题、控制台异常 |

## 说明

文案里的人物是示例人设（陈奕 / YI CHEN），项目、经历、数据都是占位，替换后即可用。页脚的「示例文案」提示记得一并删掉。

设计上参考了几个公开站点的手法（固定 HUD、发丝网格、巨型字、玻璃球开关），实现全部是手写的 CSS 与原生 JS，没有引入任何库。
