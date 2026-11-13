const {test}=require('node:test');
const assert=require('node:assert/strict');
const layout=import('../src/layout.ts');

test('docking existing sessions supports every edge without duplicating or closing sessions',async()=>{
  const {pane,dockSession,sessionIds,measureLayout}=await layout;
  for(const edge of ['left','right','top','bottom']){
    const tabs=[{id:'a',title:'A',sessions:['a'],layout:pane('a')},{id:'b',title:'B',sessions:['b'],layout:pane('b')}];
    const result=dockSession(tabs,'b','a',edge);assert.equal(result.length,1);assert.equal(result[0].id,'a');
    assert.deepEqual(new Set(sessionIds(result[0].layout)),new Set(['a','b']));
    const positions=measureLayout(result[0].layout).panes;const a=positions.find(item=>item.id==='a').bounds,b=positions.find(item=>item.id==='b').bounds;
    assert.equal(edge==='left'?b.x<a.x:edge==='right'?b.x>a.x:edge==='top'?b.y<a.y:b.y>a.y,true,edge);
    assert.equal(tabs.length,2);assert.equal(tabs[0].layout.kind,'pane');
  }
});
test('nested splits resize, collapse, reorder and detach with consistent membership',async()=>{
  const {pane,insertPane,dockSession,resizeSplit,measureLayout,removeFromTabs,detachSession}=await layout;
  let tree=insertPane(insertPane(pane('a'),'a','b','right'),'b','c','bottom');
  tree=resizeSplit(tree,tree.id,.65);const measured=measureLayout(tree);
  assert.equal(measured.panes.find(item=>item.id==='a').bounds.width,.65);assert.equal(measured.dividers.length,2);
  let tabs=[{id:'tab',title:'Group',sessions:['a','b','c'],layout:tree}];
  tabs=dockSession(tabs,'c','a','top');assert.equal(tabs.length,1);assert.equal(tabs[0].sessions.length,3);
  tabs=detachSession(tabs,'c','new','C');assert.deepEqual(tabs.map(tab=>new Set(tab.sessions)),[new Set(['a','b']),new Set(['c'])]);
  tabs=removeFromTabs(tabs,'b');assert.deepEqual(tabs[0].layout,pane('a'));assert.equal(measureLayout(tabs[0].layout).dividers.length,0);
  tabs=removeFromTabs(tabs,'a');assert.equal(tabs.length,1);assert.equal(tabs[0].id,'new');
});
test('four-pane limit, self-drops and stale targets leave layouts unchanged',async()=>{
  const {pane,insertPane,dockSession,dockEdge}=await layout;
  let tree=pane('a');for(const id of ['b','c','d'])tree=insertPane(tree,'a',id,'right');
  const tabs=[{id:'tab',title:'Group',sessions:['a','b','c','d'],layout:tree},{id:'other',title:'E',sessions:['e'],layout:pane('e')}];
  assert.equal(dockSession(tabs,'e','a','left'),tabs);assert.equal(dockSession(tabs,'a','a','top'),tabs);assert.equal(dockSession(tabs,'a','missing','bottom'),tabs);
  assert.equal(dockSession(tabs,'a','b','bottom')[0].sessions.length,4);
  assert.deepEqual([[.05,.5],[.95,.5],[.5,.05],[.5,.95]].map(([x,y])=>dockEdge(x,y)),['left','right','top','bottom']);
});
