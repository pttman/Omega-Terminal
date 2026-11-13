import type { ITheme } from '@xterm/xterm';
const keys = ['black','red','green','yellow','blue','magenta','cyan','white','brightBlack','brightRed','brightGreen','brightYellow','brightBlue','brightMagenta','brightCyan','brightWhite'] as const;
function palette(background:string, foreground:string, cursor:string, colors:string[]):ITheme {
  return {background, foreground, cursor, selectionBackground:cursor+'44', ...Object.fromEntries(keys.map((key,i)=>[key,colors[i]]))};
}
export const terminalThemes:Record<string,{name:string;colors:ITheme}> = {
  'coral-paper':{name:'Ω · 珊瑚白',colors:palette('#fff8f4','#42332f','#c94135',['#392c30','#c73e45','#55834d','#936b28','#4879aa','#a65787','#347f80','#e7d9d3','#84706f','#ee655f','#80ad73','#d6aa66','#83a8d2','#d390b8','#75b5b0','#fff7f0'])},
  'coral-night':{name:'Ω · 珊瑚夜',colors:palette('#211a1d','#f4e2dd','#ff7569',['#392c30','#c73e45','#55834d','#936b28','#4879aa','#a65787','#347f80','#e7d9d3','#84706f','#ee655f','#80ad73','#d6aa66','#83a8d2','#d390b8','#75b5b0','#fff7f0'])},
  'coral-sand':{name:'Ω · 暖沙珊瑚',colors:palette('#f4e9da','#44372e','#bc483b',['#392c30','#c73e45','#55834d','#936b28','#4879aa','#a65787','#347f80','#e7d9d3','#84706f','#ee655f','#80ad73','#d6aa66','#83a8d2','#d390b8','#75b5b0','#fff7f0'])},
  graphite:{name:'Graphite · 石墨',colors:{background:'#14171b',foreground:'#d6d9df',cursor:'#7fdca8',selectionBackground:'#40534b',black:'#1e2228',red:'#ee868b',green:'#8ad8a4',yellow:'#e2c58b',blue:'#8cafe8',magenta:'#c8a1e4',cyan:'#8acdd1',white:'#e1e4eb',brightBlack:'#737d8c',brightRed:'#ff9ca1',brightGreen:'#b0e8bd',brightYellow:'#f1d7a6',brightBlue:'#b2c9f1',brightMagenta:'#dcc0ef',brightCyan:'#afe1e4',brightWhite:'#ffffff'}},
  dracula:{name:'Dracula · 德古拉',colors:palette('#282a36','#f8f8f2','#bd93f9',['#21222c','#ff5555','#50fa7b','#f1fa8c','#bd93f9','#ff79c6','#8be9fd','#f8f8f2','#6272a4','#ff6e6e','#69ff94','#ffffa5','#d6acff','#ff92df','#a4ffff','#ffffff'])},
  nord:{name:'Nord · 北境',colors:palette('#2e3440','#d8dee9','#88c0d0',['#3b4252','#bf616a','#a3be8c','#ebcb8b','#81a1c1','#b48ead','#88c0d0','#e5e9f0','#4c566a','#bf616a','#a3be8c','#ebcb8b','#81a1c1','#b48ead','#8fbcbb','#eceff4'])},
  tokyo:{name:'Tokyo Night · 东京夜',colors:palette('#1a1b26','#c0caf5','#7aa2f7',['#15161e','#f7768e','#9ece6a','#e0af68','#7aa2f7','#bb9af7','#7dcfff','#a9b1d6','#737aa2','#ff899d','#b9f27c','#f4c97e','#8db0ff','#c7a9ff','#a4daff','#c0caf5'])},
  catppuccin:{name:'Catppuccin · 摩卡',colors:palette('#1e1e2e','#cdd6f4','#f5e0dc',['#45475a','#f38ba8','#a6e3a1','#f9e2af','#89b4fa','#f5c2e7','#94e2d5','#bac2de','#585b70','#f38ba8','#a6e3a1','#f9e2af','#89b4fa','#f5c2e7','#94e2d5','#cdd6f4'])},
  gruvbox:{name:'Gruvbox · 暖复古',colors:palette('#282828','#ebdbb2','#fabd2f',['#282828','#cc241d','#98971a','#d79921','#458588','#b16286','#689d6a','#a89984','#928374','#fb4934','#b8bb26','#fabd2f','#83a598','#d3869b','#8ec07c','#ebdbb2'])},
  solarized:{name:'Solarized Light · 日光',colors:palette('#fdf6e3','#657b83','#586e75',['#073642','#dc322f','#859900','#b58900','#268bd2','#d33682','#2aa198','#eee8d5','#586e75','#cb4b16','#586e75','#657b83','#839496','#6c71c4','#93a1a1','#fdf6e3'])},
  paper:{name:'Paper · 清爽浅色',colors:palette('#fafafa','#383a42','#526fff',['#383a42','#b52b35','#417b22','#916500','#2459ad','#923da1','#137b82','#d4d4d4','#696c77','#c13240','#498529','#9a6b00','#3269c7','#a34eb3','#16868d','#ffffff'])},
};
const storageKey='person-terminal-color';
export function readTerminalTheme():string {
  try { const id=localStorage.getItem(storageKey)||'graphite'; return terminalThemes[id]?id:'graphite'; } catch { return 'graphite'; }
}
export function saveTerminalTheme(id:string) {
  if(!terminalThemes[id])return;
  try { localStorage.setItem(storageKey,id); } catch {}
  window.dispatchEvent(new Event('person-terminal-color'));
}
