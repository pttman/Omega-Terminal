import type { ITheme } from '@xterm/xterm';

const rgb = (hex:string) => hex.match(/[a-f\d]{2}/gi)!.slice(0,3).map(channel=>parseInt(channel,16));
function mix(base:string, tint:string, amount:number):string {
  const target=rgb(tint);
  return '#'+rgb(base).map((channel,index)=>Math.round(channel+(target[index]-channel)*amount).toString(16).padStart(2,'0')).join('');
}
function luminance(color:string):number {
  return rgb(color).map(channel=>{
    const value=channel/255;
    return value<=.04045?value/12.92:((value+.055)/1.055)**2.4;
  }).reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0);
}
function contrast(first:string,second:string):number {
  const a=luminance(first),b=luminance(second);
  return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
}
// Preserve each palette's hue, moving only as far as needed for readable small text.
function readable(color:string, backgrounds:string[], light:boolean):string {
  const target=light?'#000000':'#ffffff';
  for(let step=0;step<=100;step++){
    const candidate=mix(color,target,step/100);
    if(backgrounds.every(background=>contrast(candidate,background)>=4.5))return candidate;
  }
  return target;
}

export function promptColor(colors:ITheme):string {
  const background=colors.background!;
  const light=luminance(background)>.45;
  return readable(light?'#966000':'#ffc15a',[background],light);
}

export function terminalAppearance(colors:ITheme):ITheme {
  const extendedAnsi=[...(colors.extendedAnsi??[])];
  // ANSI 214 is the prompt's gold. Palette changes also recolor existing prompts.
  extendedAnsi[214-16]=promptColor(colors);
  return {...colors,extendedAnsi};
}

export function appearanceTokens(colors:ITheme):{light:boolean;tokens:Record<string,string>} {
  const bg=colors.background!,fg=colors.foreground!,accent=colors.cursor!;
  const light=luminance(bg)>.45;
  const panel=mix(bg,light?'#ffffff':fg,light?.5:.04);
  const sidebar=mix(bg,fg,light?.035:.02);
  const hover=mix(panel,accent,.06);
  const pressed=mix(panel,accent,.1);
  const selected=mix(panel,accent,.13);
  const surfaces=[bg,panel,sidebar,hover,pressed,selected];
  const text=readable(fg,surfaces,light);
  const accentText=readable(accent,surfaces,light);
  const danger=readable(light?'#b82e3c':'#f28f97',surfaces,light);
  const warning=readable(light?'#926016':'#e2c58b',surfaces,light);
  const onAccent=contrast(accent,'#ffffff')>=contrast(accent,'#111111')?'#ffffff':'#111111';
  const fillTint=onAccent==='#ffffff'?'#000000':'#ffffff';
  return {light,tokens:{
    '--bg':bg,'--terminal':bg,'--sidebar':sidebar,'--panel':panel,'--input':bg,
    '--text':text,'--muted':readable(mix(bg,fg,.76),surfaces,light),
    '--subtle':readable(mix(bg,fg,.62),surfaces,light),
    '--accent':accentText,'--accent-fill':accent,
    '--on-accent':onAccent,'--accent-hover':mix(accent,fillTint,.05),
    '--accent-pressed':mix(accent,fillTint,.09),
    '--accent-bg':selected,'--panel-hover':hover,'--pressed':pressed,
    '--border':mix(bg,fg,light?.2:.24),'--border-soft':mix(bg,fg,light?.12:.13),
    '--border-hover':mix(panel,accent,.4),'--focus-ring':mix(panel,accent,.24),
    '--danger':danger,'--danger-bg':mix(panel,danger,.08),
    '--warning':warning,'--warning-bg':mix(panel,warning,.08),
    '--shadow':light?'0 20px 65px #30282024':'0 20px 65px #0007',
    '--backdrop':light?'#30282038':'#080b1099',
  }};
}
