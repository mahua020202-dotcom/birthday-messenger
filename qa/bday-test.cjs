/**
 * 无头浏览器回归脚本 —— 需要 playwright-core 与本机 Chrome。
 *
 *   export PLAYWRIGHT_CORE=<playwright-core 的绝对路径或裸包名>
 *   export CHROME_PATH=<Chrome for Testing / Chromium 可执行文件>
 *   export APP_URL=<被测页面地址，默认 http://localhost:5180/index.html>
 *   node qa/bday-test.cjs
 *
 * 先 cd birthday-castle && python3 -m http.server 5180
 */
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const EXEC = process.env.CHROME_PATH || '';
const OUT = process.env.OUT_DIR || path.join(__dirname, 'shots');

const WISHES = ['愿你天天开心@妈妈','愿你梦想成真@好友','愿你永远被爱','愿你前程似锦','愿你年年岁岁平安喜乐','愿你少年心气永存','愿你所求皆所愿','愿你被世界温柔以待'].join('|');
const URL = process.env.APP_URL || `http://localhost:5180/index.html?name=%E5%B0%8F%E6%98%8E&wishes=${encodeURIComponent(WISHES)}&surprise=${encodeURIComponent('愿你永远是那个会为自己鼓掌的人。')}`;

const errors = [];
const warnings = [];
const log = (...a) => console.log(...a);

(async () => {
  require('fs').mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: EXEC || undefined, headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });

  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[console] ${msg.text()}`);
    else if (msg.type() === 'warning' && !/GL Driver Message/.test(msg.text())) warnings.push(msg.text());
  });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  page.on('requestfailed', (r) => errors.push(`[requestfailed] ${r.url()} :: ${r.failure()?.errorText}`));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`[http ${r.status()}] ${r.url()}`); });

  await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/01-start.png` });

  await page.click('#enterBtn');
  log('→ 进入城堡，等待开场飞入完成…');
  await page.waitForFunction(() => window.__BIRTHDAY__?.state?.state?.stage === 'play', { timeout: 240000 });
  log('✓ 开场飞入完成');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/02-play.png` });

  const st = await page.evaluate(() => {
    const B = window.__BIRTHDAY__;
    return {
      charPos: B.character.position.toArray().map((n) => +n.toFixed(2)),
      enabled: B.character.enabled,
      grounded: B.character.grounded,
      items: B.interaction.items.length,
      total: B.blessing.getTotal(),
      perf: B.perf,
      merge: B.mergeStats,
      camMode: B.cameraCtl.mode,
      camPos: B.sm.camera.position.toArray().map((n) => +n.toFixed(1)),
    };
  });
  log('状态:', JSON.stringify(st));
  if (st.camMode !== 'follow') errors.push(`[assert] 开场结束后相机未切到 follow（当前 ${st.camMode}）`);

  await page.keyboard.down('KeyW');
  await page.waitForTimeout(2000);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(400);
  const mvW = await page.evaluate(() => window.__BIRTHDAY__.character.position.toArray().map((n) => +n.toFixed(2)));
  log('按 W 之后:', JSON.stringify(mvW));
  if (mvW[2] >= 3.0) errors.push(`[assert] 按 W 未朝城堡方向前进：z=${mvW[2]}`);

  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(1400);
  await page.keyboard.up('KeyD');
  await page.keyboard.up('ShiftLeft');
  log('冲刺之后:', JSON.stringify(await page.evaluate(() => ({
    pos: window.__BIRTHDAY__.character.position.toArray().map((n) => +n.toFixed(2)),
    sprinting: window.__BIRTHDAY__.character.sprinting,
  }))));

  const y0 = await page.evaluate(() => window.__BIRTHDAY__.character.position.y);
  await page.keyboard.press('Space');
  await page.waitForTimeout(700);
  const jump = await page.evaluate(() => ({ y: +window.__BIRTHDAY__.character.position.y.toFixed(2), grounded: window.__BIRTHDAY__.character.grounded }));
  log(`跳跃: y ${y0.toFixed(2)} → ${jump.y}（grounded=${jump.grounded}）`);

  await page.mouse.move(640, 400);
  await page.mouse.down();
  await page.mouse.move(880, 380, { steps: 12 });
  await page.mouse.up();
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/03-camera.png` });
  const cam = await page.evaluate(() => ({
    dist: +window.__BIRTHDAY__.cameraCtl.distance.toFixed(2),
    yaw: +window.__BIRTHDAY__.cameraCtl.yaw.toFixed(2),
    mode: window.__BIRTHDAY__.cameraCtl.mode,
    camPos: window.__BIRTHDAY__.sm.camera.position.toArray().map((n) => +n.toFixed(1)),
  }));
  log('相机:', JSON.stringify(cam));
  if (cam.mode !== 'follow') errors.push(`[assert] 开场后相机模式不是 follow：${cam.mode}`);
  if (Math.abs(cam.dist - 6.4) < 0.05) errors.push(`[assert] 滚轮缩放未生效：distance=${cam.dist}`);
  if (Math.abs(cam.yaw - 3.14) < 0.05) errors.push('[assert] 鼠标拖拽旋转未生效（yaw 未改变）');

  log('→ 传送到祝福长廊…');
  await page.evaluate(() => {
    const B = window.__BIRTHDAY__;
    const a = B.castle.anchors.blessing[1];
    B.character.setPosition(a.x + 2.2, 0, a.z);
  });
  await page.waitForTimeout(2200);
  log('交互提示:', JSON.stringify(await page.evaluate(() => ({
    current: window.__BIRTHDAY__.interaction.current?.kind || null,
    text: document.getElementById('interactText').textContent,
    visible: !document.getElementById('interactHint').classList.contains('hidden'),
  }))));
  await page.screenshot({ path: `${OUT}/04-corridor.png` });

  const before = await page.evaluate(() => window.__BIRTHDAY__.state.state.collectedBlessings.length);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(1400);
  const after = await page.evaluate(() => window.__BIRTHDAY__.state.state.collectedBlessings.length);
  log(`按 E 收集祝福: ${before} → ${after}`);
  await page.screenshot({ path: `${OUT}/05-collected.png` });

  await page.evaluate(() => {
    const B = window.__BIRTHDAY__;
    const p = B.castle.anchors.wishPool;
    B.character.setPosition(p.x, 0, p.z + 5.4);
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/06-wishpool.png` });
  log('许愿池交互目标:', await page.evaluate(() => window.__BIRTHDAY__.interaction.current?.kind || null));
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(1000);
  const wishModalOpen = await page.evaluate(() => !document.getElementById('wishModal').classList.contains('hidden'));
  log('许愿弹窗打开:', wishModalOpen);
  if (wishModalOpen) {
    await page.fill('#wishInput', '希望明年顺利保研，家人平安喜乐。');
    await page.screenshot({ path: `${OUT}/07-wish-modal.png` });
    await page.click('#wishConfirm');
    await page.waitForTimeout(4500);
    await page.screenshot({ path: `${OUT}/08-wish-meteor.png` });
  }

  await page.evaluate(() => {
    const B = window.__BIRTHDAY__;
    const g = B.castle.anchors.giftBox;
    B.character.setPosition(g.x, 0, g.z + 3.2);
  });
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `${OUT}/09-giftroom.png` });
  log('礼物房交互目标:', await page.evaluate(() => window.__BIRTHDAY__.interaction.current?.kind || null));
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(5000);
  await page.screenshot({ path: `${OUT}/10-card.png` });
  const cardOpen = await page.evaluate(() => !document.getElementById('surpriseCard').classList.contains('hidden'));
  log('贺卡打开:', cardOpen);
  if (cardOpen) await page.click('#cardClose');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/11-gift-opened.png` });

  await page.evaluate(() => {
    const B = window.__BIRTHDAY__;
    const c = B.castle.anchors.cake;
    B.character.setPosition(c.x + 5.6, 0, c.z + 1.0);
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/12-cake.png` });
  log('蛋糕交互目标:', await page.evaluate(() => window.__BIRTHDAY__.interaction.current?.kind || null));
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/13-blown.png` });

  await page.click('#bookBtn');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/14-book.png` });
  await page.click('#bookPanel .close-btn');
  await page.waitForTimeout(300);
  await page.click('#settingsBtn');
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/15-settings.png` });
  await page.click('#settingsPanel .close-btn');
  await page.waitForTimeout(400);

  // 先补满 3 颗祝福（庆典解锁条件之一）
  for (const idx of [0, 2, 3]) {
    await page.evaluate((i) => {
      const B = window.__BIRTHDAY__;
      const a = B.castle.anchors.blessing[i];
      B.character.setPosition(a.x + 1.6, 0, a.z);
    }, idx);
    await page.waitForTimeout(1300);
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(700);
  }
  log('已收集祝福数:', await page.evaluate(() => window.__BIRTHDAY__.state.state.collectedBlessings.length));

  await page.evaluate(() => {
    const B = window.__BIRTHDAY__;
    B.character.setPosition(0, 0, -5.4);
  });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/16-hall.png` });
  log('大厅:', JSON.stringify(await page.evaluate(() => ({
    target: window.__BIRTHDAY__.interaction.current?.kind || null,
    unlocked: window.__BIRTHDAY__.celebration.unlocked,
  }))));
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(2500);
  log('庆典已启动:', await page.evaluate(() => window.__BIRTHDAY__.celebration.started));
  await page.waitForTimeout(7000);
  await page.screenshot({ path: `${OUT}/17-celebration.png` });
  await page.waitForTimeout(10000);
  await page.screenshot({ path: `${OUT}/18-celebration2.png` });

  await page.evaluate(() => {
    const B = window.__BIRTHDAY__;
    const t = B.castle.terraceTrigger.position;
    B.character.setPosition(t.x, 7.05, t.z);
  });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${OUT}/19-terrace.png` });
  const prog = await page.evaluate(() => ({ progress: window.__BIRTHDAY__.state.state.progress, terrace: window.__BIRTHDAY__.state.state.terraceVisited }));
  log('露台后:', JSON.stringify(prog));

  if (prog.progress < 100) {
    await page.evaluate(() => window.__BIRTHDAY__.addProgress(100 - window.__BIRTHDAY__.state.state.progress));
  }
  await page.waitForTimeout(3200);
  await page.screenshot({ path: `${OUT}/20-finale-skytext.png` });
  await page.waitForTimeout(7000);
  await page.screenshot({ path: `${OUT}/20-finale.png` });
  await page.waitForTimeout(9000);
  await page.screenshot({ path: `${OUT}/21-finale-sky.png` });

  log('最终:', JSON.stringify(await page.evaluate(() => ({
    finale: !document.getElementById('finalePanel').classList.contains('hidden'),
    progress: window.__BIRTHDAY__.state.state.progress,
    feeders: window.__BIRTHDAY__.sky.textFeeders.length,
    perf: window.__BIRTHDAY__.perf,
  }))));

  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(3500);
  log('刷新后「继续上次旅程」可见:', await page.evaluate(() => !document.getElementById('resumeBtn').classList.contains('hidden')));
  await page.screenshot({ path: `${OUT}/22-reload.png` });

  await browser.close();

  log('\n================ 错误汇总 ================');
  if (!errors.length) log('✅ 无控制台错误 / 页面异常 / 资源加载失败');
  else [...new Set(errors)].forEach((e) => log('❌', e));
  if (warnings.length) {
    log('---- 警告 ----');
    [...new Set(warnings)].slice(0, 10).forEach((w) => log('⚠️ ', w));
  }
  process.exit(0);
})().catch((e) => { console.error('测试崩溃:', e.message); process.exit(2); });
