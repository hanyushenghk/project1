const { useEffect, useMemo, useState } = React;

const INITIAL_STATE = { hour: 0, energy: 72, supplies: 58, trust: 44 };
const MAX_HOUR = 72;

const ENDINGS = {
  survive: { title: "结局：存活", desc: "你以伤痕累累的姿态撑到救援到来，没成为传奇，却活成了幸存者。" },
  hero: { title: "结局：英雄", desc: "你守住队伍与规则，在断裂秩序里建立新信任，带着众人冲过黎明。" },
  dark: { title: "结局：黑化", desc: "你确实活了下来，但每一步都把别人当筹码。城市怕你，队伍也怕你。" },
  death: { title: "结局：死亡", desc: "体力或物资在关键时刻归零，你倒在撤离前最后一段路，没有等到天亮。" },
};

const RANDOM_EVENTS = [
  {
    title: "废弃超市",
    text: "你在侧街发现一家半塌的连锁超市，门口散落着未被拿走的罐头箱。玻璃门内很安静，但货架尽头有拖拽声。",
    choices: [
      { text: "快速搜刮高热量食物", effects: { supplies: +14, energy: -4, trust: -2 } },
      { text: "喊上附近幸存者一起分配", effects: { supplies: +8, trust: +10, energy: -2 } },
    ],
  },
  {
    title: "流浪狗拦路",
    text: "一群饥饿流浪狗堵住巷口，低吼着围成半圈。它们并不立刻扑上来，但你的前路被完全卡死，时间正在被消耗。",
    choices: [
      { text: "丢出食物引开它们", effects: { supplies: -10, trust: +4 } },
      { text: "挥棍强行驱赶", effects: { energy: -8, trust: -6 } },
    ],
  },
  {
    title: "幸存者求助",
    text: "一名受伤陌生人跪在路边求你带他走，说自己知道近道。你看见他手臂缠着渗血绷带，远处又有动静在靠近。",
    choices: [
      { text: "扶他同行", effects: { trust: +10, energy: -6, supplies: -4 } },
      { text: "留下急救包后离开", effects: { supplies: -6, trust: +3 } },
      { text: "拒绝并加速撤离", effects: { energy: -2, trust: -8 } },
    ],
  },
  {
    title: "无人机巡逻",
    text: "夜空出现低空巡逻无人机，探照灯扫过街面。你可以借灯光快速通过，也可能被错误标记为高风险目标。",
    choices: [
      { text: "挥舞反光布请求引导", effects: { trust: +8, supplies: -2 } },
      { text: "躲进阴影等待离开", effects: { energy: -5, trust: +1 } },
    ],
  },
  {
    title: "临时广播点",
    text: "路边广播车刚恢复供电，正在招募志愿者维护秩序。加入可能换来补给，也可能被卷进冲突中心。",
    choices: [
      { text: "短时协助维持秩序", effects: { trust: +12, energy: -6, supplies: +4 } },
      { text: "拿到路线图立刻离开", effects: { supplies: +6, trust: -2 } },
    ],
  },
];

const STORY = {
  start: {
    id: "start",
    hour: 0,
    mood: "night",
    title: "停电之夜",
    text: "午夜零点，城市在一瞬间熄灭，霓虹像断气般沉入黑暗。楼道里脚步杂乱、金属门被反复撞击，你握着仅剩半格电的手电，听见远处有人喊“别开门”。",
    choices: [
      { text: "封门清点物资", next: "scan_home", effects: { supplies: +8, trust: +2, energy: +2 } },
      { text: "立刻下楼找撤离车", next: "garage", effects: { energy: -8, trust: -2 } },
      { text: "敲门联系邻居组队", next: "neighbors", effects: { trust: +10, supplies: -2 } },
    ],
  },
  scan_home: {
    id: "scan_home",
    hour: 6,
    mood: "night",
    title: "家中盘点",
    text: "你把抽屉和储物箱全部翻开，找到压缩饼干、急救包和旧电台。窗外警报声断断续续，街口火光映上天花板，像一层发红的潮水慢慢推近。",
    choices: [
      { text: "蓄水并短暂休息", next: "radio_signal", effects: { energy: +8, supplies: +4 } },
      { text: "趁乱去便利店补给", next: "store_raid", effects: { supplies: +12, energy: -6 } },
      { text: "上天台侦察路线", next: "rooftop", effects: { trust: +2, energy: -4 } },
    ],
  },
  garage: {
    id: "garage",
    hour: 6,
    mood: "danger",
    title: "地下车库",
    text: "车库挤满想逃离的人群，发动机轰鸣与哭喊混在一起。出口处两辆车相撞把坡道堵死，空气里弥漫汽油味，任何一次推搡都可能把局面点燃。",
    choices: [
      { text: "跟随车队强冲出口", next: "riot_cross", effects: { energy: -10, supplies: +6, trust: -6 } },
      { text: "弃车改为步行转移", next: "radio_signal", effects: { energy: -6, trust: +1 } },
      { text: "先救受伤少年", next: "escort", effects: { trust: +12, supplies: -4, energy: -4 } },
    ],
  },
  neighbors: {
    id: "neighbors",
    hour: 6,
    mood: "night",
    title: "走廊会议",
    text: "五户人家挤在应急灯下争吵不休，有人主张死守，有人坚持立刻南撤。孩子缩在门边不敢出声，你被推到中间，所有人都在等你先给出方向。",
    choices: [
      { text: "提议结队去避难点", next: "radio_signal", effects: { trust: +10, energy: -2 } },
      { text: "带头先去抢物资", next: "store_raid", effects: { supplies: +10, trust: -8 } },
      { text: "独自离开避免纠缠", next: "rooftop", effects: { energy: -4, trust: -6 } },
    ],
  },
  rooftop: {
    id: "rooftop",
    hour: 12,
    mood: "day",
    title: "天台风向",
    text: "天色发灰，整片城区像被烟雾压低了天幕。北侧净水塔附近有长队移动，南侧军用照明弹间歇升起，你必须在有限体力里选一条能走到底的路。",
    choices: [
      { text: "向北靠近净水塔", next: "water_line", effects: { supplies: +6, energy: -8 } },
      { text: "向南赌军方通道", next: "checkpoint", effects: { trust: +4, energy: -6 } },
      { text: "回楼内等电台更新", next: "radio_signal", effects: { energy: +4, supplies: -2 } },
    ],
  },
  store_raid: {
    id: "store_raid",
    hour: 12,
    mood: "danger",
    title: "便利店冲突",
    text: "卷帘门被撬开后，人群像潮水灌进狭小货架间。塑料包装撕裂声、玻璃破碎声同时炸开，你手里抓到两袋食物，却看见有人被挤倒在碎片上。",
    choices: [
      { text: "带走全部物资离开", next: "riot_cross", effects: { supplies: +14, trust: -12, energy: -4 } },
      { text: "分出一半救伤者", next: "escort", effects: { trust: +12, supplies: -5, energy: -2 } },
      { text: "脱离现场避免失控", next: "radio_signal", effects: { energy: -3, trust: +2 } },
    ],
  },
  radio_signal: {
    id: "radio_signal",
    hour: 18,
    mood: "night",
    title: "断续电台",
    text: "旧收音机在噪音里挤出一段女声：东桥学校开放临时避难点，四十八小时后关闭。信号忽强忽弱，像有人隔着风暴在替你们争取最后窗口。",
    choices: [
      { text: "立即前往东桥", next: "bridge_night", effects: { energy: -8, trust: +4 } },
      { text: "先去诊所补药", next: "clinic", effects: { supplies: +8, energy: -4 } },
      { text: "召集更多幸存者", next: "escort", effects: { trust: +10, supplies: -6 } },
    ],
  },
  water_line: {
    id: "water_line",
    hour: 18,
    mood: "day",
    title: "净水塔长队",
    text: "净水塔前排起蜿蜒长龙，武装志愿者维持秩序。你看见几个人试图插队后被驱离，队尾不断后移，太阳把沥青烤得发软，空气里满是焦躁与汗味。",
    choices: [
      { text: "守规矩排队取水", next: "bridge_night", effects: { supplies: +10, trust: +6, energy: -5 } },
      { text: "用物资换快速通行", next: "clinic", effects: { supplies: -6, energy: +4, trust: -4 } },
      { text: "放弃排队继续赶路", next: "riot_cross", effects: { energy: -6, trust: +1 } },
    ],
  },
  riot_cross: {
    id: "riot_cross",
    hour: 24,
    mood: "danger",
    title: "封锁路口",
    text: "主干道被路障和废车封死，几名持械者盘问每个过路人。广播车在远处循环“保持秩序”，但你只听见零散枪声，任何迟疑都可能让你被迫站队。",
    choices: [
      { text: "强行突围", next: "tunnel", effects: { energy: -10, trust: -6, supplies: +4 } },
      { text: "交出部分物资换路", next: "checkpoint", effects: { supplies: -10, trust: +2, energy: -3 } },
      { text: "夜里绕行侧街", next: "bridge_night", effects: { energy: -7, trust: +1 } },
    ],
  },
  clinic: {
    id: "clinic",
    hour: 24,
    mood: "danger",
    title: "诊所铁门",
    text: "社区诊所被铁链锁住，门内药柜依稀可见。你身后传来拖拽声和急促喘息，墙上留着匆忙写下的“别久留”，时间像被谁拧紧了发条。",
    choices: [
      { text: "撬门取药快速离开", next: "tunnel", effects: { supplies: +12, trust: -6, energy: -5 } },
      { text: "放弃诊所保存体力", next: "bridge_night", effects: { energy: +6, supplies: -2 } },
      { text: "把药让给重伤者", next: "escort", effects: { trust: +10, supplies: -4, energy: -2 } },
    ],
  },
  checkpoint: {
    id: "checkpoint",
    hour: 30,
    mood: "day",
    title: "军方检查线",
    text: "临时检查线前挤着数百人，扩音器一遍遍强调“体温异常请自报”。有人试图伪装被当场带走，队伍瞬间安静，你意识到诚信和速度难以同时保住。",
    choices: [
      { text: "如实报告并配合检查", next: "school_shelter", effects: { trust: +10, energy: -3 } },
      { text: "隐瞒状态抢先进线", next: "dark_offer", effects: { trust: -10, supplies: +8, energy: -2 } },
      { text: "离开队伍另寻道路", next: "tunnel", effects: { energy: -8, supplies: -4 } },
    ],
  },
  bridge_night: {
    id: "bridge_night",
    hour: 36,
    mood: "night",
    title: "东桥夜行",
    text: "桥面停着失火后的空壳车辆，风从护栏间灌入发出尖啸。你听见桥下有人呼救，前方小路更安全却会慢上半夜，任何决定都在透支明天的余量。",
    choices: [
      { text: "停下救人并护送", next: "escort", effects: { trust: +14, energy: -8, supplies: -3 } },
      { text: "走小路保留实力", next: "school_shelter", effects: { energy: -4, trust: -4 } },
      { text: "先搜车辆补给", next: "tunnel", effects: { supplies: +12, energy: -6, trust: -2 } },
    ],
  },
  tunnel: {
    id: "tunnel",
    hour: 42,
    mood: "danger",
    title: "地铁黑市",
    text: "废弃地铁里点着冷白应急灯，黑市摊位沿轨道排开。有人用药换食物，也有人拿身份换通行证，空气里弥漫消毒水和恐惧，规则只剩交易本身。",
    choices: [
      { text: "公平交换必需品", next: "school_shelter", effects: { supplies: +8, trust: +6, energy: -2 } },
      { text: "趁乱夺取物资", next: "dark_offer", effects: { supplies: +18, trust: -16, energy: -4 } },
      { text: "不卷入是非离开", next: "school_shelter", effects: { energy: -4, trust: +2 } },
    ],
  },
  escort: {
    id: "escort",
    hour: 48,
    mood: "day",
    title: "护送队伍",
    text: "你带着几名老人与孩子穿过空旷街区，速度明显变慢。有人把最后一块电池塞给你，也有人担心拖累全队，你的一句话就会决定谁被留下。",
    choices: [
      { text: "坚持全员同行", next: "school_shelter", effects: { trust: +12, energy: -8, supplies: -4 } },
      { text: "只保留有战力者", next: "dark_offer", effects: { supplies: +8, trust: -14, energy: -2 } },
      { text: "分组并约定汇合", next: "school_shelter", effects: { trust: +4, energy: -4, supplies: -2 } },
    ],
  },
  dark_offer: {
    id: "dark_offer",
    hour: 54,
    mood: "danger",
    title: "黑市邀约",
    text: "黑市头目把无线电塞进你手里，低声说只要帮他拿下仓库，你和自己人就能优先登车。周围人都在看你，沉默像一把刀架在所有人的喉咙上。",
    choices: [
      { text: "接受交易并清场", next: "final_gate", effects: { supplies: +20, trust: -20, energy: -4 } },
      { text: "拒绝并公开阴谋", next: "final_gate", effects: { trust: +12, supplies: -6, energy: -4 } },
      { text: "表面答应暗中周旋", next: "final_gate", effects: { supplies: +10, trust: -8, energy: -3 } },
    ],
  },
  school_shelter: {
    id: "school_shelter",
    hour: 60,
    mood: "day",
    title: "学校避难点",
    text: "操场被帐篷与担架挤满，最后一批转移车将在十二小时后发车。登记台前争执不断，你被要求给出分配规则：先伤者，先战力，还是先自己人。",
    choices: [
      { text: "按伤病轻重分配", next: "final_gate", effects: { trust: +12, supplies: -8, energy: -3 } },
      { text: "按战力优先分配", next: "final_gate", effects: { supplies: +8, trust: -10, energy: -2 } },
      { text: "先保留核心物资", next: "final_gate", effects: { supplies: +12, trust: -12, energy: -1 } },
    ],
  },
  final_gate: {
    id: "final_gate",
    hour: 72,
    mood: "night",
    title: "72小时闸门",
    text: "黎明前最冷的风从闸门缝隙灌进来，车灯在雾里拉出长长光带。有人紧握你的手感谢，也有人远远避开你的目光，过去三天的选择此刻全部清算。",
    choices: [{ text: "查看结局", next: "ENDING", effects: {} }],
  },
};

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

function clamp(value) {
  return Math.max(0, Math.min(100, value));
}

function Card({ className, children }) {
  return <div className={cn("rounded-xl border border-cyan-500/30 bg-slate-950/65 p-4 backdrop-blur-sm", className)}>{children}</div>;
}

function ChoiceButton({ children, ...props }) {
  return (
    <button
      className="group relative w-full overflow-hidden rounded-lg border border-fuchsia-400/30 bg-slate-900/80 px-4 py-3 text-left text-sm transition duration-200 hover:-translate-y-0.5 hover:border-fuchsia-300/70 hover:shadow-[0_0_18px_rgba(217,70,239,0.28)] disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0 disabled:hover:shadow-none"
      {...props}
    >
      <span className="relative z-10 flex items-center justify-between">
        <span>{children}</span>
        <span className="text-cyan-300 transition group-hover:translate-x-1">→</span>
      </span>
      <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-cyan-500/0 via-cyan-300/10 to-cyan-500/0 transition group-hover:translate-x-full" />
    </button>
  );
}

function getBackground(mood) {
  if (mood === "day") {
    return "radial-gradient(circle at 15% 20%, rgba(56,189,248,0.20), transparent 45%), radial-gradient(circle at 85% 30%, rgba(168,85,247,0.16), transparent 42%), linear-gradient(180deg, #0f172a 0%, #111827 100%)";
  }
  if (mood === "danger") {
    return "radial-gradient(circle at 10% 10%, rgba(244,63,94,0.24), transparent 45%), radial-gradient(circle at 90% 25%, rgba(251,146,60,0.20), transparent 45%), linear-gradient(180deg, #0b1120 0%, #1f0b12 100%)";
  }
  return "radial-gradient(circle at 20% 15%, rgba(59,130,246,0.22), transparent 45%), radial-gradient(circle at 80% 20%, rgba(6,182,212,0.18), transparent 45%), linear-gradient(180deg, #020617 0%, #0f172a 100%)";
}

const SCENE_ICON = {
  start: "⚡",
  scan_home: "📻",
  garage: "🚗",
  neighbors: "👥",
  rooftop: "🛰️",
  store_raid: "🛒",
  radio_signal: "📡",
  water_line: "🚰",
  riot_cross: "🚧",
  clinic: "🧪",
  checkpoint: "🪖",
  bridge_night: "🌉",
  tunnel: "🚇",
  escort: "🫂",
  dark_offer: "🕶️",
  school_shelter: "🏫",
  final_gate: "🚪",
};

function getMoodPalette(mood) {
  if (mood === "day") {
    return { a: "#0ea5e9", b: "#22d3ee", c: "#a855f7" };
  }
  if (mood === "danger") {
    return { a: "#ef4444", b: "#f97316", c: "#fb7185" };
  }
  return { a: "#1d4ed8", b: "#0891b2", c: "#6366f1" };
}

function createSceneImage(node, frameSeed) {
  if (!node) return "";
  const icon = SCENE_ICON[node.id] || "🌆";
  const palette = getMoodPalette(node.mood);
  const title = String(node.title || "末日场景").slice(0, 10);
  const pulseX = 70 + ((frameSeed * 37) % 220);
  const pulseY = 90 + ((frameSeed * 29) % 150);
  const pulseR = 90 + ((frameSeed * 17) % 70);
  const scanDur = 3.2 + ((frameSeed % 5) * 0.35);
  const iconY = 120 + ((frameSeed % 3) - 1) * 6;
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="520" viewBox="0 0 1200 520">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${palette.a}" />
      <stop offset="55%" stop-color="${palette.b}" />
      <stop offset="100%" stop-color="${palette.c}" />
    </linearGradient>
    <linearGradient id="scan" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="rgba(255,255,255,0)" />
      <stop offset="50%" stop-color="rgba(255,255,255,0.35)" />
      <stop offset="100%" stop-color="rgba(255,255,255,0)" />
    </linearGradient>
  </defs>
  <rect width="1200" height="520" fill="url(#bg)" />
  <circle cx="${pulseX}" cy="${pulseY}" r="${pulseR}" fill="rgba(255,255,255,0.1)">
    <animate attributeName="r" values="${pulseR};${pulseR + 26};${pulseR}" dur="2.6s" repeatCount="indefinite" />
  </circle>
  <circle cx="980" cy="110" r="140" fill="rgba(255,255,255,0.13)" />
  <rect x="0" y="330" width="1200" height="190" fill="rgba(2,6,23,0.42)" />
  <rect x="84" y="262" width="122" height="258" fill="rgba(2,6,23,0.65)" />
  <rect x="242" y="222" width="165" height="298" fill="rgba(2,6,23,0.7)" />
  <rect x="434" y="278" width="118" height="242" fill="rgba(2,6,23,0.62)" />
  <rect x="598" y="248" width="195" height="272" fill="rgba(2,6,23,0.68)" />
  <rect x="828" y="206" width="150" height="314" fill="rgba(2,6,23,0.72)" />
  <text x="80" y="${iconY}" fill="rgba(255,255,255,0.95)" font-size="62" font-family="Arial, sans-serif">${icon}</text>
  <text x="160" y="124" fill="rgba(255,255,255,0.95)" font-size="44" font-family="Arial, sans-serif">${title}</text>
  <rect x="-300" y="0" width="300" height="520" fill="url(#scan)">
    <animate attributeName="x" from="-300" to="1300" dur="${scanDur}s" repeatCount="indefinite" />
  </rect>
</svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function applyEffects(stats, effects) {
  const next = { ...stats };
  Object.keys(effects).forEach((k) => {
    next[k] = (next[k] || 0) + effects[k];
  });
  next.energy = clamp(next.energy - 6);
  next.supplies = clamp(next.supplies - 4);
  next.trust = clamp(next.trust);
  return next;
}

function getEnding(stats, hour) {
  if (stats.energy <= 0 || stats.supplies <= 0) return "death";
  if (hour < MAX_HOUR) return null;
  if (stats.trust >= 72 && stats.energy >= 40 && stats.supplies >= 35) return "hero";
  if (stats.trust <= 20 || (stats.supplies >= 70 && stats.trust < 35)) return "dark";
  return "survive";
}

function useTypewriter(text, speed, deps) {
  const [output, setOutput] = useState("");
  useEffect(() => {
    setOutput("");
    let index = 0;
    const timer = setInterval(() => {
      index += 1;
      setOutput(text.slice(0, index));
      if (index >= text.length) clearInterval(timer);
    }, speed);
    return () => clearInterval(timer);
  }, deps);
  return output;
}

function App() {
  const [nodeId, setNodeId] = useState("start");
  const [stats, setStats] = useState(INITIAL_STATE);
  const [hour, setHour] = useState(0);
  const [logs, setLogs] = useState(["[0h] 你在黑暗中醒来，挑战开始。"]);
  const [ending, setEnding] = useState(null);
  const [shareMsg, setShareMsg] = useState("");
  const [decisionCount, setDecisionCount] = useState(0);
  const [activeEvent, setActiveEvent] = useState(null);
  const [sceneFrame, setSceneFrame] = useState(0);

  const node = STORY[nodeId];
  const isOver = Boolean(ending);
  const typedScene = useTypewriter(isOver ? ENDINGS[ending].desc : node.text, 20, [nodeId, ending]);
  const progress = Math.round((hour / MAX_HOUR) * 100);
  const bgStyle = useMemo(() => ({ backgroundImage: getBackground(node.mood) }), [node.mood]);
  const sceneImage = useMemo(() => createSceneImage(node, sceneFrame), [node.id, node.mood, node.title, sceneFrame]);
  const shareText = useMemo(() => {
    if (!ending) return "";
    return `我在末日生存了${hour}小时，结局是【${ENDINGS[ending].title.replace("结局：", "")}】，体力${stats.energy}/物资${stats.supplies}/信任${stats.trust}，你能比我强吗？`;
  }, [ending, hour, stats.energy, stats.supplies, stats.trust]);

  const onChoose = (choice) => {
    if (isOver || activeEvent) return;
    const nextHour = Math.min(MAX_HOUR, (STORY[choice.next] && STORY[choice.next].hour) || MAX_HOUR);
    const nextStats = applyEffects(stats, choice.effects || {});
    const nextEnding = getEnding(nextStats, nextHour);
    const forcedEnding = choice.next === "ENDING";
    const nextDecisionCount = decisionCount + 1;

    setStats(nextStats);
    setHour(nextHour);
    setDecisionCount(nextDecisionCount);
    setSceneFrame((v) => v + 1);
    setLogs((prev) => [`[${nextHour}h] ${choice.text}`, ...prev].slice(0, 12));

    if (forcedEnding || nextEnding) {
      setEnding(nextEnding || getEnding(nextStats, MAX_HOUR) || "survive");
      return;
    }
    setNodeId(choice.next);
    if (nextDecisionCount % 3 === 0) {
      const ev = RANDOM_EVENTS[Math.floor(Math.random() * RANDOM_EVENTS.length)];
      setActiveEvent(ev);
    }
  };

  const restart = () => {
    setNodeId("start");
    setStats(INITIAL_STATE);
    setHour(0);
    setLogs(["[0h] 你在黑暗中醒来，挑战开始。"]);
    setEnding(null);
    setShareMsg("");
    setDecisionCount(0);
    setActiveEvent(null);
    setSceneFrame(0);
  };

  const onChooseEvent = (choice) => {
    if (!activeEvent || isOver) return;
    const nextStats = applyEffects(stats, choice.effects || {});
    const nextEnding = getEnding(nextStats, hour);
    setStats(nextStats);
    setLogs((prev) => [`[随机事件] ${choice.text}`, ...prev].slice(0, 12));
    setActiveEvent(null);
    if (nextEnding) setEnding(nextEnding);
  };

  const onShare = async () => {
    if (!shareText) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shareText);
      } else {
        const input = document.createElement("textarea");
        input.value = shareText;
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
      }
      setShareMsg("已复制分享文案，快发给朋友挑战吧。");
    } catch (_) {
      setShareMsg("复制失败，请手动复制下方文案。");
    }
  };

  return (
    <div className="min-h-screen text-slate-100 transition-all duration-500" style={bgStyle}>
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        <header className="space-y-2">
          <a href="/" className="text-sm text-cyan-200/90 hover:underline">
            ← 返回首页
          </a>
          <h1 className="text-2xl font-bold tracking-wide text-cyan-100 sm:text-3xl">末日生存：你能活过72小时吗</h1>
          <p className="text-sm text-cyan-100/80">赛博废土叙事 · 单页 React 应用 · 本地硬编码故事数据</p>
        </header>

        <Card className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-cyan-200">生存时间</span>
            <span className="font-semibold">{hour} / 72 小时</span>
          </div>
          <div className="h-2 rounded-full bg-slate-800">
            <div className="h-2 rounded-full bg-gradient-to-r from-cyan-400 to-fuchsia-400 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="rounded-md border border-rose-400/35 bg-rose-400/10 px-3 py-2 text-sm">体力 ❤️：{stats.energy}</div>
            <div className="rounded-md border border-amber-400/35 bg-amber-400/10 px-3 py-2 text-sm">物资 🎒：{stats.supplies}</div>
            <div className="rounded-md border border-cyan-400/35 bg-cyan-400/10 px-3 py-2 text-sm">信任 👥：{stats.trust}</div>
          </div>
        </Card>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="space-y-3 lg:col-span-2">
            <h2 className="text-2xl font-semibold">{isOver ? ENDINGS[ending].title : node.title}</h2>
            {!isOver ? (
              <div className="relative overflow-hidden rounded-lg border border-cyan-300/30 bg-slate-900/60">
                <img
                  src={sceneImage}
                  alt={`${node.title} 动画场景图`}
                  className="h-44 w-full object-cover opacity-95 transition duration-700 hover:scale-[1.02] sm:h-56"
                />
                <div className="pointer-events-none absolute inset-0 animate-pulse bg-gradient-to-r from-cyan-400/0 via-cyan-200/10 to-fuchsia-300/0" />
              </div>
            ) : null}
            <p className="min-h-[130px] whitespace-pre-line leading-7 text-slate-100/95">{typedScene}</p>

            {!isOver ? (
              <div className="grid gap-2">
                {node.choices.map((choice, idx) => (
                  <ChoiceButton key={`${node.id}-${idx}`} onClick={() => onChoose(choice)} disabled={Boolean(activeEvent)}>
                    {choice.text}
                  </ChoiceButton>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-md border border-slate-700 bg-slate-900/70 p-3 text-sm text-slate-200">
                  <p className="font-semibold text-cyan-200">你的最终数值</p>
                  <p className="mt-1">体力 ❤️ {stats.energy} / 物资 🎒 {stats.supplies} / 信任 👥 {stats.trust}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={restart}
                    className="rounded-md border border-cyan-300/60 bg-cyan-300/10 px-4 py-2 text-sm transition hover:bg-cyan-300/20"
                  >
                    再来一次
                  </button>
                  <button
                    type="button"
                    onClick={onShare}
                    className="rounded-md border border-fuchsia-300/60 bg-fuchsia-300/10 px-4 py-2 text-sm transition hover:bg-fuchsia-300/20"
                  >
                    分享结果
                  </button>
                </div>
                <div className="rounded-md border border-fuchsia-400/30 bg-slate-900/70 p-3 text-xs text-slate-200">
                  <p className="mb-1 text-fuchsia-200">分享文案</p>
                  <p>{shareText}</p>
                  {shareMsg ? <p className="mt-2 text-cyan-200">{shareMsg}</p> : null}
                </div>
              </div>
            )}
          </Card>

          <Card>
            <h3 className="mb-2 text-lg font-semibold text-fuchsia-200">行动记录</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-200/90">
              {logs.map((item, i) => (
                <li key={`${item}-${i}`}>{item}</li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
      {activeEvent ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center sm:p-6">
          <Card className="w-full max-w-xl border-fuchsia-400/40 bg-slate-950/95">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs text-fuchsia-200">随机事件</p>
              <span className="rounded border border-fuchsia-400/40 px-2 py-0.5 text-xs text-fuchsia-100">每 3 次触发</span>
            </div>
            <h3 className="text-xl font-semibold text-fuchsia-100">{activeEvent.title}</h3>
            <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-200">{activeEvent.text}</p>
            <div className="mt-4 grid gap-2">
              {activeEvent.choices.map((choice, idx) => (
                <ChoiceButton key={`ev-${idx}`} onClick={() => onChooseEvent(choice)}>
                  {choice.text}
                </ChoiceButton>
              ))}
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
