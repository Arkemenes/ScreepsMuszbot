const S=3000,REGEN=300,LIFE=1500,ACT=0.2,MAXTRAVEL=150;
function transfers(W,C){if(!C)return 0;const cap=50*C,rate=2*W;let st=0,n=0,l=S;while(l>0){const h=Math.min(rate,l);l-=h;st=Math.min(cap,st+h);if(cap-st<rate){n++;st=0}}return n}
function ev(W,M,C,D){const parts=W+M+C,cost=W*100+M*50+C*50,travel=D*Math.max(1,Math.ceil(W/M));
 const calls=Math.ceil(S/(2*W))+transfers(W,C);return{W,M,C,parts,cost,travel,calls,cpu:ACT*calls/REGEN,energy:cost/(LIFE-travel)}}
function best(cap,D,lam){let t=null;for(let W=5;W<=45;W++)for(let C=1;C<=8;C++)for(let M=1;M<=W;M++){
 if(W+M+C>50||W*100+M*50+C*50>cap)continue;const e=ev(W,M,C,D);if(e.travel>MAXTRAVEL)continue;e.u=-lam*e.cpu-e.energy;if(!t||e.u>t.u)t=e}return t}
const base=ev(5,1,1,25);
console.log("base cpu/src",base.cpu.toFixed(3),"E/src",base.energy.toFixed(2));
const lams=[10,20,40];
for(const D of [15,25,40]){console.log("\nD="+D);
 for(const cap of [550,800,1300,1800,2300,3000,3500,4000,5600,12900]){
  let line=String(cap).padStart(5)+" |";
  for(const lam of lams){const b=best(cap,D,lam);
   line+=b?` L${lam}: W${b.W}/M${b.M}/C${b.C} $${b.cost} dCPU${(2*(base.cpu-b.cpu)).toFixed(2)} dE${(2*(b.energy-base.energy)).toFixed(2)} |`:` L${lam}: - |`}
  console.log(line)}}
