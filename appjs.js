
const CONFIG = {staking:'0xa47008c59f729756bEc7d01f6FE71328A242d0c4',tribe:'0x085CF5da09842FA3BA01068CC02c156198b1b114',explorer:'https://scan.oggcoin.org'};
const STAKING_ABI=[
 'function getUserStatus(address user) view returns (uint256 stakedAmount,uint256 pendingReward,uint256 cooldownAmount,uint256 cooldownEnd,bool cooldownActive,bool canWithdraw)',
 'function getPoolStats() view returns (uint256 totalStakedOGG,uint256 totalCooldownOGG,uint256 rewardPoolBalance,uint256 currentRewardPerToken)',
 'function getUserShare(address user) view returns (uint256 sharePercent)',
 'function earned(address user) view returns (uint256)',
 'function canPropose(address user) view returns (bool)',
 'function rewardPerToken() view returns (uint256)',
 'function totalStaked() view returns (uint256)',
 'function totalCooldown() view returns (uint256)',
 'function userInfo(address) view returns (uint256 stakedAmount,uint256 rewardPerTokenPaid,uint256 pendingRewards,uint256 cooldownAmount,uint256 cooldownEnd)',
 'function MIN_STAKE_AMOUNT() view returns (uint256)',
 'function MIN_UNSTAKE_AMOUNT() view returns (uint256)',
 'function COOLDOWN_DURATION() view returns (uint256)',
 'function MIN_STAKE_TO_PROPOSE() view returns (uint256)',
 'function PRECISION() view returns (uint256)',
 'function stake() external payable','function unstake(uint256 amount) external','function withdraw() external','function claim() external'
];
const TRIBE_ABI=[
 'function getPoolSummary() view returns (uint256 poolBalance,uint256 totalProposals,uint256 activeCount)',
 'function getProposal(uint256 proposalId) view returns (uint256 id,address proposer,string title,string url,uint256 amountRequested,address receivingWallet,uint256 votingDeadline,uint256 yesVotes,uint256 noVotes,uint8 status,bool executed)',
 'function getProposalTiming(uint256 proposalId) view returns (uint256 timeLeft,uint256 executionDeadline_)',
 'function getActiveProposalIds() view returns (uint256[])',
 'function canCreateProposal(address user) view returns (bool canPropose_,uint256 stakedBalance,uint256 needed)',
 'function getVoteStatus(uint256 proposalId,address voter) view returns (bool voted,bool votedFor)',
 'function proposalCount() view returns (uint256)',
 'function hasVoted(uint256,address) view returns (bool)',
 'function votedYes(uint256,address) view returns (bool)',
 'function voteWeightCast(uint256,address) view returns (uint256)',
 'function MIN_STAKE_TO_PROPOSE() view returns (uint256)',
 'function VOTING_PERIOD() view returns (uint256)',
 'function EXECUTION_WINDOW() view returns (uint256)',
 'function MAX_PROPOSAL_FRACTION() view returns (uint256)',
 'function MAX_ACTIVE_VOTES_PER_USER() view returns (uint256)',
 'function ALERT_THRESHOLD() view returns (uint256)',
 'function createProposal(string calldata title,string calldata url,uint256 amountRequested,address receivingWallet) external returns (uint256)',
 'function vote(uint256 proposalId,bool support) external','function finalizeProposal(uint256 proposalId) external','function cleanupVotedProposals(address user) external'
];

let wallet=null, provider=null, lastTxHash='', pendingWallet=null, autoRefreshTimer=null, exportedKeyCache='', keyVisible=false, keyModalTimer=null;
function el(id){return document.getElementById(id)}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}
function humanError(e){let raw=(e&&e.reason)||(e&&e.data&&e.data.message)||(e&&e.error&&e.error.message)||(e&&e.message)||String(e);let m=String(raw);let l=m.toLowerCase();
  if(l.includes('user rejected')||l.includes('denied transaction'))return 'Transaction was rejected before Ogg could send it.';
  if(l.includes('insufficient funds'))return 'Not enough OGG for this action and gas.';
  if(l.includes('invalid address'))return 'Receiving wallet address is not valid.';
  if(l.includes('invalid private key'))return 'Private key is not valid. Check it and paste again.';
  if(l.includes('set wallet password'))return 'Set wallet password first.';
  if(l.includes('wrong password')||l.includes('invalid password'))return 'Wrong password. Ogg cannot unlock this wallet.';
  if(l.includes('network')||l.includes('failed to fetch')||l.includes('timeout')||l.includes('rpc'))return 'Ogg cannot reach RPC right now. Check internet or RPC status.';
  if(l.includes('nonce'))return 'Transaction nonce problem. Refresh wallet and try again.';
  if(l.includes('cooldown'))return 'Cooldown is not ready yet. Wait until cooldown ends.';
  if(l.includes('minimum')||l.includes('min stake'))return 'Amount is below the contract minimum.';
  if(l.includes('execution reverted'))return m.replace('execution reverted:','Contract said').slice(0,180);
  return m.slice(0,180);
}
function toast(msg,type='info',title){let t=el('toast');let icon=type==='success'?'🪨':type==='error'?'🔥':'⛏️';let head=title||(type==='success'?'Ogg say done':type==='error'?'Cave trouble':'Ogg note');let mini=type==='success'?'Transaction/tool step completed.':type==='error'?(String(head).toLowerCase().includes('wrong password')?'Cave key not correct.':'Action stopped. Nothing confirmed unless a tx hash is shown.'):'Master Tool update.';t.innerHTML=`<div class="toastInner"><div class="toastIcon">${icon}</div><div><div class="toastTitle">${escapeHtml(head)}</div><div class="toastMsg">${escapeHtml(msg)}</div><div class="toastMini">${escapeHtml(mini)}</div></div></div>`;t.className=type;clearTimeout(window.__toastTimer);window.__toastTimer=setTimeout(()=>{t.style.display='none';t.className='';t.innerHTML='';},4600);t.style.display='block';}
function ok(msg){toast(msg,'success','Ogg say done');log('✓ '+msg)} function fail(prefix,e){let m=humanError(e);toast(m,'error',prefix+' failed');log('✗ '+prefix.toUpperCase()+' ERROR: '+m)}
function log(m){let l=el('log'); if(l){l.textContent += `[${new Date().toLocaleTimeString()}] ${m}
`; l.scrollTop=999999;}}
function clearLog(){el('log').textContent='';}
function screen(id){document.querySelectorAll('.screen').forEach(x=>x.classList.remove('active'));el(id).classList.add('active');let b=el('headerWalletBtn');if(b)b.classList.toggle('hidden',id!=='screenApp');}
function goSetup(){screen('screenSetup'); if(el('unlockBox')){ if(localStorage.getItem('oggEnc')) el('unlockBox').classList.remove('hidden'); else el('unlockBox').classList.add('hidden'); }}
function startCreate(){screen('screenCreate')} function startImport(){screen('screenImport')}
function showTab(id,btn){document.querySelectorAll('.tabpage').forEach(x=>x.classList.add('hidden'));el(id).classList.remove('hidden');document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));if(btn)btn.classList.add('active')}
function showWalletHome(){let btn=[...document.querySelectorAll('.tab')].find(b=>b.textContent.trim()==='Wallet');showTab('walletTab',btn)}
class AndroidBridgeProvider extends ethers.providers.JsonRpcProvider{
  constructor(url, network){super(url, network); this._oggUrl=url;}
  send(method, params){
    if(window.AndroidRpc && typeof window.AndroidRpc.rpc==='function'){
      return new Promise((resolve,reject)=>{
        try{
          const raw=window.AndroidRpc.rpc(this._oggUrl, method, JSON.stringify(params||[]));
          const json=JSON.parse(raw);
          if(json.error){
            const msg=(typeof json.error==='string')?json.error:(json.error.message||JSON.stringify(json.error));
            reject(new Error(msg));
          }else{ resolve(json.result); }
        }catch(e){ reject(e); }
      });
    }
    return super.send(method, params);
  }
}
function getProvider(){provider=new AndroidBridgeProvider(el('rpc').value.trim(), {chainId:Number(el('chain').value), name:'oggchain'}); return provider;}
function fmt(x, dp=4){try{return Number(ethers.utils.formatEther(x)).toLocaleString(undefined,{maximumFractionDigits:dp})+' OGG'}catch{return '--'}}
function bnResult(r,name,idx){try{return (r&&r[name]!==undefined)?r[name]:((r&&r[idx]!==undefined)?r[idx]:undefined)}catch{return undefined}}
function fmtCompactOgg(x){try{let n=Number(ethers.utils.formatEther(x));if(!isFinite(n))return '--';let abs=Math.abs(n);let val=n,suf='';if(abs>=1e9){val=n/1e9;suf='B'}else if(abs>=1e6){val=n/1e6;suf='M'}else if(abs>=1e3){val=n/1e3;suf='K'}let dec=Math.abs(val)>=100?1:1;return val.toLocaleString(undefined,{maximumFractionDigits:dec})+suf+' OGG'}catch{return '--'}}
function calcAprText(totalWei){try{let total=Number(ethers.utils.formatEther(totalWei));if(!total||!isFinite(total)||total<=0)return '--';const yearlyStakingRewards=735840000;let apr=(yearlyStakingRewards/total)*100;return apr.toLocaleString(undefined,{maximumFractionDigits:2})+'%'}catch{return '--'}}
function fmtNum(x){try{return ethers.BigNumber.isBigNumber(x)?x.toString():String(x)}catch{return String(x)}}
function fmtPctRaw(x){try{return (Number(x.toString())/100).toLocaleString(undefined,{maximumFractionDigits:2})+'%'}catch{return fmtNum(x)}}
function fmtDate(ts){try{let n=Number(ts.toString()); if(!n) return '--'; return new Date(n*1000).toLocaleString()}catch{return '--'}}
function fmtDuration(sec){let s=Number(sec.toString?sec.toString():sec); if(!s||s<0)s=0; let d=Math.floor(s/86400); s%=86400; let h=Math.floor(s/3600); s%=3600; let m=Math.floor(s/60); return `${d}d ${h}h ${m}m`;}
function weiToInput(v,dp=6){try{let text=ethers.utils.formatEther(v);let [a,b='']=text.split('.');b=b.slice(0,dp).replace(/0+$/,'');return b?a+'.'+b:a}catch{return ''}}
function zeroWei(){return (window.ethers&&ethers.BigNumber)?ethers.BigNumber.from(0):null}
function safeWei(v){return v||zeroWei()}
function percentOfWei(v,pct){try{v=safeWei(v);return v?v.mul(Math.floor(pct)).div(100):zeroWei()}catch{return zeroWei()}}
function pctFromAmount(amountWei,totalWei){try{amountWei=safeWei(amountWei);totalWei=safeWei(totalWei);if(!totalWei||totalWei.isZero())return 0;let pct=amountWei.mul(10000).div(totalWei).toNumber()/100;return Math.max(0,Math.min(100,Math.round(pct)))}catch{return 0}}
function setInputWei(inputId,v){el(inputId).value=weiToInput(v)}
async function sendWeiForPercent(pct){let v=percentOfWei(currentBalanceWei,pct);if(pct>=100){try{let gp=await getProvider().getGasPrice();let gas=gp.mul(21000);v=(v&&v.gt(gas))?v.sub(gas):zeroWei()}catch{}}return v}
async function setSendPercent(pct){if(!wallet)return toast('Unlock wallet first','error','Wallet locked');el('sendSlider').value=pct;el('sendSliderLabel').textContent=pct+'%';let v=await sendWeiForPercent(pct);setInputWei('sendAmount',v);toast(pct>=100?'Max send selected. Ogg kept gas aside.':'Send amount set to '+pct+'% of wallet balance.','success','Send amount ready')}
async function setSendMax(){await setSendPercent(100)}
async function updateSendFromSlider(){let pct=Number(el('sendSlider').value||0);el('sendSliderLabel').textContent=pct+'%';if(wallet)setInputWei('sendAmount',await sendWeiForPercent(pct))}
function syncSendSliderFromAmount(){try{let v=ethers.utils.parseEther(sendAmount.value||'0');let pct=pctFromAmount(v,currentBalanceWei);el('sendSlider').value=pct;el('sendSliderLabel').textContent=pct+'%'}catch{}}
function setStakePercent(pct){if(!wallet)return toast('Unlock wallet first','error','Wallet locked');el('stakeSlider').value=pct;el('stakeSliderLabel').textContent=pct+'%';setInputWei('stakeAmount',percentOfWei(currentBalanceWei,pct));toast('Stake amount set to '+pct+'% of wallet balance.','success','Stake amount ready')}
function updateStakeFromSlider(){let pct=Number(el('stakeSlider').value||0);el('stakeSliderLabel').textContent=pct+'%';if(wallet)setInputWei('stakeAmount',percentOfWei(currentBalanceWei,pct))}
function syncStakeSliderFromAmount(){try{let v=ethers.utils.parseEther(stakeAmount.value||'0');let pct=pctFromAmount(v,currentBalanceWei);el('stakeSlider').value=pct;el('stakeSliderLabel').textContent=pct+'%'}catch{}}
function setUnstakePercent(pct){if(!wallet)return toast('Unlock wallet first','error','Wallet locked');el('unstakeSlider').value=pct;el('unstakeSliderLabel').textContent=pct+'%';setInputWei('unstakeAmount',percentOfWei(currentStakedWei,pct));toast('Unstake amount set to '+pct+'% of staked OGG.','success','Unstake amount ready')}
function updateUnstakeFromSlider(){let pct=Number(el('unstakeSlider').value||0);el('unstakeSliderLabel').textContent=pct+'%';if(wallet)setInputWei('unstakeAmount',percentOfWei(currentStakedWei,pct))}
function syncUnstakeSliderFromAmount(){try{let v=ethers.utils.parseEther(unstakeAmount.value||'0');let pct=pctFromAmount(v,currentStakedWei);el('unstakeSlider').value=pct;el('unstakeSliderLabel').textContent=pct+'%'}catch{}}
function updateAmountLabels(){try{let b=fmt(safeWei(currentBalanceWei));if(el('sendAvailable'))el('sendAvailable').textContent=b;if(el('stakeAvailable'))el('stakeAvailable').textContent=b;if(el('unstakeAvailable'))el('unstakeAvailable').textContent=fmt(safeWei(currentStakedWei));if(el('cooldownInline'))el('cooldownInline').textContent=el('cooldown')?el('cooldown').textContent:'--'}catch{}}


async function checkEthers(){if(!window.ethers){throw new Error('ethers.js failed to load. Internet/WebView CDN access issue.')}}
async function checkRpc(){try{await checkEthers();let p=getProvider();let b=await p.getBlockNumber();let n=await p.getNetwork().catch(()=>({chainId:Number(el('chain').value)}));rpcStatus.textContent=`Connected to Oggchain • ID ${n.chainId} • Block ${b}`;rpcStatus.className='pill good';if(el('blockNum'))blockNum.textContent=b;return true}catch(e){rpcStatus.textContent='RPC failed';rpcStatus.className='pill bad';log('RPC CHECK ERROR: '+humanError(e));return false}}
async function getGasOverrides(gasLimit){let p=getProvider();let gasPrice=await p.getGasPrice().catch(()=>null);let out={gasLimit}; if(gasPrice) out.gasPrice=gasPrice; out.type=0; return out;}
async function deriveKey(password,salt){let enc=new TextEncoder();let base=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:150000,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt'])}
function b64(buf){return btoa(String.fromCharCode(...new Uint8Array(buf)))} function ub64(s){return Uint8Array.from(atob(s),c=>c.charCodeAt(0))}
async function savePk(pk,password){if(!password||password.length<4)throw new Error('Password must be at least 4 characters');let salt=crypto.getRandomValues(new Uint8Array(16));let iv=crypto.getRandomValues(new Uint8Array(12));let key=await deriveKey(password,salt);let ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(pk));localStorage.oggEnc=JSON.stringify({salt:b64(salt),iv:b64(iv),ct:b64(ct)});}
async function loadPk(password){let o=JSON.parse(localStorage.oggEnc||'{}');if(!o.ct)throw new Error('No saved wallet');try{let key=await deriveKey(password,ub64(o.salt));let pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:ub64(o.iv)},key,ub64(o.ct));return new TextDecoder().decode(pt)}catch(e){throw new Error('wrong password')}}
async function enterWallet(w, savePassword=null){wallet=w.connect(getProvider());address.textContent=wallet.address;if(savePassword){await savePk(w.privateKey,savePassword);ok('Wallet encrypted and saved')}screen('screenApp');startAutoRefresh();await refreshAll();}
async function generateWallet(){try{await checkEthers();pendingWallet=ethers.Wallet.createRandom();newAddress.textContent=pendingWallet.address;newPk.value=pendingWallet.privateKey;ok('New wallet generated')}catch(e){fail('Create wallet',e)}}
function copyNewPk(){if(!newPk.value)return toast('Generate wallet first','error');copyText(newPk.value);toast('Private key copied. Save it safely before entering the cave.','success','Key copied')}
async function saveGeneratedWallet(){try{if(!pendingWallet)throw new Error('Generate wallet first');if(!savedKeyCheck.checked)throw new Error('Please confirm you saved the private key');let pass=(createPassword.value||'').trim();if(!pass)throw new Error('Set wallet password first');await enterWallet(pendingWallet,pass)}catch(e){fail('Save wallet',e)}}
async function saveImportedWallet(){try{await checkEthers();let pk=importPk.value.trim();if(!pk)throw new Error('Paste private key first');let pass=(importPassword.value||'').trim();if(!pass)throw new Error('Set wallet password first');let w=new ethers.Wallet(pk);await enterWallet(w,pass);importPk.value='';ok('Wallet imported')}catch(e){fail('Import wallet',e)}}
async function unlockWallet(){try{await checkEthers();let pk=await loadPk(unlockPassword.value);await enterWallet(new ethers.Wallet(pk),null);ok('Password correct. Wallet unlocked')}catch(e){if(String((e&&e.message)||e).toLowerCase().includes('wrong password')){toast('Ogg says wrong password. Try again.','error','Wrong password');log('✗ UNLOCK ERROR: Wrong password')}else{fail('Unlock',e)}}}
function openKeyModal(){if(!localStorage.oggEnc)return toast('No saved wallet found on this device.','error','No wallet');exportPassword.value='';exportedKeyCache='';keyVisible=false;el('keyRevealBox').classList.add('hidden');el('privateKeyMasked').textContent='••••••••••••••••••••••••••••••••';el('keyModal').classList.remove('hidden');clearTimeout(keyModalTimer);keyModalTimer=setTimeout(closeKeyModal,30000)}
function closeKeyModal(){el('keyModal').classList.add('hidden');exportPassword.value='';exportedKeyCache='';keyVisible=false;clearTimeout(keyModalTimer)}
function modalBackdropClose(e){if(e.target&&e.target.id==='keyModal')closeKeyModal()}
async function exportKey(){try{let pk=await loadPk(exportPassword.value);exportedKeyCache=pk;keyVisible=false;el('keyRevealBox').classList.remove('hidden');el('privateKeyMasked').textContent='••••••••••••••••••••••••••••••••';el('togglePkBtn').textContent='Show';ok('Password correct. Private key unlocked for 30 seconds')}catch(e){if(String((e&&e.message)||e).toLowerCase().includes('wrong password')){toast('Ogg says wrong password. Try again.','error','Wrong password');log('✗ EXPORT KEY ERROR: Wrong password')}else{fail('Export',e)}}}
function togglePrivateKeyVisible(){if(!exportedKeyCache)return;keyVisible=!keyVisible;el('privateKeyMasked').textContent=keyVisible?exportedKeyCache:'••••••••••••••••••••••••••••••••';el('togglePkBtn').textContent=keyVisible?'Hide':'Show'}
function copyExportedKey(){if(!exportedKeyCache)return toast('Unlock the key first.','error','Key locked');copyText(exportedKeyCache)}
function forgetWallet(){try{localStorage.removeItem('oggEnc');localStorage.clear();sessionStorage.clear();}catch{} wallet=null;pendingWallet=null;provider=null;pendingWallet=null;currentBalanceWei=zeroWei();currentStakedWei=zeroWei();if(autoRefreshTimer){clearInterval(autoRefreshTimer);autoRefreshTimer=null;}if(el('unlockBox'))el('unlockBox').classList.add('hidden');if(el('unlockPassword'))unlockPassword.value='';if(el('address'))address.textContent='No wallet loaded';toast('Saved wallet deleted. You can now create or import a new wallet.','success','Wallet forgotten');screen('screenSetup');}

async function refreshWallet(){if(!wallet)return;try{let p=getProvider();currentBalanceWei=await p.getBalance(wallet.address);balance.textContent=fmt(currentBalanceWei);updateAmountLabels();if(el('nonce'))nonce.textContent=await p.getTransactionCount(wallet.address);blockNum.textContent=await p.getBlockNumber();}catch(e){fail('Balance refresh',e)}}
async function refreshAll(){await checkRpc();await refreshWallet(); if(wallet){await loadStake(); await loadStakeStats(); await loadPool(); await loadTribeRules();}}
function startAutoRefresh(){if(autoRefreshTimer)clearInterval(autoRefreshTimer);autoRefreshTimer=setInterval(()=>{if(wallet)refreshAll().catch(e=>log('Auto-refresh skipped: '+humanError(e)))},30000)}

async function sendOgg(){try{if(!wallet)throw new Error('Unlock wallet first');if(!ethers.utils.isAddress(sendTo.value.trim()))throw new Error('Invalid receiving address');if(!sendAmount.value||Number(sendAmount.value)<=0)throw new Error('Enter amount');let overrides=await getGasOverrides(21000);let tx=await wallet.sendTransaction({to:sendTo.value.trim(),value:ethers.utils.parseEther(sendAmount.value),...overrides});lastTxHash=tx.hash;txHash.value=tx.hash;toast('Send transaction broadcast. Waiting for Oggchain confirmation.','success','Tx sent');log('SEND TX: '+tx.hash);await tx.wait();ok('Send confirmed on Oggchain');await refreshWallet();}catch(e){fail('Send',e)}}
function staking(){if(!wallet)throw new Error('Unlock wallet first');return new ethers.Contract(CONFIG.staking,STAKING_ABI,wallet)}
function stakingRead(){return new ethers.Contract(CONFIG.staking,STAKING_ABI,getProvider())}
function tribe(){if(!wallet)throw new Error('Unlock wallet first');return new ethers.Contract(CONFIG.tribe,TRIBE_ABI,wallet)}
function tribeRead(){return new ethers.Contract(CONFIG.tribe,TRIBE_ABI,getProvider())}
async function loadStake(){try{if(!wallet)return;let s=staking();let r=await s.getUserStatus(wallet.address);currentStakedWei=r.stakedAmount;updateAmountLabels();staked.textContent=fmt(r.stakedAmount);rewards.textContent=fmt(r.pendingReward);cooldown.textContent=fmt(r.cooldownAmount);cooldownEnd.textContent=fmtDate(r.cooldownEnd);let now=Math.floor(Date.now()/1000);cooldownLeft.textContent=Number(r.cooldownEnd)>now?fmtDuration(Number(r.cooldownEnd)-now):'0d 0h 0m';canWithdraw.textContent=r.canWithdraw?'YES':'NO';earnedDirect.textContent=fmt(await s.earned(wallet.address));userShare.textContent=fmtPctRaw(await s.getUserShare(wallet.address));if(el('canPropose'))canPropose.textContent=(await s.canPropose(wallet.address))?'YES':'NO';updateAmountLabels();log('Loaded staking dashboard.')}catch(e){fail('Staking',e)}}
async function loadStakeStats(){try{let s=stakingRead();let p=getProvider();let stats=null;try{stats=await s.getPoolStats()}catch(inner){log('getPoolStats fallback: '+(inner.message||inner));}
let totalWei=stats?bnResult(stats,'totalStakedOGG',0):null;if(!totalWei)totalWei=await s.totalStaked();
totalStaked.textContent=fmtCompactOgg(totalWei);if(el('stakingApr'))stakingApr.textContent=calcAprText(totalWei);
try{let cooldownWei=stats?bnResult(stats,'totalCooldownOGG',1):null;if(!cooldownWei)cooldownWei=await s.totalCooldown();totalCooldown.textContent=fmt(cooldownWei)}catch(inner){log('totalCooldown skipped: '+humanError(inner))}
try{let rewardPoolWei=stats?bnResult(stats,'rewardPoolBalance',2):null;if(!rewardPoolWei)rewardPoolWei=await p.getBalance(CONFIG.staking);rewardPoolBalance.textContent=fmt(rewardPoolWei)}catch(inner){log('reward pool skipped: '+humanError(inner))}
try{let rpt=stats?bnResult(stats,'currentRewardPerToken',3):null;if(!rpt)rpt=await s.rewardPerToken();rewardPerToken.textContent=fmtNum(rpt)}catch(inner){log('rewardPerToken skipped: '+humanError(inner))}
try{minStake.textContent=fmt(await s.MIN_STAKE_AMOUNT())}catch(inner){log('min stake skipped: '+humanError(inner))}
try{minUnstake.textContent=fmt(await s.MIN_UNSTAKE_AMOUNT())}catch(inner){log('min unstake skipped: '+humanError(inner))}
try{cooldownDuration.textContent=fmtDuration(await s.COOLDOWN_DURATION())}catch(inner){log('cooldown duration skipped: '+humanError(inner))}
try{minStakeToProposeStake.textContent=fmt(await s.MIN_STAKE_TO_PROPOSE())}catch(inner){log('proposal stake min skipped: '+humanError(inner))}
try{stakingNativeBalance.textContent=fmt(await p.getBalance(CONFIG.staking))}catch(inner){log('staking native balance skipped: '+humanError(inner))}
log('Loaded staking stats.')}catch(e){fail('Stake stats',e)}}
async function stakeOgg(){try{if(!stakeAmount.value||Number(stakeAmount.value)<=0)throw new Error('Enter stake amount');let s=staking();let amtWei=ethers.utils.parseEther(stakeAmount.value);let minStakeWei=await s.MIN_STAKE_AMOUNT();if(amtWei.lt(minStakeWei))throw new Error('Minimum stake is '+fmt(minStakeWei)+'. You tried '+fmt(amtWei)+'.');if(amtWei.gt(currentBalanceWei))throw new Error('Not enough OGG in wallet for this stake and gas.');let tx=await s.stake({value:amtWei,...(await getGasOverrides(500000))});lastTxHash=tx.hash;txHash.value=tx.hash;toast('Stake transaction broadcast. Waiting for cave confirmation.','success','Stake sent');log('STAKE TX: '+tx.hash);await tx.wait();ok('Stake confirmed. OGG is now staked');await loadStake();await refreshWallet();}catch(e){fail('Stake',e)}}
async function unstakeOgg(){try{if(!unstakeAmount.value||Number(unstakeAmount.value)<=0)throw new Error('Enter unstake amount');let s=staking();let amtWei=ethers.utils.parseEther(unstakeAmount.value);let minUnstakeWei=await s.MIN_UNSTAKE_AMOUNT();if(amtWei.lt(minUnstakeWei))throw new Error('Minimum unstake is '+fmt(minUnstakeWei)+'.');if(amtWei.gt(currentStakedWei))throw new Error('You only have '+fmt(currentStakedWei)+' staked.');let tx=await s.unstake(amtWei,await getGasOverrides(500000));lastTxHash=tx.hash;txHash.value=tx.hash;toast('Unstake transaction broadcast. Cooldown starts after confirmation.','success','Unstake sent');log('UNSTAKE TX: '+tx.hash);await tx.wait();ok('Unstake confirmed. Cooldown has started');await loadStake();}catch(e){fail('Unstake',e)}}
async function claimRewards(){try{let tx=await staking().claim(await getGasOverrides(500000));lastTxHash=tx.hash;txHash.value=tx.hash;toast('Claim transaction broadcast. Rewards are moving to wallet.','success','Claim sent');log('CLAIM TX: '+tx.hash);await tx.wait();ok('Rewards claimed');await loadStake();await refreshWallet();}catch(e){fail('Claim',e)}}
async function withdrawStake(){try{let tx=await staking().withdraw(await getGasOverrides(500000));lastTxHash=tx.hash;txHash.value=tx.hash;toast('Withdraw transaction broadcast. Waiting for confirmation.','success','Withdraw sent');log('WITHDRAW TX: '+tx.hash);await tx.wait();ok('Cooldown funds withdrawn');await loadStake();await refreshWallet();}catch(e){fail('Withdraw',e)}}
async function loadPool(){try{let t=tribeRead();let p=getProvider();let nativeBal=await p.getBalance(CONFIG.tribe);let code=await p.getCode(CONFIG.tribe);if(!code||code==='0x')throw new Error('No contract code at tribe pool address');let r=null;try{r=await t.getPoolSummary()}catch(inner){log('getPoolSummary fallback: '+(inner.message||inner));}poolBalance.textContent=fmt((r&&r.poolBalance)?r.poolBalance:nativeBal);totalProposals.textContent=r?r.totalProposals.toString():'--';activeCount.textContent=r?r.activeCount.toString():'--';if(wallet){try{let c=await t.canCreateProposal(wallet.address);if(el('canCreateProposal'))canCreateProposal.textContent=c.canPropose_?'YES':'NO';if(el('proposalStakedBalance'))proposalStakedBalance.textContent=fmt(c.stakedBalance);if(el('proposalNeeded'))proposalNeeded.textContent=fmt(c.needed)}catch(inner){log('canCreateProposal check skipped: '+humanError(inner));}}log('Loaded tribe pool dashboard.')}catch(e){fail('Tribe pool',e)}}
async function loadTribeRules(){try{let t=tribeRead();minStakeToProposeTribe.textContent=fmt(await t.MIN_STAKE_TO_PROPOSE());votingPeriod.textContent=fmtDuration(await t.VOTING_PERIOD());executionWindow.textContent=fmtDuration(await t.EXECUTION_WINDOW());maxProposalFraction.textContent=fmtNum(await t.MAX_PROPOSAL_FRACTION());maxActiveVotes.textContent=fmtNum(await t.MAX_ACTIVE_VOTES_PER_USER());alertThreshold.textContent=fmt(await t.ALERT_THRESHOLD());log('Loaded tribe pool rules.')}catch(e){fail('Tribe rules',e)}}
function statusName(n){return ['Active','Executed','Failed','Expired','Cancelled'][Number(n)] || String(n)}
async function renderProposal(p, detail=false){let t=tribeRead();let timing=null;try{timing=await t.getProposalTiming(p.id)}catch{}let voteInfo='';if(wallet){try{let vs=await t.getVoteStatus(p.id,wallet.address);let weight=await t.voteWeightCast(p.id,wallet.address);voteInfo=`<br>Your vote: ${vs.voted?(vs.votedFor?'YES':'NO'):'not voted'} • Weight: ${fmt(weight)}`;}catch{}}
return `<div class="proposal"><b>#${p.id} ${p.title}</b><br>URL: ${p.url||'-'}<br>Ask: ${fmt(p.amountRequested)}<br>Yes: ${fmt(p.yesVotes)} • No: ${fmt(p.noVotes)}<br>Status: ${statusName(p.status)} • Executed: ${p.executed?'yes':'no'}<br>Deadline: ${fmtDate(p.votingDeadline)}${timing?`<br>Time left: ${fmtDuration(timing.timeLeft)} • Execute window: ${fmtDate(timing.executionDeadline_)}`:''}<br>Proposer: <span class="addr">${p.proposer}</span><br>Receiver: <span class="addr">${p.receivingWallet}</span>${voteInfo}</div>`}
async function loadProposals(){try{let t=tribeRead();let ids=await t.getActiveProposalIds();proposalList.innerHTML='';if(!ids.length){proposalList.textContent='No active proposals.'}for(let id of ids){let p=await t.getProposal(id);proposalList.innerHTML += await renderProposal(p)}ok('Loaded '+ids.length+' active proposals')}catch(e){fail('Proposals',e)}}
async function loadProposalDetail(){try{let id=proposalId.value;if(!id)throw new Error('Enter proposal ID');let p=await tribeRead().getProposal(id);proposalDetail.innerHTML=await renderProposal(p,true);ok('Loaded proposal #'+id)}catch(e){fail('Proposal detail',e)}}
async function vote(support){try{let tx=await tribe().vote(proposalId.value,support,await getGasOverrides(500000));lastTxHash=tx.hash;txHash.value=tx.hash;toast('Vote transaction broadcast. Ogg is counting your tribe vote.','success','Vote sent');log('VOTE TX: '+tx.hash);await tx.wait();ok('Vote confirmed');await loadProposalDetail();}catch(e){fail('Vote',e)}}
async function finalizeProposal(){try{let tx=await tribe().finalizeProposal(proposalId.value,await getGasOverrides(800000));lastTxHash=tx.hash;txHash.value=tx.hash;toast('Finalize transaction broadcast. Proposal result is being applied.','success','Finalize sent');log('FINALIZE TX: '+tx.hash);await tx.wait();ok('Finalize confirmed');await loadPool();}catch(e){fail('Finalize',e)}}
async function cleanupVotes(){try{if(!wallet)throw new Error('Unlock wallet first');let tx=await tribe().cleanupVotedProposals(wallet.address,await getGasOverrides(500000));lastTxHash=tx.hash;txHash.value=tx.hash;toast('Cleanup transaction broadcast. Old vote history is being cleaned.','success','Cleanup sent');log('CLEANUP TX: '+tx.hash);await tx.wait();ok('Cleanup confirmed');}catch(e){fail('Cleanup',e)}}
async function createProposal(){try{if(!wallet)throw new Error('Unlock wallet first');if(!propTitle.value.trim())throw new Error('Enter proposal title');if(!propAmount.value||Number(propAmount.value)<=0)throw new Error('Enter proposal amount');if(!ethers.utils.isAddress(propWallet.value.trim()))throw new Error('Invalid receiving wallet');let t=tribe();let c=await t.canCreateProposal(wallet.address);if(!c.canPropose_)throw new Error('Not enough OGG staked to create proposal. Required '+fmt(c.needed)+', you have '+fmt(c.stakedBalance)+'.');let tx=await t.createProposal(propTitle.value,propUrl.value,ethers.utils.parseEther(propAmount.value),propWallet.value.trim(),await getGasOverrides(800000));lastTxHash=tx.hash;txHash.value=tx.hash;toast('Proposal transaction broadcast. Tribe will see it after confirmation.','success','Proposal sent');log('PROPOSAL TX: '+tx.hash);await tx.wait();ok('Proposal created');await loadPool();}catch(e){fail('Create proposal',e)}}
function copyText(t){navigator.clipboard.writeText(t).then(()=>toast('Copied','success')).catch(()=>toast('Clipboard copy failed','error'))}
function copyAddress(){if(!wallet) return toast('No wallet loaded','error'); copyText(wallet.address)}
function openUrl(u){location.href=u}
function openAddress(){if(!wallet)return toast('No wallet loaded','error');openUrl(CONFIG.explorer+'/address/'+wallet.address)}
function openTx(){let h=txHash.value.trim()||lastTxHash;if(!h)return toast('No tx hash','error');openUrl(CONFIG.explorer+'/tx/'+h)}
function openContracts(){openUrl(CONFIG.explorer+'/address/'+CONFIG.staking);setTimeout(()=>openUrl(CONFIG.explorer+'/address/'+CONFIG.tribe),600)}
setTimeout(()=>{stakingFull.textContent=CONFIG.staking;tribeFull.textContent=CONFIG.tribe; if(localStorage.getItem('oggEnc')){el('unlockBox').classList.remove('hidden');} checkRpc();},800);
