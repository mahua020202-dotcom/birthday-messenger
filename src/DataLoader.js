/**
 * DataLoader —— URL 参数解析 / 内置祝福语 / 多语言文案 / 主题色
 * 所有内容均可通过 URL 注入，无需后端。
 */

/* ------------------------------------------------------------------
   内置默认祝福语（未传 ?wishes= 时使用）
   ------------------------------------------------------------------ */
export const DEFAULT_WISHES = [
  { text: '愿你眼里有光，心中有海，岁岁年年都被温柔以待。', from: '爱你的家人' },
  { text: '愿你所有的努力都有回响，所有的期待都得偿所愿。', from: '挚友' },
  { text: '愿你像今天这样闪闪发光，不必借谁的光。', from: '老同学' },
  { text: '愿你被这个世界温柔相待，也温柔地对待自己。', from: '远方的人' },
  { text: '愿你永远拥有许愿的勇气，也拥有实现愿望的运气。', from: '命运' },
  { text: '愿你所到之处皆是暖阳，所遇之人皆是良善。', from: '云端的星星' },
  { text: '愿你睡前没有烦忧，醒来尽是欢喜。', from: '月亮' },
  { text: '愿你一生努力，一生被爱，想要的都拥有，得不到的都释怀。', from: '最懂你的人' },
];

export const DEFAULT_SURPRISE = '愿你的每一天都像今天一样闪闪发光。';
export const DEFAULT_NAME = '亲爱的寿星';

/* ------------------------------------------------------------------
   主题色（?theme=pink|purple|gold）
   ------------------------------------------------------------------ */
export const THEMES = {
  pink: {
    islandTop: '#FFD1DC',
    islandGrass: '#FFB6C1',
    castleWall: '#FFB6C1',
    castleTrim: '#FFF8F0',
    roof: '#E75480',
    accent: '#FF69B4',
    gold: '#FFD700',
    cloudCool: '#5F7290',
    cloudWarmA: '#F6BFD1',
    cloudWarmB: '#FFD79A',
    skyTopCool: '#1B2540',
    skyHorizonCool: '#4E6382',
    skyTopWarm: '#6B4A7C',
    skyHorizonWarm: '#F2A9BC',
  },
  purple: {
    islandTop: '#E3D5FF',
    islandGrass: '#C9B6F5',
    castleWall: '#D8C4F0',
    castleTrim: '#FFF8F0',
    roof: '#7B5EA7',
    accent: '#A98BE0',
    gold: '#FFD700',
    cloudCool: '#5A5E86',
    cloudWarmA: '#D8C8F5',
    cloudWarmB: '#FFCBE6',
    skyTopCool: '#1A1630',
    skyHorizonCool: '#4A4870',
    skyTopWarm: '#4A3A6E',
    skyHorizonWarm: '#CDA3E0',
  },
  gold: {
    islandTop: '#FFF0C9',
    islandGrass: '#FFE4A0',
    castleWall: '#FFE8C0',
    castleTrim: '#FFFFFF',
    roof: '#E09A2B',
    accent: '#FFC145',
    gold: '#FFD700',
    cloudCool: '#666E7E',
    cloudWarmA: '#FFDCA0',
    cloudWarmB: '#FFEFC4',
    skyTopCool: '#1E2436',
    skyHorizonCool: '#525C70',
    skyTopWarm: '#5C4A2E',
    skyHorizonWarm: '#F0C87C',
  },
};

/* ------------------------------------------------------------------
   多语言
   ------------------------------------------------------------------ */
export const I18N = {
  zh: {
    loading: '正在云端搭建城堡……',
    title: '生日快乐',
    dedicate: '献给 {name}',
    startDesc: '一座漂浮在云海中的粉色城堡，正在等它的寿星。',
    enter: '进入城堡',
    resume: '继续上次的生日旅程',
    startHint: '支持链接定制：?name=名字&wishes=祝福1|祝福2&surprise=留言',
    interactKey: '交互',
    jump: '跳跃',
    sprint: '冲刺',
    book: '祝福册',
    settings: '设置',
    collected: '已收集 {n} / {total}',
    locked: '？？？',
    allCollected: '全部祝福已收集 ✦',
    wishTitle: '许下你的愿望',
    wishPlaceholder: '写下一句愿望……',
    wishPrev: '你曾许下：{wish}',
    wishCancel: '取消',
    wishConfirm: '寄往星空',
    wishDone: '愿望已寄往星空',
    cardTitle: '生日快乐，{name}',
    cardClose: '谢谢你',
    pause: '暂停',
    pauseResume: '继续探索',
    pauseBook: '查看祝福册',
    pauseRestart: '重新开始',
    finaleTitle: '你的生日世界已点亮',
    finaleSub: '生日快乐，{name}。这座城堡会一直为你亮着。',
    replay: '再玩一次',
    share: '分享这一刻',
    reset: '重新开始这段旅程',
    reduceMotion: '减少动态效果',
    music: '音乐音量',
    sfx: '音效音量',
    quality: '画质',
    lang: '语言 / Language',
    qHigh: '高',
    qMid: '中',
    qLow: '低',
    quests: [
      '探索城堡，收集散落的祝福星星',
      '去许愿池许下一个愿望吧',
      '找到礼物房里的金色惊喜礼盒',
      '去大厅中央启动庆典',
      '登上顶层露台，俯瞰云海',
    ],
    questAll: '生日世界已完全点亮 ✦',
    hintBlessing: '收集祝福',
    hintWish: '许愿',
    hintGift: '打开礼盒',
    hintCelebrate: '启动庆典',
    hintCandle: '吹灭蜡烛',
    hintTerrace: '登上露台',
    hintDoor: '打开大门',
    hintTalk: '查看',
    blessGain: '祝福 +1',
    progressLabel: '生日世界点亮进度',
    restartConfirm: '确定要清空存档，重新开始这段旅程吗？',
    statsBless: '祝福',
    statsProgress: '点亮',
    statsTime: '用时',
    minute: '分钟',
  },
  en: {
    loading: 'Building your castle in the clouds…',
    title: 'Happy Birthday',
    dedicate: 'For {name}',
    startDesc: 'A pink castle floating in a sea of clouds is waiting for its birthday star.',
    enter: 'Enter the Castle',
    resume: 'Continue your birthday journey',
    startHint: 'Customize via URL: ?name=Alex&wishes=Wish1|Wish2&surprise=Note',
    interactKey: 'Interact',
    jump: 'Jump',
    sprint: 'Sprint',
    book: 'Blessings',
    settings: 'Settings',
    collected: 'Collected {n} / {total}',
    locked: '???',
    allCollected: 'All blessings collected ✦',
    wishTitle: 'Make a Wish',
    wishPlaceholder: 'Write down a wish…',
    wishPrev: 'You once wished: {wish}',
    wishCancel: 'Cancel',
    wishConfirm: 'Send to the Stars',
    wishDone: 'Your wish is on its way to the stars',
    cardTitle: 'Happy Birthday, {name}',
    cardClose: 'Thank you',
    pause: 'Paused',
    pauseResume: 'Keep Exploring',
    pauseBook: 'Open Blessings',
    pauseRestart: 'Start Over',
    finaleTitle: 'Your Birthday World Is Lit',
    finaleSub: 'Happy Birthday, {name}. This castle will keep shining for you.',
    replay: 'Play Again',
    share: 'Share This Moment',
    reset: 'Restart the journey',
    reduceMotion: 'Reduce motion',
    music: 'Music',
    sfx: 'Sound FX',
    quality: 'Quality',
    lang: 'Language / 语言',
    qHigh: 'High',
    qMid: 'Medium',
    qLow: 'Low',
    quests: [
      'Explore the castle and collect the blessing stars',
      'Make a wish at the wishing pool',
      'Find the golden surprise gift box',
      'Start the celebration at the great hall',
      'Climb to the terrace and overlook the clouds',
    ],
    questAll: 'Your birthday world is fully lit ✦',
    hintBlessing: 'Collect blessing',
    hintWish: 'Make a wish',
    hintGift: 'Open the gift',
    hintCelebrate: 'Start celebration',
    hintCandle: 'Blow the candles',
    hintTerrace: 'Reach the terrace',
    hintDoor: 'Open the gate',
    hintTalk: 'Look',
    blessGain: 'Blessing +1',
    progressLabel: 'Birthday world progress',
    restartConfirm: 'Clear the save and start over?',
    statsBless: 'Blessings',
    statsProgress: 'Lit',
    statsTime: 'Time',
    minute: 'min',
  },
};

/* ------------------------------------------------------------------
   参数解析
   ------------------------------------------------------------------ */

/** 语义化解析 query（支持 hash 与 search 两种写法） */
export function parseParams(search = window.location.search + window.location.hash) {
  const qIndex = search.indexOf('?');
  const qs = qIndex >= 0 ? search.slice(qIndex + 1) : search.replace(/^#/, '');
  const params = new URLSearchParams(qs);

  const rawName = (params.get('name') || '').trim();
  const rawWishes = params.get('wishes') || '';
  const rawSurprise = (params.get('surprise') || '').trim();
  const theme = (params.get('theme') || 'pink').toLowerCase();

  // 祝福语：用 | 分隔；每条支持 "内容@署名" 的写法
  let wishes = [];
  if (rawWishes.trim()) {
    wishes = rawWishes
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((item, i) => {
        const at = item.lastIndexOf('@');
        if (at > 0 && at < item.length - 1) {
          return { id: `w${i}`, text: item.slice(0, at).trim(), from: item.slice(at + 1).trim() };
        }
        return { id: `w${i}`, text: item, from: '' };
      });
  }

  return {
    name: rawName,
    wishes,
    surprise: rawSurprise,
    theme: THEMES[theme] ? theme : 'pink',
    isCustom: !!(rawName || wishes.length || rawSurprise),
  };
}

/** 应用主题色到 CSS 变量（让 UI 与 3D 场景同色系） */
export function applyThemeToCss(themeName) {
  const theme = THEMES[themeName] || THEMES.pink;
  const root = document.documentElement.style;
  root.setProperty('--hot', theme.accent);
  root.setProperty('--rose', theme.roof);
  root.setProperty('--gold', theme.gold);
  root.setProperty('--pink-2', theme.castleWall);
  root.setProperty('--pink-1', theme.islandTop);
}

/**
 * 合并外部祝福与默认祝福，保证总数在 6–8 条之间
 * （城堡里恰好布置了 8 处祝福星，所以上限为 8）
 * @returns {{id:string,text:string,from:string}[]}
 */
export function buildWishList(customWishes) {
  const list = [...customWishes];
  const target = Math.max(6, Math.min(8, customWishes.length || 8));

  if (list.length >= 6) {
    return list.slice(0, 8).map((w, i) => ({ id: w.id || `w${i}`, text: w.text, from: w.from || '' }));
  }

  // 不足 6 条时用默认祝福补齐（打散后取用，避免重复感）
  const pool = DEFAULT_WISHES.filter((d) => !list.some((w) => w.text === d.text));
  let i = 0;
  while (list.length < target && i < pool.length * 3) {
    const d = pool[i % pool.length];
    list.push({ id: `d${i}`, text: d.text, from: d.from });
    i++;
  }
  return list.slice(0, 8);
}
