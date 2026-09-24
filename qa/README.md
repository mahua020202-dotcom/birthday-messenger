# 回归测试

两个无头浏览器脚本，用真实 Chromium 跑完整流程并断言关键状态。

## 准备

```bash
# 1. 起静态服务器（另开一个终端）
python3 -m http.server 5180

# 2. 装 playwright-core（不必下载浏览器，可复用本机 Chrome）
npm i playwright-core

# 3. 指定本机 Chrome 可执行文件
export CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
# Playwright 缓存的浏览器也行，例如：
#   ~/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing
```

## 跑

```bash
node qa/bday-test.cjs      # 桌面 1280×800，全流程 + 22 张截图
node qa/bday-mobile.cjs    # 移动端 390×844，摇杆 / 跳跃 / 交互按钮
```

截图默认落在 `qa/shots/`，可用 `OUT_DIR` 改。日志建议重定向落盘：

```bash
node qa/bday-test.cjs > /tmp/test.log 2>&1; tail -30 /tmp/test.log
```

## 环境变量

| 变量 | 说明 | 默认 |
| --- | --- | --- |
| `CHROME_PATH` | Chromium / Chrome 可执行文件 | 交给 playwright-core 自行解析 |
| `PLAYWRIGHT_CORE` | playwright-core 的路径或包名 | `playwright-core` |
| `APP_URL` | 被测页面地址 | `http://localhost:5180/index.html?...` |
| `OUT_DIR` | 截图输出目录 | `qa/shots` |

## 说明

- 脚本里用了 `--use-angle=swiftshader` 做软件渲染，**无头环境的帧率不代表真实性能**，
  想知道性能请看 `window.__BIRTHDAY__.perf`（draw call / 三角面数）。
- 断言依赖页面暴露的调试桥 `window.__BIRTHDAY__`，见 `src/main.js` 末尾。
- 开场飞入用 `waitForFunction` 轮询状态而不是固定等待——软件渲染下动画会慢好几倍。
