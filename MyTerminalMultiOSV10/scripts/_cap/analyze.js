const fs = require('fs');
const { PNG } = require('pngjs');
function load(f){ return PNG.sync.read(fs.readFileSync(f)); }
function px(p,x,y){ const i=(p.width*y+x)<<2; return [p.data[i],p.data[i+1],p.data[i+2],p.data[i+3]]; }
function name([r,g,b]){
  if (r>220&&g>170&&b<80) return 'YEL(bg)';
  if (r>150&&g<90&&b<90) return 'RED';
  if (r>110&&g<110&&b>110) return 'MAG';
  if (r<130&&g>120&&b<90) return 'GRN';
  if (r>200&&g>200&&b>200) return 'WHT';
  if (r<70&&g<70&&b<70) return 'BLK';
  return 'r'+r+'g'+g+'b'+b;
}
for (const f of ['out-webgl.png','out-canvas.png']){
  const p = load('scripts/_cap/'+f);
  console.log('=== '+f+' ('+p.width+'x'+p.height+') ===');
  // choose an x over the "main" text block (left area, ~x=70)
  const x = 70;
  let prev=null, runs=[];
  for (let y=0;y<p.height;y++){
    const n = name(px(p,x,y));
    if (n!==prev){ runs.push([y,n]); prev=n; }
  }
  console.log('col x='+x+' vertical color runs (y:name):');
  console.log(runs.map(r=>r[0]+':'+r[1]).join('  '));
}
