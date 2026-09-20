// Deterministic educational models; no market API or transaction execution.
export function poolQuote({amount,reserveIn,reserveOut,fee=.003,slippage=.005}){
 if(![amount,reserveIn,reserveOut,fee,slippage].every(Number.isFinite)||amount<=0||amount>1e9||reserveIn<=0||reserveOut<=0||fee<0||fee>=1||slippage<0||slippage>=1)throw Error('Enter a valid amount and pool settings.');
 const effective=amount*(1-fee),out=reserveOut*effective/(reserveIn+effective),spot=reserveOut/reserveIn;
 return {out,min:out*(1-slippage),fee:amount*fee,spot,execution:out/amount,impact:effective/(reserveIn+effective)*100,newIn:reserveIn+amount,newOut:reserveOut-out};
}
export function allocation(values){const total=values.reduce((n,v)=>n+v,0);if(!values.every(v=>Number.isFinite(v)&&v>=0)||!Number.isFinite(total)||total<=0)throw Error('Values must be nonnegative with a positive total.');return values.map(v=>v/total)}
export function portfolioValue(weth,usdg,price){if(![weth,usdg,price].every(n=>Number.isFinite(n)&&n>=0))throw Error('Invalid portfolio inputs');return weth*price+usdg}
