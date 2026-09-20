export function simulate({weth,usdg,amount,price,fee=.003,direction='sell'}){
 if(![weth,usdg,amount,price,fee].every(Number.isFinite)||weth<0||usdg<0||amount<=0||price<=0||fee<0||fee>=1)throw Error('Enter positive amounts and a reference price above zero.');
 if(direction!=='sell'&&direction!=='buy')throw Error('Choose a supported direction.');
 if(amount>(direction==='sell'?weth:usdg))throw Error(`Amount exceeds your ${direction==='sell'?'WETH':'USDG'} balance.`);
 const received=direction==='sell'?amount*price*(1-fee):amount/price*(1-fee);
 const afterWeth=direction==='sell'?weth-amount:weth+received,afterUsdg=direction==='sell'?usdg+received:usdg-amount;
 if(![received,afterWeth,afterUsdg,weth*price+usdg,afterWeth*price+afterUsdg].every(Number.isFinite))throw Error('Values are too large. Use smaller inputs.');
 return {received,afterWeth,afterUsdg,beforeValue:weth*price+usdg,afterValue:afterWeth*price+afterUsdg,feeValue:direction==='sell'?amount*price*fee:amount*fee};
}
