/**
 * 无头浏览器回归脚本 —— 需要 playwright-core 与本机 Chrome。
 *
 *   export PLAYWRIGHT_CORE=<playwright-core 的绝对路径或裸包名>
 *   export CHROME_PATH=<Chrome for Testing / Chromium 可执行文件>
 *   export APP_URL=<被测页面地址，默认 http://localhost:5180/index.html>
 *   node qa/bday-mobile.cjs
 *
 * 先 cd birthday-castle && python3 -m http.server 5180
 */
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const EXEC = process.env.CHROME_PATH || '';
const OUT = process.env.OUT_DIR || path.join(__dirname, 'shots');
const errors = [];
(async () => {
  const browser = await chromium.launch({ executablePath: EXEC || undefined, headless: true,
    args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
    isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });

  await page.goto(process.env.APP_URL || 'http://localhost:5180/index.html?name=%E5%B0%8F%E6%98%8E', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${OUT}/m1-start.png` });
  const quality = await page.evaluate(() => window.__BIRTHDAY__.state.state.settings.quality);
  console.log('移动端默认画质:', quality);

  await page.tap('#enterBtn');
  await page.waitForFunction(() => window.__BIRTHDAY__?.state?.state?.stage === 'play', { timeout: 300000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/m2-play.png` });

  // 摇杆拖拽
  const box = await page.locator('#joystick .joy-base').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const before = await page.evaluate(() => window.__BIRTHDAY__.character.position.toArray().map(n => +n.toFixed(2)));
  await page.touchscreen.tap(cx, cy);
  await page.evaluate(async ([x, y]) => {
    const el = document.querySelector('#joystick .joy-base');
    const send = (type, cy2) => el.dispatchEvent(new PointerEvent(type, {
      pointerId: 7, pointerType: 'touch', clientX: x, clientY: cy2, bubbles: true, cancelable: true,
    }));
    const win = (type, cy2) => window.dispatchEvent(new PointerEvent(type, {
      pointerId: 7, pointerType: 'touch', clientX: x, clientY: cy2, bubbles: true, cancelable: true,
    }));
    send('pointerdown', y);
    for (let i = 0; i < 20; i++) { win('pointermove', y - i * 2); await new Promise(r => setTimeout(r, 50)); }
    await new Promise(r => setTimeout(r, 900));
    win('pointerup', y - 40);
  }, [cx, cy]);
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => window.__BIRTHDAY__.character.position.toArray().map(n => +n.toFixed(2)));
  console.log('摇杆移动:', JSON.stringify(before), '→', JSON.stringify(after));
  if (Math.hypot(after[0]-before[0], after[2]-before[2]) < 0.4) errors.push('[assert] 虚拟摇杆没有让角色移动');

  await page.screenshot({ path: `${OUT}/m3-joystick.png` });

  // 跳跃按钮
  await page.tap('#jumpBtn');
  await page.waitForTimeout(500);
  const y = await page.evaluate(() => +window.__BIRTHDAY__.character.position.y.toFixed(2));
  console.log('跳跃按钮后 y =', y);
  if (y < 0.2) errors.push('[assert] 移动端跳跃按钮无效');

  console.log('\n---- 错误 ----');
  console.log(errors.length ? errors.join('\n') : '✅ 移动端无错误');
  await browser.close();
  process.exit(0);
})();
