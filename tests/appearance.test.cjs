const {test}=require('node:test');
const assert=require('node:assert/strict');

function luminance(hex){
  const channels=hex.match(/[a-f\d]{2}/gi).map(value=>parseInt(value,16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);
  return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;
}
function contrast(a,b){
  const values=[luminance(a),luminance(b)].sort((x,y)=>y-x);
  return (values[0]+.05)/(values[1]+.05);
}
test('every palette keeps small text readable on normal, hovered, pressed and selected surfaces',async()=>{
  const {appearanceTokens}=await import('../src/appearance.ts');
  const {terminalThemes}=await import('../src/terminalThemes.ts');
  for(const [id,{colors}] of Object.entries(terminalThemes)){
    const {tokens,light}=appearanceTokens(colors);
    assert.equal(light,['paper','solarized','coral-paper','coral-sand'].includes(id),id);
    for(const foreground of ['--text','--muted','--subtle','--accent']){
      for(const background of ['--bg','--panel','--sidebar','--panel-hover','--pressed','--accent-bg']){
        assert.ok(contrast(tokens[foreground],tokens[background])>=4.5,`${id}: ${foreground} on ${background}`);
      }
    }
    for(const state of ['--accent-fill','--accent-hover','--accent-pressed'])assert.ok(contrast(tokens['--on-accent'],tokens[state])>=4.5,`${id}: primary button ${state}`);
    if(light){
      for(const state of ['--panel-hover','--pressed','--accent-bg'])assert.ok(luminance(tokens[state])>.65,`${id}: ${state} stays light`);
    }
  }
});
test('prompt gold stays readable on every theme without recoloring normal text',async()=>{
  const {terminalAppearance}=await import('../src/appearance.ts');
  const {terminalThemes}=await import('../src/terminalThemes.ts');
  for(const [id,{colors}] of Object.entries(terminalThemes)){
    const theme=terminalAppearance(colors);
    const gold=theme.extendedAnsi[214-16];
    assert.ok(contrast(gold,colors.background)>=4.5,`${id}: gold on terminal background`);
    assert.notEqual(gold,colors.foreground,`${id}: prompt differs from normal text`);
    assert.equal(theme.foreground,colors.foreground);
    assert.equal(theme.yellow,colors.yellow);
  }
});
