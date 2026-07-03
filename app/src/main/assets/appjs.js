
const CONFIG = {staking:'0xa47008c59f729756bEc7d01f6FE71328A242d0c4',tribe:'0x085CF5da09842FA3BA01068CC02c156198b1b114',explorer:'https://scan.oggchain.com'};
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

/* === Theme toggle (dark/light) === */
function applyTheme(t){
  document.body.classList.toggle('light', t==='light');
  var btn=document.getElementById('themeToggle');
  if(btn) btn.textContent = (t==='light') ? '☀️' : '🌙';
  try{ localStorage.setItem('oggTheme', t); }catch(e){}
}
function toggleTheme(){
  var now = document.body.classList.contains('light') ? 'dark' : 'light';
  applyTheme(now);
}
(function(){ try{ applyTheme(localStorage.getItem('oggTheme')||'dark'); }catch(e){ applyTheme('dark'); } })();

/* === Amber ember particles (canvas, drift upward, blends into background) === */
(function(){
  var canvas=document.getElementById('emberCanvas');
  if(!canvas) return;
  var ctx=canvas.getContext('2d');
  var w=0,h=0,dpr=Math.min(window.devicePixelRatio||1,2),embers=[],raf=0;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function mk(initial){
    return {
      x:Math.random()*w,
      y:initial?Math.random()*h:h+Math.random()*40,
      size:0.6+Math.random()*2.2,
      speed:0.2+Math.random()*0.8,
      phase:Math.random()*Math.PI*2,
      driftSpeed:0.0008+Math.random()*0.0018,
      alpha:0,
      target:0.12+Math.random()*0.32
    };
  }
  function resize(){
    w=window.innerWidth; h=window.innerHeight; dpr=Math.min(window.devicePixelRatio||1,2);
    canvas.width=w*dpr; canvas.height=h*dpr; canvas.style.width=w+'px'; canvas.style.height=h+'px';
    ctx.setTransform(dpr,0,0,dpr,0,0);
    var n=Math.round((w*h)/20000);
    embers=[]; for(var i=0;i<n;i++) embers.push(mk(true));
  }
  function draw(){
    ctx.clearRect(0,0,w,h);
    for(var i=0;i<embers.length;i++){
      var e=embers[i];
      e.y-=e.speed;
      e.phase+=e.driftSpeed*16;
      e.x+=Math.sin(e.phase)*0.5;
      if(e.alpha<e.target) e.alpha+=0.006;
      if(e.y<-10){ embers[i]=mk(false); continue; }
      var glow=e.size*3.5;
      var g=ctx.createRadialGradient(e.x,e.y,0,e.x,e.y,glow);
      g.addColorStop(0,'rgba(255,190,90,'+e.alpha+')');
      g.addColorStop(0.4,'rgba(255,150,40,'+(e.alpha*0.5)+')');
      g.addColorStop(1,'rgba(255,130,20,0)');
      ctx.beginPath(); ctx.fillStyle=g; ctx.arc(e.x,e.y,glow,0,Math.PI*2); ctx.fill();
    }
    raf=requestAnimationFrame(draw);
  }
  resize();
  window.addEventListener('resize',resize);
  if(reduce){ draw(); cancelAnimationFrame(raf); } else { raf=requestAnimationFrame(draw); }
})();

const NETWORKS = {
  ogg: { key:'ogg', chainId:70088, name:'Oggchain', short:'OGG',
    rpc:()=>el('rpc')?el('rpc').value.trim():'https://rpc.oggchain.com',
    explorer:'https://scan.oggchain.com',
    nativeSym:'OGG', gasReserve:0.05, chipClass:'chipOgg' },
  bsc: { key:'bsc', chainId:56, name:'BNB Smart Chain', short:'BSC',
    rpc:()=>'https://bsc-dataseed.binance.org',
    explorer:'https://bscscan.com',
    nativeSym:'BNB', gasReserve:0.0005, chipClass:'chipBsc' },
};
const SWAPCFG = {
  factory:'0xeDD3931022b29F1d2EB226E978A775eE05891866',
  router:'0x63bF06B97B6764699715A1421F65F5DBdED54008',
  wogg:'0x481c52Fc0394943d3A1190e5121F63a67C072ABb',
};
const BRIDGECFG = {
  home:'0x9C86C959dbfD0FFe997fceF3c4b307c1a9AcFc8A',
  bsc:'0xb448CE16ec19882556Bea1171cA8D02774a5E49E',
  oggBsc:'0xC44Efba271E71351CE20F96cFAc2d1d5c2302Aa3',
  pollMs:5000, pollTimeoutMs:15*60*1000, histKey:'oggBridgeHist_v1',
};
const ERC20_ABI=[
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'function transfer(address to,uint256 amount) returns (bool)',
  'function approve(address spender,uint256 amount) returns (bool)',
  'function allowance(address owner,address spender) view returns (uint256)'];
const ROUTER_ABI=[
  'function getAmountsOut(uint256 amountIn,address[] path) view returns (uint256[])',
  'function swapExactOGGForTokens(uint256 amountOutMin,address[] path,address to,uint256 deadline) payable returns (uint256[])',
  'function swapExactTokensForOGG(uint256 amountIn,uint256 amountOutMin,address[] path,address to,uint256 deadline) returns (uint256[])',
  'function swapExactTokensForTokens(uint256 amountIn,uint256 amountOutMin,address[] path,address to,uint256 deadline) returns (uint256[])'];
const FACTORY_ABI=['function getPair(address,address) view returns (address)'];
const PAIR_ABI=['function getReserves() view returns (uint112,uint112,uint32)','function token0() view returns (address)'];
const WOGG_ABI=['function deposit() payable','function withdraw(uint256)','function balanceOf(address) view returns (uint256)'];
const BRIDGE_HOME_ABI=['function bridgeOut(uint256 amount,address bscRecipient)',
  'function rateMax() view returns (uint256)','function issuedInWindow() view returns (uint256)',
  'function rateWindow() view returns (uint256)','function windowStart() view returns (uint256)',
  'event BridgedIn(bytes32 indexed messageId,address indexed to,uint256 amount,bytes32 sourceTxHash)'];
const BRIDGE_BSC_ABI=['function bridgeOut(uint256 amount,bytes32 homeRecipient)',
  'function rateMax() view returns (uint256)','function issuedInWindow() view returns (uint256)',
  'function rateWindow() view returns (uint256)','function windowStart() view returns (uint256)',
  'event BridgedIn(bytes32 indexed messageId,address indexed to,uint256 amount,bytes32 sourceTxHash)'];
const ZEROADDR='0x0000000000000000000000000000000000000000';

/* ---------------- default token registry ---------------- */
const DEFAULT_TOKENS=[
  {key:'ogg:native', net:'ogg', addr:'native', sym:'OGG',  name:'Oggchain',       dec:18, coin:'radial-gradient(circle at 32% 28%,#ffc46b,#f7931a 45%,#b8690a)'},
  {key:'ogg:'+SWAPCFG.wogg.toLowerCase(), net:'ogg', addr:SWAPCFG.wogg, sym:'wOGG', name:'Wrapped OGG', dec:18, coin:'linear-gradient(135deg,#AAB4B8,#555763)'},
  {key:'bsc:native', net:'bsc', addr:'native', sym:'BNB',  name:'BNB',            dec:18, coin:'radial-gradient(circle at 32% 28%,#ffe9a6,#F3BA2F 50%,#a87b12)'},
  {key:'bsc:'+BRIDGECFG.oggBsc.toLowerCase(), net:'bsc', addr:BRIDGECFG.oggBsc, sym:'OGG (BSC)', name:'OGG on BSC', dec:18, coin:'radial-gradient(circle at 32% 28%,#ffd98a,#e8901a 48%,#8a5510)'},
  {key:'bsc:0x55d398326f99059ff775485246999027b3197955', net:'bsc', addr:'0x55d398326f99059fF775485246999027B3197955', sym:'USDT', name:'Tether USD (BSC)', dec:18, coin:'radial-gradient(circle at 32% 28%,#7fe0c0,#26A17B 52%,#14664c)'},
];
function loadCustomTokens(){try{return JSON.parse(localStorage.getItem('oggCustomTokens_v1')||'[]')}catch{return[]}}
function saveCustomTokens(t){try{localStorage.setItem('oggCustomTokens_v1',JSON.stringify(t))}catch{}}
function allAssets(){return DEFAULT_TOKENS.concat(loadCustomTokens())}
function assetByKey(k){return allAssets().find(a=>a.key===k)}
function tokenColorFor(addr){const g=['#ff9f2e,#b8690a','#5db4ff,#1c5c96','#5fe38d,#1d7d43','#c9a4f0,#6b3fb0','#ff8b7a,#a33427','#ffd76b,#a4791a'];let h=0;for(const c of String(addr))h=(h*31+c.charCodeAt(0))>>>0;const p=g[h%g.length].split(',');return 'radial-gradient(circle at 32% 28%,'+p[0]+','+p[1]+')'}

/* ---------------- providers / signers ---------------- */
const _PROV={};
function providerFor(net){const N=NETWORKS[net];const url=N.rpc();if(!_PROV[net]||_PROV[net]._oggUrl!==url){_PROV[net]=new AndroidBridgeProvider(url,{chainId:N.chainId,name:N.key});}return _PROV[net]}
function getProvider(){provider=providerFor('ogg');return provider}
function signerFor(net){if(!wallet)throw new Error('Unlock wallet first');return wallet.connect(providerFor(net))}
async function gasOverridesFor(net,gasLimit){let p=providerFor(net);let gasPrice=await p.getGasPrice().catch(()=>null);let out={gasLimit};if(gasPrice)out.gasPrice=gasPrice;out.type=0;return out}
function explorerTx(net,hash){return NETWORKS[net].explorer+'/tx/'+hash}
const fuU=(v,d)=>ethers.utils.formatUnits(v,d), puU=(v,d)=>ethers.utils.parseUnits(v,d);
function fmtUnits(v,dec,dp=4){try{return Number(ethers.utils.formatUnits(v,dec)).toLocaleString(undefined,{maximumFractionDigits:dp})}catch{return '--'}}

/* ---------------- balances + asset list ---------------- */
let ASSETBAL={};   // key -> BigNumber
let sendAssetKey='ogg:native';
async function fetchAssetBal(a){try{const p=providerFor(a.net);if(a.addr==='native')return await p.getBalance(wallet.address);return await new ethers.Contract(a.addr,ERC20_ABI,p).balanceOf(wallet.address)}catch(e){return null}}
async function refreshAssets(){
  if(!wallet)return;
  const assets=allAssets();
  renderAssetList(true);
  for(const a of assets){
    const b=await fetchAssetBal(a);
    if(b!==null)ASSETBAL[a.key]=b;
    const cell=el('bal_'+cssKey(a.key));
    if(cell)cell.textContent=(b===null)?'—':fmtUnits(b,a.dec,a.dec>8?4:a.dec);
  }
  if(ASSETBAL['ogg:native'])currentBalanceWei=ASSETBAL['ogg:native'];
  updateAmountLabels(); renderSendAssetOptions(); updateSendAvail();
}
function cssKey(k){return k.replace(/[^a-z0-9]/gi,'_')}
function renderAssetList(loading){
  const box=el('assetList'); if(!box)return;
  box.innerHTML=allAssets().map(a=>{
    const bal=ASSETBAL[a.key]?fmtUnits(ASSETBAL[a.key],a.dec,a.dec>8?4:a.dec):(loading?'…':'—');
    const chip=`<span class="netChip ${NETWORKS[a.net].chipClass}">${NETWORKS[a.net].short}</span>`;
    const rm=a.custom?`<button class="assetRemove" onclick="event.stopPropagation();removeCustomToken('${a.key}')">✕</button>`:'';
    return `<div class="assetRow" onclick="selectSendAsset('${a.key}')">
      <span class="assetIcon" style="background:${a.coin}"></span>
      <div class="assetInfo"><div class="assetSym">${escapeHtml(a.sym)} ${chip}</div><div class="assetName">${escapeHtml(a.name)}</div></div>
      <div class="assetBal" id="bal_${cssKey(a.key)}">${bal}</div>${rm}</div>`;
  }).join('');
}
function selectSendAsset(key){sendAssetKey=key;renderSendAssetOptions();updateSendAvail();el('sendSlider').value=0;el('sendSliderLabel').textContent='0%';el('sendAmount').value='';const a=assetByKey(key);toast(a.sym+' selected. Scroll to Send to move it.','info','Asset selected')}
function renderSendAssetOptions(){
  const sel=el('sendAssetSel'); if(!sel)return;
  sel.innerHTML=allAssets().map(a=>`<option value="${a.key}" ${a.key===sendAssetKey?'selected':''}>${escapeHtml(a.sym)} — ${NETWORKS[a.net].name}</option>`).join('');
}
function onSendAssetChange(){sendAssetKey=el('sendAssetSel').value;updateSendAvail();el('sendSlider').value=0;el('sendSliderLabel').textContent='0%';el('sendAmount').value=''}
function sendAssetBalWei(){return ASSETBAL[sendAssetKey]||zeroWei()}
function updateSendAvail(){
  const a=assetByKey(sendAssetKey); if(!a)return;
  if(el('sendAvailable'))el('sendAvailable').textContent=fmtUnits(sendAssetBalWei(),a.dec)+' '+a.sym;
  if(el('sendAmount'))el('sendAmount').placeholder='Amount '+a.sym;
  if(el('sendSliderNote'))el('sendSliderNote').textContent=a.addr==='native'?'100% keeps gas aside automatically.':('Gas is paid in '+NETWORKS[a.net].nativeSym+'.');
}
async function sendWeiForPercent(pct){
  const a=assetByKey(sendAssetKey);let v=percentOfWei(sendAssetBalWei(),pct);
  if(pct>=100&&a.addr==='native'){try{const gp=await providerFor(a.net).getGasPrice();const gas=gp.mul(21000).mul(2);v=(v&&v.gt(gas))?v.sub(gas):zeroWei()}catch{}}
  return v;
}
async function setSendPercent(pct){if(!wallet)return toast('Unlock wallet first','error','Wallet locked');const a=assetByKey(sendAssetKey);el('sendSlider').value=pct;el('sendSliderLabel').textContent=pct+'%';let v=await sendWeiForPercent(pct);el('sendAmount').value=weiToInputU(v,a.dec);toast(pct>=100?'Max selected.':'Amount set to '+pct+'% of your '+a.sym+' balance.','success','Amount ready')}
async function updateSendFromSlider(){let pct=Number(el('sendSlider').value||0);el('sendSliderLabel').textContent=pct+'%';if(wallet){const a=assetByKey(sendAssetKey);el('sendAmount').value=weiToInputU(await sendWeiForPercent(pct),a.dec)}}
function syncSendSliderFromAmount(){try{const a=assetByKey(sendAssetKey);let v=puU(el('sendAmount').value||'0',a.dec);let pct=pctFromAmount(v,sendAssetBalWei());el('sendSlider').value=pct;el('sendSliderLabel').textContent=pct+'%'}catch{}}
function weiToInputU(v,dec,dp=6){try{let t=ethers.utils.formatUnits(v,dec);let[x,y='']=t.split('.');y=y.slice(0,dp).replace(/0+$/,'');return y?x+'.'+y:x}catch{return ''}}

async function sendOgg(){ /* now asset-aware; name kept for the button hook */
  try{
    if(!wallet)throw new Error('Unlock wallet first');
    const a=assetByKey(sendAssetKey); if(!a)throw new Error('Select an asset');
    const to=el('sendTo').value.trim();
    if(!ethers.utils.isAddress(to))throw new Error('Invalid receiving address');
    if(!el('sendAmount').value||Number(el('sendAmount').value)<=0)throw new Error('Enter amount');
    const amt=puU(el('sendAmount').value,a.dec);
    if(amt.gt(sendAssetBalWei()))throw new Error('Not enough '+a.sym+' for this send.');
    const signer=signerFor(a.net);
    let tx;
    if(a.addr==='native'){
      const ov=await gasOverridesFor(a.net,21000);
      tx=await signer.sendTransaction({to,value:amt,...ov});
    }else{
      // sending a token: gas is paid in the chain's native coin
      const nb=await providerFor(a.net).getBalance(wallet.address).catch(()=>null);
      if(nb&&nb.isZero())throw new Error('You need '+NETWORKS[a.net].nativeSym+' on '+NETWORKS[a.net].name+' to pay gas.');
      const c=new ethers.Contract(a.addr,ERC20_ABI,signer);
      let gl=100000; try{gl=(await c.estimateGas.transfer(to,amt)).mul(13).div(10).toNumber()}catch{}
      const ov=await gasOverridesFor(a.net,gl);
      tx=await c.transfer(to,amt,ov);
    }
    lastTxHash=tx.hash; if(el('txHash'))el('txHash').value=tx.hash;
    toast('Send broadcast on '+NETWORKS[a.net].name+'. Waiting for confirmation.','success','Tx sent');
    log('SEND '+a.sym+' TX ('+a.net+'): '+tx.hash);
    await tx.wait();
    ok('Send confirmed: '+el('sendAmount').value+' '+a.sym);
    await refreshAssets(); await refreshWallet();
  }catch(e){fail('Send',e)}
}

/* ---------------- add / remove custom tokens ---------------- */
let pendingTokenInfo=null;
function openTokenModal(){pendingTokenInfo=null;el('tokAddr').value='';el('tokInfo').textContent='';el('tokAddBtn').disabled=true;el('tokenModal').classList.remove('hidden')}
function closeTokenModal(){el('tokenModal').classList.add('hidden')}
async function checkToken(){
  try{
    pendingTokenInfo=null;el('tokAddBtn').disabled=true;
    const net=el('tokNet').value, addr=el('tokAddr').value.trim();
    if(!ethers.utils.isAddress(addr))throw new Error('Invalid token contract address');
    const key=net+':'+addr.toLowerCase();
    if(assetByKey(key))throw new Error('That token is already in your list.');
    el('tokInfo').textContent='Checking token on '+NETWORKS[net].name+'…';
    const p=providerFor(net);
    const code=await p.getCode(addr);
    if(!code||code==='0x')throw new Error('No contract found at that address on '+NETWORKS[net].name+'.');
    const c=new ethers.Contract(addr,ERC20_ABI,p);
    const [sym,name,dec]=await Promise.all([c.symbol(),c.name(),c.decimals()]);
    pendingTokenInfo={key,net,addr,sym,name,dec:Number(dec),coin:tokenColorFor(addr),custom:true};
    el('tokInfo').textContent='✔ '+name+' ('+sym+') • '+dec+' decimals • '+NETWORKS[net].name;
    el('tokAddBtn').disabled=false;
  }catch(e){el('tokInfo').textContent='✕ '+humanError(e)}
}
function addCheckedToken(){
  if(!pendingTokenInfo)return;
  const t=loadCustomTokens(); t.push(pendingTokenInfo); saveCustomTokens(t);
  ok('Added '+pendingTokenInfo.sym+' on '+NETWORKS[pendingTokenInfo.net].name);
  closeTokenModal(); refreshAssets();
}
function removeCustomToken(key){
  const a=assetByKey(key); if(!a||!a.custom)return;
  saveCustomTokens(loadCustomTokens().filter(t=>t.key!==key));
  delete ASSETBAL[key];
  if(sendAssetKey===key)sendAssetKey='ogg:native';
  toast(a.sym+' removed from your list. Tokens stay safe on-chain.','success','Token removed');
  refreshAssets();
}

/* ---------------- confirm modal (auto-signing safety) ---------------- */
let confirmAction=null;
function openConfirm(title,rowsHtml,btnLabel,fn){el('cfTitle').textContent=title;el('cfBody').innerHTML=rowsHtml;el('cfBtn').textContent=btnLabel;confirmAction=fn;el('confirmModal').classList.remove('hidden')}
function closeConfirm(){el('confirmModal').classList.add('hidden');confirmAction=null}
function runConfirm(){const f=confirmAction;closeConfirm();if(f)f()}
function cfRow(l,v){return `<div class="cfRow"><span class="label">${l}</span><span class="cfVal">${v}</span></div>`}

const SW={in:'ogg:native', out:'ogg:'+SWAPCFG.wogg.toLowerCase(), amtIn:'', quote:null, busy:false, pick:null, slippage:Number(localStorage.getItem('oggSlip')||0.5)};
function oggAssets(){return allAssets().filter(a=>a.net==='ogg')}
function swAsset(which){return assetByKey(which==='in'?SW.in:SW.out)}
function swapRefreshPills(){
  const i=swAsset('in'),o=swAsset('out');
  el('swSymIn').textContent=i?i.sym:'—'; el('swCoinIn').style.background=i?i.coin:'#333';
  el('swSymOut').textContent=o?o.sym:'—'; el('swCoinOut').style.background=o?o.coin:'#333';
  swapShowBals();
}
async function swapShowBals(){
  const i=swAsset('in'),o=swAsset('out');
  el('swBalIn').textContent=i&&ASSETBAL[i.key]?('Balance: '+fmtUnits(ASSETBAL[i.key],i.dec)):'Balance: —';
  el('swBalOut').textContent=o&&ASSETBAL[o.key]?('Balance: '+fmtUnits(ASSETBAL[o.key],o.dec)):'Balance: —';
}
function openSwapPicker(which){SW.pick=which;const other=which==='in'?SW.out:SW.in;
  el('swPickList').innerHTML=oggAssets().map(a=>`<div class="assetRow ${a.key===other?'assetDim':''}" onclick="pickSwapToken('${a.key}')">
    <span class="assetIcon" style="background:${a.coin}"></span>
    <div class="assetInfo"><div class="assetSym">${escapeHtml(a.sym)}</div><div class="assetName">${escapeHtml(a.name)}</div></div>
    <div class="assetBal">${ASSETBAL[a.key]?fmtUnits(ASSETBAL[a.key],a.dec):''}</div></div>`).join('');
  el('swapPickModal').classList.remove('hidden');
}
function closeSwapPicker(){el('swapPickModal').classList.add('hidden')}
function pickSwapToken(key){
  if(SW.pick==='in'){ if(key===SW.out)SW.out=SW.in; SW.in=key; } else { if(key===SW.in)SW.in=SW.out; SW.out=key; }
  closeSwapPicker(); swapRefreshPills(); swapQuote();
}
function swapFlip(){const t=SW.in;SW.in=SW.out;SW.out=t;el('swAmtIn').value='';el('swAmtOut').value='';SW.amtIn='';SW.quote=null;el('swapMeta').classList.add('hidden');swapRefreshPills();updateSwapCta()}
function isWoggAddr(a){return a!=='native'&&a.toLowerCase()===SWAPCFG.wogg.toLowerCase()}
function swapPath(i,o){
  const w=SWAPCFG.wogg;
  const ai=i.addr==='native'?w:i.addr, ao=o.addr==='native'?w:o.addr;
  if(ai.toLowerCase()===ao.toLowerCase())return null;
  if(i.addr==='native'||o.addr==='native'||isWoggAddr(i.addr)||isWoggAddr(o.addr))return [ai,ao];
  return [ai,w,ao];
}
let swapDebounce=null;
function onSwapAmtInput(){SW.amtIn=el('swAmtIn').value;clearTimeout(swapDebounce);swapDebounce=setTimeout(swapQuote,450)}
async function swapMax(){const i=swAsset('in');if(!wallet||!i)return;let b=ASSETBAL[i.key]||zeroWei();
  if(i.addr==='native'){try{const gp=await providerFor('ogg').getGasPrice();const gas=gp.mul(400000).mul(2);b=b.gt(gas)?b.sub(gas):zeroWei()}catch{}}
  el('swAmtIn').value=weiToInputU(b,i.dec);SW.amtIn=el('swAmtIn').value;swapQuote()}
function setSlippage(){let v=parseFloat(el('swSlip').value);if(!isFinite(v)||v<=0||v>49){toast('Slippage must be between 0.1 and 49','error','Bad slippage');el('swSlip').value=SW.slippage;return}SW.slippage=v;try{localStorage.setItem('oggSlip',v)}catch{};if(SW.quote)swapQuote()}
async function swapQuote(){
  const i=swAsset('in'),o=swAsset('out');SW.quote=null;
  if(!i||!o||!SW.amtIn||parseFloat(SW.amtIn)<=0){el('swAmtOut').value='';el('swapMeta').classList.add('hidden');updateSwapCta();return}
  const inNat=i.addr==='native',outNat=o.addr==='native',inW=isWoggAddr(i.addr),outW=isWoggAddr(o.addr);
  try{
    if((inNat&&outW)||(inW&&outNat)){ /* 1:1 wrap or unwrap */
      const w=puU(SW.amtIn,18);
      SW.quote={amtIn:w,amtOut:w,path:null,wrap:inNat?'deposit':'withdraw'};
      el('swAmtOut').value=parseFloat(SW.amtIn).toFixed(6);
      el('swRate').textContent='1 '+i.sym+' = 1 '+o.sym+' (1:1 '+(inNat?'wrap':'unwrap')+')';
      el('swImpact').textContent='No price impact';el('swImpact').className='small impactOk';
      el('swMinOut').textContent=parseFloat(SW.amtIn).toFixed(6)+' '+o.sym;
      el('swapMeta').classList.remove('hidden');updateSwapCta();return;
    }
    const path=swapPath(i,o); if(!path){el('swapMeta').classList.add('hidden');updateSwapCta();return}
    const router=new ethers.Contract(SWAPCFG.router,ROUTER_ABI,providerFor('ogg'));
    const amtInWei=puU(SW.amtIn,i.dec);
    const amounts=await router.getAmountsOut(amtInWei,path);
    const amtOutWei=amounts[amounts.length-1];
    SW.quote={amtIn:amtInWei,amtOut:amtOutWei,path};
    const outF=fuU(amtOutWei,o.dec);
    el('swAmtOut').value=parseFloat(outF)<0.000001?'<0.000001':parseFloat(outF).toFixed(6);
    const rate=parseFloat(outF)/parseFloat(SW.amtIn);
    el('swRate').textContent='1 '+i.sym+' = '+(isFinite(rate)?rate.toLocaleString(undefined,{maximumFractionDigits:6}):'--')+' '+o.sym;
    const minOut=amtOutWei.mul(10000-Math.round(SW.slippage*100)).div(10000);
    el('swMinOut').textContent=parseFloat(fuU(minOut,o.dec)).toFixed(6)+' '+o.sym;
    const imp=await swapImpact(path,amtInWei);
    if(imp!==null){const pc=imp*100;el('swImpact').textContent='Price impact ~'+pc.toFixed(2)+'%';el('swImpact').className='small '+(pc>10?'impactBad':pc>3?'impactWarn':'impactOk')}
    else el('swImpact').textContent='';
    el('swapMeta').classList.remove('hidden');
  }catch(e){el('swAmtOut').value='';el('swapMeta').classList.add('hidden');log('Swap quote: '+humanError(e))}
  updateSwapCta();
}
async function swapImpact(path,amtIn){
  try{
    const f=new ethers.Contract(SWAPCFG.factory,FACTORY_ABI,providerFor('ogg'));
    const pairAddr=await f.getPair(path[0],path[1]);
    if(!pairAddr||pairAddr===ZEROADDR)return null;
    const pair=new ethers.Contract(pairAddr,PAIR_ABI,providerFor('ogg'));
    const [r0,r1]=await pair.getReserves();
    const t0=(await pair.token0()).toLowerCase();
    const rIn=t0===path[0].toLowerCase()?r0:r1;
    const inF=parseFloat(fuU(amtIn,18)),resF=parseFloat(fuU(rIn,18));
    if(!resF)return null;
    return inF/(resF+inF);
  }catch{return null}
}
function updateSwapCta(){
  const c=el('swapCta'); if(!c)return;
  if(SW.busy){c.disabled=true;return}
  if(!wallet){c.textContent='Unlock wallet first';c.disabled=true;return}
  if(!SW.amtIn||parseFloat(SW.amtIn)<=0){c.textContent='Enter amount';c.disabled=true;return}
  if(!SW.quote){c.textContent='No route for this pair';c.disabled=true;return}
  c.disabled=false;
  c.textContent=SW.quote.wrap?(SW.quote.wrap==='deposit'?'Wrap OGG → wOGG':'Unwrap wOGG → OGG'):'Swap';
}
function swapConfirm(){
  const i=swAsset('in'),o=swAsset('out');
  if(!wallet||!SW.quote||!i||!o)return;
  const inBal=ASSETBAL[i.key]||zeroWei();
  if(SW.quote.amtIn.gt(inBal))return toast('Not enough '+i.sym+' for this swap.','error','Balance too low');
  const minOut=SW.quote.wrap?SW.quote.amtOut:SW.quote.amtOut.mul(10000-Math.round(SW.slippage*100)).div(10000);
  openConfirm(SW.quote.wrap?(SW.quote.wrap==='deposit'?'Confirm wrap':'Confirm unwrap'):'Confirm swap',
    cfRow('You pay',parseFloat(SW.amtIn).toFixed(6)+' '+i.sym)+
    cfRow('You receive','~'+parseFloat(fuU(SW.quote.amtOut,o.dec)).toFixed(6)+' '+o.sym)+
    (SW.quote.wrap?'':cfRow('Minimum received',parseFloat(fuU(minOut,o.dec)).toFixed(6)+' '+o.sym)+cfRow('Slippage',SW.slippage+'%'))+
    cfRow('Network','Oggchain'),
    SW.quote.wrap?'Confirm':'Confirm swap', doSwap);
}
async function doSwap(){
  const i=swAsset('in'),o=swAsset('out');
  if(!SW.quote)return;
  SW.busy=true;const c=el('swapCta');c.disabled=true;c.textContent='Working…';
  try{
    const signer=signerFor('ogg');
    let tx;
    if(SW.quote.wrap){
      const wogg=new ethers.Contract(SWAPCFG.wogg,WOGG_ABI,signer);
      const ov=await gasOverridesFor('ogg',120000);
      tx=SW.quote.wrap==='deposit'?await wogg.deposit({value:SW.quote.amtIn,...ov}):await wogg.withdraw(SW.quote.amtIn,ov);
    }else{
      const {amtIn,amtOut,path}=SW.quote;
      const minOut=amtOut.mul(10000-Math.round(SW.slippage*100)).div(10000);
      const router=new ethers.Contract(SWAPCFG.router,ROUTER_ABI,signer);
      const dl=Math.floor(Date.now()/1000)+1200;
      const inNat=i.addr==='native',outNat=o.addr==='native';
      if(!inNat)await approveIfNeeded(i.addr,amtIn,SWAPCFG.router);
      const ov=await gasOverridesFor('ogg',path.length>2?450000:320000);
      if(inNat)tx=await router.swapExactOGGForTokens(minOut,path,wallet.address,dl,{value:amtIn,...ov});
      else if(outNat)tx=await router.swapExactTokensForOGG(amtIn,minOut,path,wallet.address,dl,ov);
      else tx=await router.swapExactTokensForTokens(amtIn,minOut,path,wallet.address,dl,ov);
    }
    lastTxHash=tx.hash; if(el('txHash'))el('txHash').value=tx.hash;
    toast('Swap broadcast. Waiting for Oggchain confirmation.','success','Swap sent');
    log('SWAP TX: '+tx.hash);
    await tx.wait();
    ok('Swap confirmed: '+parseFloat(SW.amtIn).toFixed(4)+' '+i.sym+' → ~'+el('swAmtOut').value+' '+o.sym);
    el('swAmtIn').value='';el('swAmtOut').value='';SW.amtIn='';SW.quote=null;el('swapMeta').classList.add('hidden');
    await refreshAssets();
  }catch(e){fail('Swap',e)}
  SW.busy=false;updateSwapCta();
}
async function approveIfNeeded(tokenAddr,amount,spender){
  const signer=signerFor('ogg');
  const c=new ethers.Contract(tokenAddr,ERC20_ABI,signer);
  const all=await c.allowance(wallet.address,spender);
  if(all.gte(amount))return;
  toast('One-time token approval needed first…','info','Approving');
  const ov=await gasOverridesFor('ogg',80000);
  const tx=await c.approve(spender,ethers.constants.MaxUint256,ov);
  log('APPROVE TX: '+tx.hash);
  await tx.wait();
  toast('Token approved for CaveSwap router.','success','Approved');
}

const BR={dir:'out', homeAsset:'OGG', busy:false, cap:{max:null,used:0,window:3600,start:0}};
function brSrcNet(){return BR.dir==='out'?'ogg':'bsc'}
function brDstNet(){return BR.dir==='out'?'bsc':'ogg'}
function brRefreshView(){
  el('brTopSym').textContent=BR.dir==='out'?(BR.homeAsset==='OGG'?'OGG':'wOGG'):'OGG (BSC)';
  el('brBotSym').textContent=BR.dir==='out'?'OGG (BSC)':(BR.homeAsset==='OGG'?'OGG':'wOGG');
  el('brTopNet').textContent=NETWORKS[brSrcNet()].name;
  el('brBotNet').textContent=NETWORKS[brDstNet()].name;
  el('brHomeAssetRow').style.display='flex';
  document.querySelectorAll('.brAssetPill').forEach(b=>b.classList.toggle('active',b.dataset.asset===BR.homeAsset));
  el('brSteps').innerHTML=BR.dir==='out'
    ?(BR.homeAsset==='OGG'?'Flow: <b>wrap OGG → wOGG</b>, then <b>bridge</b> (2 transactions)':'Flow: <b>bridge wOGG</b> (1 transaction)')
    :(BR.homeAsset==='OGG'?'Flow: <b>bridge on BSC</b> (1 tx, gas in BNB) → wOGG arrives → <b>auto-unwrap to OGG</b>':'Flow: <b>bridge on BSC</b> (1 tx, gas in BNB) → receive wOGG');
  brUpdateBalance(); brMirror(); brUpdateCta(); brFetchCapacity();
}
function brSetHomeAsset(a){BR.homeAsset=a;brRefreshView()}
function brFlip(){BR.dir=BR.dir==='out'?'in':'out';el('brAmt').value='';el('brOut').value='';brRefreshView()}
async function brUpdateBalance(){
  const lbl=el('brBal'); if(!wallet){lbl.textContent='Balance: —';return}
  try{
    let b,sym;
    if(BR.dir==='out'){
      if(BR.homeAsset==='wOGG'){b=await new ethers.Contract(SWAPCFG.wogg,WOGG_ABI,providerFor('ogg')).balanceOf(wallet.address);sym='wOGG'}
      else{b=await providerFor('ogg').getBalance(wallet.address);sym='OGG'}
    }else{b=await new ethers.Contract(BRIDGECFG.oggBsc,ERC20_ABI,providerFor('bsc')).balanceOf(wallet.address);sym='OGG (BSC)'}
    lbl.textContent='Balance: '+fmtUnits(b,18)+' '+sym; lbl.dataset.max=fuU(b,18);
  }catch(e){lbl.textContent='Balance: —';log('bridge bal: '+humanError(e))}
}
function brMirror(){const v=parseFloat(el('brAmt').value||'0');el('brOut').value=v>0?v.toFixed(6):''}
async function brMax(){
  let mx=parseFloat(el('brBal').dataset.max||'0');
  if(!mx||mx<=0)return toast('No balance to bridge on this side.','error','Nothing to bridge');
  if(BR.dir==='out'&&BR.homeAsset==='OGG'){
    let reserve=0.05;
    try{const gp=await providerFor('ogg').getGasPrice();reserve=Math.max(parseFloat(fuU(gp.mul(300000).mul(2),18)),0.02)}catch{}
    mx-=reserve;
    if(mx<=0)return toast('Balance too low to also cover gas.','error','Too low');
  }
  mx=Math.floor(mx*1e6)/1e6;
  const rem=brCapRemaining();
  if(rem!=null&&mx>rem){mx=Math.floor(rem*1e6)/1e6;toast('Capped to bridge limit this window: '+rem.toLocaleString()+' OGG','info','Bridge limit')}
  el('brAmt').value=mx;brMirror();brUpdateCta();
}
async function brFetchCapacity(){
  try{
    const dst=BR.dir==='out'?{addr:BRIDGECFG.bsc,prov:providerFor('bsc'),abi:BRIDGE_BSC_ABI}:{addr:BRIDGECFG.home,prov:providerFor('ogg'),abi:BRIDGE_HOME_ABI};
    const c=new ethers.Contract(dst.addr,dst.abi,dst.prov);
    const [max,used,win,start]=await Promise.all([c.rateMax(),c.issuedInWindow(),c.rateWindow(),c.windowStart()]);
    BR.cap={max:parseFloat(fuU(max,18)),used:parseFloat(fuU(used,18)),window:Number(win),start:Number(start)};
  }catch(e){log('bridge capacity: '+humanError(e))}
  brRenderCapacity();brUpdateCta();
}
function brCapRemaining(){
  if(BR.cap.max==null)return null;
  const now=Math.floor(Date.now()/1000);
  const used=(now-BR.cap.start)>=BR.cap.window?0:BR.cap.used;
  return Math.max(0,BR.cap.max-used);
}
function brRenderCapacity(){
  const box=el('brCap'); if(!box)return;
  if(BR.cap.max==null){box.innerHTML='';return}
  const now=Math.floor(Date.now()/1000);
  const rolled=(now-BR.cap.start)>=BR.cap.window;
  const used=rolled?0:BR.cap.used;
  const rem=brCapRemaining();
  const pct=Math.min(100,BR.cap.max?used/BR.cap.max*100:0);
  const resetIn=Math.max(0,Math.ceil(((BR.cap.start+BR.cap.window)-now)/60));
  box.innerHTML=`<div class="capRow"><span>Bridge capacity → ${NETWORKS[brDstNet()].short}</span><span class="capRem">max now ${rem.toLocaleString(undefined,{maximumFractionDigits:0})} OGG</span></div>
  <div class="capBar"><div class="capFill${pct>85?' capFull':''}" style="width:${pct}%"></div></div>
  <div class="capSub">${used.toLocaleString(undefined,{maximumFractionDigits:0})} / ${BR.cap.max.toLocaleString(undefined,{maximumFractionDigits:0})} used this window${(!rolled&&resetIn>0)?' · resets in '+resetIn+'m':''}</div>`;
}
function brUpdateCta(){
  const c=el('brCta'); if(!c||BR.busy)return;
  if(!wallet){c.textContent='Unlock wallet first';c.disabled=true;return}
  const v=parseFloat(el('brAmt').value||'0');
  if(!v||v<=0){c.textContent='Enter amount';c.disabled=true;return}
  const rem=brCapRemaining();
  if(rem!=null&&v>rem){c.disabled=true;c.textContent=rem<=0?'Bridge at capacity — wait for reset':'Max right now: '+rem.toLocaleString(undefined,{maximumFractionDigits:0})+' OGG';return}
  c.disabled=false;c.textContent=BR.dir==='out'?'Bridge to BSC':'Bridge to Oggchain';
}
function brConfirm(){
  if(!wallet)return toast('Unlock wallet first','error','Wallet locked');
  const v=parseFloat(el('brAmt').value||'0'); if(!v||v<=0)return;
  const src=BR.dir==='out'?(BR.homeAsset==='OGG'?'OGG':'wOGG'):'OGG (BSC)';
  const dst=BR.dir==='out'?'OGG (BSC)':(BR.homeAsset==='OGG'?'OGG':'wOGG');
  openConfirm('Confirm bridge',
    cfRow('You send',v.toLocaleString(undefined,{maximumFractionDigits:6})+' '+src)+
    cfRow('You receive','~'+v.toLocaleString(undefined,{maximumFractionDigits:6})+' '+dst)+
    cfRow('Route',NETWORKS[brSrcNet()].name+' → '+NETWORKS[brDstNet()].name)+
    cfRow('Rate','1:1 burn & mint')+
    cfRow('Gas paid in',NETWORKS[brSrcNet()].nativeSym),
    'Confirm bridge', doBridge);
}
async function doBridge(){
  const amtStr=(el('brAmt').value||'').trim(), v=parseFloat(amtStr);
  if(!v||v<=0)return;
  BR.busy=true;const c=el('brCta');c.disabled=true;c.textContent='Checking capacity…';
  try{
    await brFetchCapacity();
    const rem=brCapRemaining();
    if(rem==null)throw new Error('Could not verify bridge capacity — try again.');
    if(v>rem)throw new Error(rem<=0?'Bridge is at capacity this window. Try again after reset.':'Over the limit — max right now is '+rem.toLocaleString(undefined,{maximumFractionDigits:0})+' OGG.');
    const amount=puU(amtStr,18);
    if(BR.dir==='out')await bridgeOutbound(amount,c);
    else await bridgeInbound(amount,c);
    el('brAmt').value='';el('brOut').value='';
  }catch(e){fail('Bridge',e)}
  BR.busy=false;brUpdateCta();brUpdateBalance();brRenderHist();
}
function brLoadHist(){try{return JSON.parse(localStorage.getItem(BRIDGECFG.histKey)||'[]')}catch{return[]}}
function brSaveHist(h){try{localStorage.setItem(BRIDGECFG.histKey,JSON.stringify(h.slice(0,40)))}catch{}}
function brAddHist(e){const h=brLoadHist();h.unshift(e);brSaveHist(h);brRenderHist();return e}
function brUpdHist(id,patch){const h=brLoadHist();const i=h.findIndex(x=>x.id===id);if(i>=0){h[i]=Object.assign(h[i],patch);brSaveHist(h);brRenderHist()}}
async function bridgeOutbound(amount,c){ // Oggchain -> BSC
  const id='b'+Date.now();
  const entry={id,dir:'out',amount:fuU(amount,18),recipient:wallet.address,status:BR.homeAsset==='OGG'?'wrapping':'submitting',ts:Date.now(),fromBlock:null,unwrap:false,srcTx:null,dstTx:null};
  brAddHist(entry);
  try{
    const signer=signerFor('ogg');
    if(BR.homeAsset==='OGG'){
      c.textContent='Step 1/2 — wrapping…';
      toast('Wrapping OGG → wOGG…','info','Bridge step 1/2');
      const wogg=new ethers.Contract(SWAPCFG.wogg,WOGG_ABI,signer);
      const tx0=await wogg.deposit({value:amount,...(await gasOverridesFor('ogg',120000))});
      log('WRAP TX: '+tx0.hash);
      await tx0.wait();
    }
    c.textContent=BR.homeAsset==='OGG'?'Step 2/2 — bridging…':'Bridging…';
    brUpdHist(id,{status:'submitting'});
    const bridge=new ethers.Contract(BRIDGECFG.home,BRIDGE_HOME_ABI,signer);
    entry.fromBlock=await providerFor('bsc').getBlockNumber();
    const tx=await bridge.bridgeOut(amount,wallet.address,await gasOverridesFor('ogg',300000));
    brUpdHist(id,{srcTx:tx.hash,status:'pending',fromBlock:entry.fromBlock});
    lastTxHash=tx.hash; if(el('txHash'))el('txHash').value=tx.hash;
    toast('Bridge submitted — funds in flight to BSC (~1–2 min).','success','Bridge sent');
    log('BRIDGE OUT TX: '+tx.hash);
    await tx.wait();
    brPollLanded(Object.assign({},entry,{srcTx:tx.hash,status:'pending'}));
  }catch(e){brUpdHist(id,{status:'failed',note:'not completed (cancelled or reverted)'});throw e}
}
async function bridgeInbound(amount,c){ // BSC -> Oggchain
  const bnb=await providerFor('bsc').getBalance(wallet.address).catch(()=>null);
  if(bnb&&bnb.isZero())throw new Error('You need BNB on BSC to pay gas for this bridge.');
  const id='b'+Date.now();
  const entry={id,dir:'in',amount:fuU(amount,18),recipient:wallet.address,status:'submitting',ts:Date.now(),fromBlock:null,unwrap:BR.homeAsset==='OGG',srcTx:null,dstTx:null};
  brAddHist(entry);
  try{
    const signer=signerFor('bsc');
    c.textContent='Bridging on BSC…';
    const bridge=new ethers.Contract(BRIDGECFG.bsc,BRIDGE_BSC_ABI,signer);
    const homeRecipient=ethers.utils.hexZeroPad(wallet.address,32);
    entry.fromBlock=await providerFor('ogg').getBlockNumber();
    const tx=await bridge.bridgeOut(amount,homeRecipient,await gasOverridesFor('bsc',300000));
    brUpdHist(id,{srcTx:tx.hash,status:'pending',fromBlock:entry.fromBlock});
    lastTxHash=tx.hash; if(el('txHash'))el('txHash').value=tx.hash;
    toast('Bridge submitted — funds in flight to Oggchain (~1–2 min).','success','Bridge sent');
    log('BRIDGE IN TX: '+tx.hash);
    await tx.wait();
    brPollLanded(Object.assign({},entry,{srcTx:tx.hash,status:'pending'}));
  }catch(e){brUpdHist(id,{status:'failed',note:'not completed (cancelled or reverted)'});throw e}
}
async function brPollLanded(entry){
  const dstNet=entry.dir==='out'?'bsc':'ogg';
  const dstAddr=entry.dir==='out'?BRIDGECFG.bsc:BRIDGECFG.home;
  const abi=entry.dir==='out'?BRIDGE_BSC_ABI:BRIDGE_HOME_ABI;
  const prov=providerFor(dstNet);
  const cont=new ethers.Contract(dstAddr,abi,prov);
  const want=puU(entry.amount,18), started=Date.now();
  const filter=cont.filters.BridgedIn(null,entry.recipient);
  const tick=async()=>{
    if(Date.now()-started>BRIDGECFG.pollTimeoutMs){brUpdHist(entry.id,{status:'failed',note:'not detected — check explorer'});return}
    try{
      const latest=await prov.getBlockNumber();
      const from=Math.max(Math.max((entry.fromBlock||latest)-5,0),latest-4500);
      const logs=await cont.queryFilter(filter,from,latest);
      const hit=logs.find(l=>l.args&&l.args.amount&&l.args.amount.eq(want));
      if(hit){
        brUpdHist(entry.id,{status:'landed',dstTx:hit.transactionHash});
        toast('Funds landed on '+NETWORKS[dstNet].name+'!','success','Bridge complete');
        log('BRIDGE LANDED: '+hit.transactionHash);
        if(entry.unwrap)brTryUnwrap(Object.assign({},entry,{status:'landed'}));
        refreshAssets();
        return;
      }
    }catch(e){log('bridge poll: '+humanError(e))}
    setTimeout(tick,BRIDGECFG.pollMs);
  };
  setTimeout(tick,BRIDGECFG.pollMs);
}
async function brTryUnwrap(entry){
  try{
    const signer=signerFor('ogg');
    const wogg=new ethers.Contract(SWAPCFG.wogg,WOGG_ABI,signer);
    toast('Unwrapping wOGG → OGG…','info','Final step');
    const tx=await wogg.withdraw(puU(entry.amount,18),await gasOverridesFor('ogg',120000));
    await tx.wait();
    brUpdHist(entry.id,{unwrapDone:true,note:'unwrapped to OGG'});
    ok('Unwrapped to native OGG');
    refreshAssets();
  }catch(e){
    brUpdHist(entry.id,{note:'received wOGG — tap "Unwrap to OGG" in history'});
    log('unwrap: '+humanError(e));
  }
}
function brNeedsUnwrap(e){return e.dir==='in'&&e.unwrap&&!e.unwrapDone&&e.status==='landed'}
function brUnwrapFromHist(id){const e=brLoadHist().find(x=>x.id===id);if(e)brTryUnwrap(e)}
function brRenderHist(){
  const box=el('brHist'); if(!box)return;
  const h=brLoadHist();
  if(!h.length){box.innerHTML='<div class="small" style="text-align:center;padding:14px">No bridge transfers yet. Ogg cave is quiet.</div>';return}
  box.innerHTML=h.map(e=>{
    const route=e.dir==='out'?'Oggchain → BSC':'BSC → Oggchain';
    const st=e.status==='landed'?'good':e.status==='failed'?'bad':'';
    const links=[e.srcTx?`<a href="${explorerTx(e.dir==='out'?'ogg':'bsc',e.srcTx)}" target="_blank">Source ↗</a>`:'',e.dstTx?`<a href="${explorerTx(e.dir==='out'?'bsc':'ogg',e.dstTx)}" target="_blank">Dest ↗</a>`:''].filter(Boolean).join(' &nbsp; ');
    const uw=brNeedsUnwrap(e)?`<button class="secondary" style="margin-top:6px" onclick="brUnwrapFromHist('${e.id}')">Unwrap to OGG</button>`:'';
    return `<div class="proposal"><b>${route}</b> — ${parseFloat(e.amount).toLocaleString(undefined,{maximumFractionDigits:4})} OGG
      <span class="pill ${st}" style="float:right">${e.status}</span>
      <div class="small">${new Date(e.ts).toLocaleString()}${e.note?' · '+escapeHtml(e.note):''}</div>
      <div class="small">${links}</div>${uw}</div>`;
  }).join('');
}
function brResumePending(){
  brLoadHist().forEach(e=>{
    if(e.srcTx&&e.status==='pending'){
      if(Date.now()-e.ts<60*60*1000)brPollLanded(e);
      else brUpdHist(e.id,{status:'failed',note:'stale — check explorer'});
    }else if(!e.srcTx&&(e.status==='wrapping'||e.status==='submitting')){
      brUpdHist(e.id,{status:'failed',note:'not completed — funds never left your wallet'});
    }
  });
  brRenderHist();
}

var currentBalanceWei, currentStakedWei; /* safe hoisted declarations for implicit globals */
function updateAmountLabels(){try{
  if(el('stakeAvailable'))el('stakeAvailable').textContent=fmt(safeWei(currentBalanceWei));
  if(el('unstakeAvailable'))el('unstakeAvailable').textContent=fmt(safeWei(currentStakedWei));
  if(el('cooldownInline'))el('cooldownInline').textContent=el('cooldown')?el('cooldown').textContent:'--';
  updateSendAvail();
}catch{}}

/* ---------------- lifecycle glue ---------------- */
async function refreshAll(){
  await checkRpc(); await refreshWallet();
  if(wallet){
    refreshAssets().catch(e=>log('assets: '+humanError(e)));
    await loadStake(); await loadStakeStats(); await loadPool(); await loadTribeRules();
    brUpdateBalance(); brFetchCapacity();
  }
}
async function enterWallet(w,savePassword=null){
  wallet=w.connect(getProvider());
  address.textContent=wallet.address;
  if(savePassword){await savePk(w.privateKey,savePassword);ok('Wallet encrypted and saved')}
  screen('screenApp');
  ASSETBAL={}; sendAssetKey='ogg:native';
  if(el('swSlip'))el('swSlip').value=SW.slippage;
  swapRefreshPills(); brRefreshView(); brResumePending(); renderSendAssetOptions();
  startAutoRefresh();
  await refreshAll();
}

var WALLETNET='ogg';
function setWalletNet(net){
  WALLETNET=net;
  el('segOgg').classList.toggle('active',net==='ogg');
  el('segBsc').classList.toggle('active',net==='bsc');
  const cur=assetByKey(sendAssetKey);
  if(!cur||cur.net!==net)sendAssetKey=net+':native';
  renderAssetList(); renderSendAssetOptions(); updateSendAvail();
  el('sendSlider').value=0; el('sendSliderLabel').textContent='0%'; el('sendAmount').value='';
}
function netAssets(){return allAssets().filter(a=>a.net===WALLETNET)}
function renderAssetList(loading){
  const box=el('assetList'); if(!box)return;
  box.innerHTML=netAssets().map(a=>{
    const bal=ASSETBAL[a.key]?fmtUnits(ASSETBAL[a.key],a.dec,a.dec>8?4:a.dec):(loading?'…':'—');
    const rm=a.custom?`<button class="assetRemove" onclick="event.stopPropagation();removeCustomToken('${a.key}')">✕</button>`:'';
    return `<div class="assetRow" onclick="selectSendAsset('${a.key}')">
      <span class="assetIcon" style="background:${a.coin}"></span>
      <div class="assetInfo"><div class="assetSym">${escapeHtml(a.sym)}</div><div class="assetName">${escapeHtml(a.name)}</div></div>
      <div class="assetBal" id="bal_${cssKey(a.key)}">${bal}</div>${rm}</div>`;
  }).join('');
}
function renderSendAssetOptions(){
  const sel=el('sendAssetSel'); if(!sel)return;
  sel.innerHTML=netAssets().map(a=>`<option value="${a.key}" ${a.key===sendAssetKey?'selected':''}>${escapeHtml(a.sym)} — ${escapeHtml(a.name)}</option>`).join('');
}
function fmt(x,dp=4){try{return Number(ethers.utils.formatEther(x)).toLocaleString(undefined,{maximumFractionDigits:dp})}catch{return '--'}}
function fmtCompactOgg(x){try{let n=Number(ethers.utils.formatEther(x));if(!isFinite(n))return '--';let abs=Math.abs(n);let val=n,suf='';if(abs>=1e9){val=n/1e9;suf='B'}else if(abs>=1e6){val=n/1e6;suf='M'}else if(abs>=1e3){val=n/1e3;suf='K'}return val.toLocaleString(undefined,{maximumFractionDigits:1})+suf}catch{return '--'}}
function updateSendAvail(){
  const a=assetByKey(sendAssetKey); if(!a)return;
  if(el('sendAvailable'))el('sendAvailable').textContent=fmtUnits(sendAssetBalWei(),a.dec);
  if(el('sendAvailable'))el('sendAvailable').className=a.key==='ogg:native'?'oggAfter':'';
  if(el('sendAmount'))el('sendAmount').placeholder='Amount '+a.sym;
  if(el('sendSliderNote'))el('sendSliderNote').textContent=a.addr==='native'?'100% keeps gas aside automatically.':('Gas is paid in '+NETWORKS[a.net].nativeSym+'.');
}
async function swapShowBals(){
  const i=swAsset('in'),o=swAsset('out');
  el('swBalIn').textContent=i&&ASSETBAL[i.key]?('Balance: '+fmtUnits(ASSETBAL[i.key],i.dec)):'Balance: —';
  el('swBalOut').textContent=o&&ASSETBAL[o.key]?('Balance: '+fmtUnits(ASSETBAL[o.key],o.dec)):'Balance: —';
}
function openTokenModal(){pendingTokenInfo=null;el('tokAddr').value='';el('tokInfo').textContent='';el('tokAddBtn').disabled=true;el('tokNet').value=WALLETNET;el('tokenModal').classList.remove('hidden')}

/* ---- bridge pills with dropdowns ---- */
const BR_COINS={OGG:'radial-gradient(circle at 32% 28%,#ffc46b,#f7931a 45%,#b8690a)',
  wOGG:'linear-gradient(135deg,#AAB4B8,#555763)',
  BSC:'radial-gradient(circle at 32% 28%,#ffe9a6,#F3BA2F 50%,#a87b12)'};
function brHomePos(){return BR.dir==='out'?'top':'bot'}
function brCloseMenus(){['brTopMenu','brBotMenu'].forEach(id=>{if(el(id))el(id).classList.remove('show')})}
function brPillTap(pos,ev){
  if(ev)ev.stopPropagation();
  if(pos!==brHomePos()){brCloseMenus();return} // BSC side is fixed
  const menu=el(pos==='top'?'brTopMenu':'brBotMenu');
  const open=menu.classList.contains('show');
  brCloseMenus();
  if(!open)menu.classList.add('show');
}
function brSelectHome(asset,ev){if(ev)ev.stopPropagation();BR.homeAsset=asset;brCloseMenus();brRefreshView()}
document.addEventListener('click',()=>brCloseMenus());
function brRefreshView(){
  const homeSym=BR.homeAsset==='OGG'?'OGG':'wOGG';
  const homePos=brHomePos(), awayPos=homePos==='top'?'bot':'top';
  const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);
  el('br'+cap(homePos)+'Sym').textContent=homeSym;
  el('br'+cap(homePos)+'Icon').style.background=BR_COINS[BR.homeAsset];
  el('br'+cap(awayPos)+'Sym').textContent='OGG (BSC)';
  el('br'+cap(awayPos)+'Icon').style.background=BR_COINS.BSC;
  el('br'+cap(homePos)+'Chev').style.display='';
  el('br'+cap(awayPos)+'Chev').style.display='none';
  const menu=el('br'+cap(homePos)+'Menu');
  menu.innerHTML=['OGG','wOGG'].map(a=>`<div class="pmItem${a===BR.homeAsset?' sel':''}" onclick="brSelectHome('${a}',event)"><span class="assetIcon" style="background:${BR_COINS[a]}"></span>${a}</div>`).join('');
  el('br'+cap(awayPos)+'Menu').innerHTML='';
  el('brTopNet').textContent=NETWORKS[brSrcNet()].name;
  el('brBotNet').textContent=NETWORKS[brDstNet()].name;
  el('brSteps').innerHTML=BR.dir==='out'
    ?(BR.homeAsset==='OGG'?'Flow: <b>wrap OGG → wOGG</b>, then <b>bridge</b> (2 transactions)':'Flow: <b>bridge wOGG</b> (1 transaction)')
    :(BR.homeAsset==='OGG'?'Flow: <b>bridge on BSC</b> (1 tx, gas in BNB) → wOGG arrives → <b>auto-unwrap to OGG</b>':'Flow: <b>bridge on BSC</b> (1 tx, gas in BNB) → receive wOGG');
  brUpdateBalance(); brMirror(); brUpdateCta(); brFetchCapacity();
}
async function brUpdateBalance(){
  const lbl=el('brBal'); if(!wallet){lbl.textContent='Balance: —';return}
  try{
    let b;
    if(BR.dir==='out'){
      if(BR.homeAsset==='wOGG')b=await new ethers.Contract(SWAPCFG.wogg,WOGG_ABI,providerFor('ogg')).balanceOf(wallet.address);
      else b=await providerFor('ogg').getBalance(wallet.address);
    }else b=await new ethers.Contract(BRIDGECFG.oggBsc,ERC20_ABI,providerFor('bsc')).balanceOf(wallet.address);
    lbl.textContent='Balance: '+fmtUnits(b,18); lbl.dataset.max=fuU(b,18);
  }catch(e){lbl.textContent='Balance: —';log('bridge bal: '+humanError(e))}
}

/* ---- OGG coin icon: gray circular logo for any OGG-family asset ---- */
function isOggCoin(a){
  if(!a)return false;
  if(a.key==='ogg:native')return true;                 // native OGG
  if(a.addr && a.addr.toLowerCase()===SWAPCFG.wogg.toLowerCase())return true; // wOGG
  if(a.addr && a.addr.toLowerCase()===BRIDGECFG.oggBsc.toLowerCase())return true; // OGG on BSC
  return false;
}
function iconStyleFor(a){
  return isOggCoin(a) ? '' : ('background:'+a.coin);   // OGG -> class handles image; else gradient
}
function iconClassFor(a){ return isOggCoin(a) ? 'assetIcon coinImg' : 'assetIcon'; }

/* re-render asset list with coin images for OGG assets */
function renderAssetList(loading){
  const box=el('assetList'); if(!box)return;
  box.innerHTML=netAssets().map(a=>{
    const bal=ASSETBAL[a.key]?fmtUnits(ASSETBAL[a.key],a.dec,a.dec>8?4:a.dec):(loading?'…':'—');
    const rm=a.custom?`<button class="assetRemove" onclick="event.stopPropagation();removeCustomToken('${a.key}')">✕</button>`:'';
    return `<div class="assetRow" onclick="selectSendAsset('${a.key}')">
      <span class="${iconClassFor(a)}" style="${iconStyleFor(a)}"></span>
      <div class="assetInfo"><div class="assetSym">${escapeHtml(a.sym)}</div><div class="assetName">${escapeHtml(a.name)}</div></div>
      <div class="assetBal" id="bal_${cssKey(a.key)}">${bal}</div>${rm}</div>`;
  }).join('');
}

/* ---- custom Send asset dropdown (replaces native select) ---- */
function renderSendAssetOptions(){ syncSendPill(); }   // keep old name working
function syncSendPill(){
  const a=assetByKey(sendAssetKey)||netAssets()[0];
  if(!a)return;
  if(a.net!==WALLETNET)return;
  const icon=el('sendAssetIcon'), lbl=el('sendAssetLabel');
  if(icon){icon.className=iconClassFor(a);icon.style=isOggCoin(a)?'':('background:'+a.coin)}
  if(lbl)lbl.textContent=a.sym+' — '+a.name;
}
function toggleSendAssetMenu(ev){
  if(ev)ev.stopPropagation();
  const menu=el('sendAssetMenu'); if(!menu)return;
  const open=menu.classList.contains('show');
  closeAllPillMenus();
  if(open)return;
  menu.innerHTML=netAssets().map(a=>`<div class="pmItem${a.key===sendAssetKey?' sel':''}" onclick="pickSendAsset('${a.key}',event)">
    <span class="${iconClassFor(a)}" style="${isOggCoin(a)?'':'background:'+a.coin}"></span>
    <span class="pmName">${escapeHtml(a.sym)}</span><span class="pmChain">${escapeHtml(a.name)}</span></div>`).join('');
  menu.classList.add('show');
}
function pickSendAsset(key,ev){
  if(ev)ev.stopPropagation();
  sendAssetKey=key; closeAllPillMenus(); syncSendPill(); updateSendAvail();
  el('sendSlider').value=0; el('sendSliderLabel').textContent='0%'; el('sendAmount').value='';
}
function closeAllPillMenus(){document.querySelectorAll('.pillMenu.show').forEach(m=>m.classList.remove('show'))}
document.addEventListener('click',()=>closeAllPillMenus());
// selectSendAsset from asset list should also sync the pill
function selectSendAsset(key){sendAssetKey=key;syncSendPill();updateSendAvail();el('sendSlider').value=0;el('sendSliderLabel').textContent='0%';el('sendAmount').value='';toast(assetByKey(key).sym+' selected for sending.','info','Asset selected')}

/* swap/bridge pill icons: OGG-family -> gray coin image */
function applyCoinIcon(elm,assetObj){
  if(!elm)return;
  if(assetObj&&isOggCoin(assetObj)){elm.className='assetIcon coinImg';elm.style.background=''}
  else{elm.className='assetIcon';elm.style.background=assetObj?assetObj.coin:'#333'}
}
function swapRefreshPills(){
  const i=swAsset('in'),o=swAsset('out');
  el('swSymIn').textContent=i?i.sym:'—'; applyCoinIcon(el('swCoinIn'),i);
  el('swSymOut').textContent=o?o.sym:'—'; applyCoinIcon(el('swCoinOut'),o);
  swapShowBals();
}
function openSwapPicker(which){SW.pick=which;const other=which==='in'?SW.out:SW.in;
  el('swPickList').innerHTML=oggAssets().map(a=>`<div class="assetRow ${a.key===other?'assetDim':''}" onclick="pickSwapToken('${a.key}')">
    <span class="${iconClassFor(a)}" style="${isOggCoin(a)?'':'background:'+a.coin}"></span>
    <div class="assetInfo"><div class="assetSym">${escapeHtml(a.sym)}</div><div class="assetName">${escapeHtml(a.name)}</div></div>
    <div class="assetBal">${ASSETBAL[a.key]?fmtUnits(ASSETBAL[a.key],a.dec):''}</div></div>`).join('');
  el('swapPickModal').classList.remove('hidden');
}
// bridge pill icons — OGG/wOGG are OGG-family, OGG(BSC) is OGG-family too
function brCoinObj(sym){
  if(sym==='OGG')return {key:'ogg:native',addr:'native'};
  if(sym==='wOGG')return {addr:SWAPCFG.wogg};
  return {addr:BRIDGECFG.oggBsc};
}
function brApplyPillIcons(){
  const homePos=BR.dir==='out'?'top':'bot', awayPos=homePos==='top'?'bot':'top';
  const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);
  applyCoinIcon(el('br'+cap(homePos)+'Icon'), brCoinObj(BR.homeAsset==='OGG'?'OGG':'wOGG'));
  applyCoinIcon(el('br'+cap(awayPos)+'Icon'), brCoinObj('BSC'));
}
/* refresh bridge pill icons after view update */
(function(){ var base=brRefreshView; brRefreshView=function(){ base.apply(this,arguments); brApplyPillIcons(); }; })();

/* Storage model:
   oggWallets_v1 = [{id,name,enc:{salt,iv,ct}}]  (each password-encrypted separately)
   oggActiveWallet_v1 = id
   Legacy single 'oggEnc' auto-migrates into slot "Wallet 1".
*/
const WKEY='oggWallets_v1', AWKEY='oggActiveWallet_v1';
function loadWallets(){try{return JSON.parse(localStorage.getItem(WKEY)||'[]')}catch{return[]}}
function saveWallets(l){try{localStorage.setItem(WKEY,JSON.stringify(l))}catch{}}
function activeWalletId(){return localStorage.getItem(AWKEY)||''}
function setActiveWalletId(id){try{localStorage.setItem(AWKEY,id)}catch{}}
function migrateLegacyWallet(){
  const list=loadWallets();
  if(!list.length && localStorage.getItem('oggEnc')){
    try{
      const enc=JSON.parse(localStorage.getItem('oggEnc'));
      const id='w'+Date.now();
      list.push({id,name:'Wallet 1',enc});
      saveWallets(list); setActiveWalletId(id);
    }catch{}
  }
  return loadWallets();
}
function hasAnyWallet(){return migrateLegacyWallet().length>0}
async function saveWalletSlot(name,pk,password){
  const list=loadWallets();
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const key=await deriveKey(password,salt);
  const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(pk));
  const enc={salt:b64(salt),iv:b64(iv),ct:b64(ct)};
  const id='w'+Date.now();
  list.push({id,name:name||('Wallet '+(list.length+1)),enc});
  saveWallets(list); setActiveWalletId(id);
  // keep legacy key in sync with the active wallet so export/unlock paths still work
  localStorage.setItem('oggEnc',JSON.stringify(enc));
  return id;
}
async function decryptSlot(slot,password){
  const key=await deriveKey(password,ub64(slot.enc.salt));
  const pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:ub64(slot.enc.iv)},key,ub64(slot.enc.ct));
  return new TextDecoder().decode(pt);
}
function currentWalletName(){const s=loadWallets().find(w=>w.id===activeWalletId());return s?s.name:'Wallet'}

/* wallet manager modal */
let wmUnlockTarget=null;
function openWalletManager(){renderWmList();el('walletManagerModal').classList.remove('hidden')}
function closeWalletManager(){el('walletManagerModal').classList.add('hidden')}
function renderWmList(){
  const box=el('wmList'); if(!box)return;
  const list=loadWallets(), active=activeWalletId();
  if(!list.length){box.innerHTML='<div class="small" style="text-align:center;padding:12px">No wallets saved yet.</div>';return}
  box.innerHTML=list.map(s=>{
    const isActive=s.id===active;
    const addr=s.addr||'';
    return `<div class="wmRow${isActive?' active':''}">
      <span class="assetIcon coinImg" style="width:30px;height:30px;flex:0 0 30px"></span>
      <div class="wmInfo"><div class="wmName">${escapeHtml(s.name)}</div><div class="wmAddr">${addr?escapeHtml(addr):'tap Use to unlock'}</div></div>
      ${isActive?'<span class="wmActive">Active</span>':`<button class="wmUse" onclick="wmUse('${s.id}')">Use</button>`}
      <button class="assetRemove" onclick="wmRemove('${s.id}')">✕</button>
    </div>`;
  }).join('');
}
function wmUse(id){
  const s=loadWallets().find(w=>w.id===id); if(!s)return;
  wmUnlockTarget=id;
  // route through the existing unlock screen with this slot's enc
  localStorage.setItem('oggEnc',JSON.stringify(s.enc));
  setActiveWalletId(id);
  closeWalletManager();
  if(autoRefreshTimer){clearInterval(autoRefreshTimer);autoRefreshTimer=null;}
  wallet=null;
  if(el('unlockBox'))el('unlockBox').classList.remove('hidden');
  if(el('unlockPassword'))unlockPassword.value='';
  screen('screenSetup');
  toast('Enter the password for “'+s.name+'”.','info','Switch wallet');
}
function wmRemove(id){
  const list=loadWallets(); const s=list.find(w=>w.id===id); if(!s)return;
  openConfirm('Remove wallet',
    cfRow('Wallet',escapeHtml(s.name))+cfRow('Warning','This erases it from this device only'),
    'Remove wallet', ()=>{
      const nl=loadWallets().filter(w=>w.id!==id);
      saveWallets(nl);
      if(activeWalletId()===id){
        if(nl.length){setActiveWalletId(nl[0].id);localStorage.setItem('oggEnc',JSON.stringify(nl[0].enc));}
        else{localStorage.removeItem('oggEnc');setActiveWalletId('');}
        wmLogout(true);
      }
      renderWmList();
      toast('“'+s.name+'” removed. Keys erased from this device.','success','Wallet removed');
    });
}
function wmStartCreate(){closeWalletManager();wallet=null;if(autoRefreshTimer){clearInterval(autoRefreshTimer);autoRefreshTimer=null;}startCreate()}
function wmStartImport(){closeWalletManager();wallet=null;if(autoRefreshTimer){clearInterval(autoRefreshTimer);autoRefreshTimer=null;}startImport()}
function wmLogout(silent){
  closeWalletManager();
  wallet=null; pendingWallet=null;
  if(autoRefreshTimer){clearInterval(autoRefreshTimer);autoRefreshTimer=null;}
  ASSETBAL={}; currentBalanceWei=zeroWei(); currentStakedWei=zeroWei();
  if(el('unlockPassword'))unlockPassword.value='';
  if(el('address'))address.textContent='No wallet loaded';
  goSetup();
  if(!silent)toast('Logged out. Your wallets stay saved and encrypted.','success','Logged out');
}

/* stamp the active wallet's address into its slot after unlock (for the manager list) */
function stampActiveAddress(addr){
  const list=loadWallets(); const s=list.find(w=>w.id===activeWalletId());
  if(s && s.addr!==addr){s.addr=addr;saveWallets(list);}
}

/* wallet save flows */
async function saveGeneratedWallet(){
  try{
    if(!pendingWallet)throw new Error('Generate wallet first');
    if(!savedKeyCheck.checked)throw new Error('Please confirm you saved the private key');
    let pass=(createPassword.value||'').trim();
    if(!pass)throw new Error('Set wallet password first');
    const list=loadWallets();
    await saveWalletSlot('Wallet '+(list.length+1), pendingWallet.privateKey, pass);
    await enterWallet(pendingWallet,null);
    ok('Wallet created and saved');
  }catch(e){fail('Save wallet',e)}
}
async function saveImportedWallet(){
  try{
    await checkEthers();
    let pk=importPk.value.trim(); if(!pk)throw new Error('Paste private key first');
    let pass=(importPassword.value||'').trim(); if(!pass)throw new Error('Set wallet password first');
    let w=new ethers.Wallet(pk);
    const list=loadWallets();
    await saveWalletSlot('Wallet '+(list.length+1), pk, pass);
    await enterWallet(w,null);
    importPk.value=''; ok('Wallet imported and saved');
  }catch(e){fail('Import wallet',e)}
}

/* goSetup: show unlock only if a wallet exists; wire wallet name */
function goSetup(){
  screen('screenSetup');
  const box=el('unlockBox');
  if(box){ hasAnyWallet() ? box.classList.remove('hidden') : box.classList.add('hidden'); }
}

/* header switch button label + address ellipsis + stamp on enter */
(function(){ var base=enterWallet; enterWallet=async function(w,savePassword){
  await base(w,savePassword);
  const nm=currentWalletName();
  if(el('activeWalletName'))el('activeWalletName').textContent=nm;
  stampActiveAddress(w.address);
}; })();

/*  amber ember particles  */
(function(){
  function boot(){
    var canvas=document.getElementById('emberCanvas'); if(!canvas)return;
    var ctx=canvas.getContext('2d');
    var w=0,h=0,dpr=Math.min(window.devicePixelRatio||1,2),embers=[],raf=0;
    var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function mk(initial){return{x:Math.random()*w,y:initial?Math.random()*h:h+Math.random()*40,
      size:0.6+Math.random()*2.0,speed:0.15+Math.random()*0.7,phase:Math.random()*Math.PI*2,
      drift:0.0008+Math.random()*0.0016,alpha:0,target:0.10+Math.random()*0.26};}
    function resize(){w=window.innerWidth;h=window.innerHeight;dpr=Math.min(window.devicePixelRatio||1,2);
      canvas.width=w*dpr;canvas.height=h*dpr;canvas.style.width=w+'px';canvas.style.height=h+'px';
      ctx.setTransform(dpr,0,0,dpr,0,0);
      var n=Math.min(Math.round((w*h)/26000),46);embers=[];for(var i=0;i<n;i++)embers.push(mk(true));}
    function draw(){ctx.clearRect(0,0,w,h);
      for(var i=0;i<embers.length;i++){var e=embers[i];e.y-=e.speed;e.phase+=e.drift*16;e.x+=Math.sin(e.phase)*0.4;
        if(e.alpha<e.target)e.alpha+=0.006;
        if(e.y<-10){embers[i]=mk(false);continue;}
        var glow=e.size*3.4;var g=ctx.createRadialGradient(e.x,e.y,0,e.x,e.y,glow);
        g.addColorStop(0,'rgba(248,180,90,'+e.alpha+')');
        g.addColorStop(0.4,'rgba(248,150,40,'+(e.alpha*0.5)+')');
        g.addColorStop(1,'rgba(248,130,20,0)');
        ctx.beginPath();ctx.fillStyle=g;ctx.arc(e.x,e.y,glow,0,Math.PI*2);ctx.fill();}
      raf=requestAnimationFrame(draw);}
    resize();window.addEventListener('resize',resize);
    if(reduce){draw();cancelAnimationFrame(raf);}else{raf=requestAnimationFrame(draw);}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();

/* on first load, if wallets exist show unlock, else setup start already handles it */
setTimeout(()=>{ try{ migrateLegacyWallet(); if(el('activeWalletName'))el('activeWalletName').textContent=currentWalletName(); }catch{} },200);

(function(){
  var base=screen;
  screen=function(id){
    base(id);
    document.body.classList.toggle('onSplash', id==='screenStart');
  };
})();

function startCreate(){
  pendingWallet=null;
  if(el('newAddress'))el('newAddress').textContent='--';
  if(el('newPk'))el('newPk').value='';
  if(el('savedKeyCheck'))el('savedKeyCheck').checked=false;
  if(el('createPassword'))el('createPassword').value='';
  screen('screenCreate');
}
function wmStartCreate(){closeWalletManager();wallet=null;if(autoRefreshTimer){clearInterval(autoRefreshTimer);autoRefreshTimer=null;}startCreate()}

var unlockPickId=null;
function unlockWalletList(){ return migrateLegacyWallet(); }
function currentUnlockId(){
  const list=unlockWalletList();
  if(!list.length)return null;
  if(unlockPickId && list.some(w=>w.id===unlockPickId))return unlockPickId;
  const active=activeWalletId();
  if(active && list.some(w=>w.id===active))return active;
  return list[0].id;
}
function shortAddr(a){ return a ? (a.slice(0,10)+'…'+a.slice(-4)) : ''; }
function syncUnlockPill(){
  const list=unlockWalletList();
  const pill=el('unlockWalletPill'); if(!pill)return;
  if(list.length<=0){ pill.style.display='none'; return; }
  pill.style.display = list.length>1 ? 'flex' : 'none';   // only show picker if 2+
  const id=currentUnlockId();
  const s=list.find(w=>w.id===id);
  if(s && el('unlockWalletLabel'))el('unlockWalletLabel').textContent = s.name + (s.addr? '  ·  '+shortAddr(s.addr):'');
}
function toggleUnlockWalletMenu(ev){
  if(ev)ev.stopPropagation();
  const menu=el('unlockWalletMenu'); if(!menu)return;
  const open=menu.classList.contains('show'); closeAllPillMenus();
  if(open)return;
  const id=currentUnlockId();
  menu.innerHTML=unlockWalletList().map(s=>`<div class="pmItem${s.id===id?' sel':''}" onclick="pickUnlockWallet('${s.id}',event)">
    <span class="assetIcon coinImg"></span>
    <span class="pmName">${escapeHtml(s.name)}</span><span class="pmChain">${escapeHtml(shortAddr(s.addr||''))}</span></div>`).join('');
  menu.classList.add('show');
}
function pickUnlockWallet(id,ev){
  if(ev)ev.stopPropagation();
  unlockPickId=id; setActiveWalletId(id);
  const s=unlockWalletList().find(w=>w.id===id);
  if(s)localStorage.setItem('oggEnc',JSON.stringify(s.enc));   // route unlock at this wallet
  closeAllPillMenus(); syncUnlockPill();
  if(el('unlockPassword'))unlockPassword.value='';
}

/* make goSetup also prime the picker + active enc */
(function(){
  var base=goSetup;
  goSetup=function(){
    // ensure active wallet's enc is the one unlock will read
    var list=migrateLegacyWallet();
    var id=currentUnlockId();
    if(id){ var s=list.find(w=>w.id===id); if(s){ setActiveWalletId(id); localStorage.setItem('oggEnc',JSON.stringify(s.enc)); } }
    base();
    syncUnlockPill();
  };
})();

function forgetWallet(){
  const list=migrateLegacyWallet();
  const id=currentUnlockId();
  const s=list.find(w=>w.id===id);
  if(!s){ // nothing saved
    try{localStorage.removeItem('oggEnc')}catch{}
    if(el('unlockBox'))el('unlockBox').classList.add('hidden');
    return;
  }
  openConfirm('Forget wallet',
    cfRow('Wallet',escapeHtml(s.name)+(s.addr?' · '+shortAddr(s.addr):''))+
    cfRow('Warning','Erases this wallet from this device only'),
    'Forget wallet', ()=>{
      const nl=loadWallets().filter(w=>w.id!==id);
      saveWallets(nl);
      unlockPickId=null;
      if(nl.length){
        setActiveWalletId(nl[0].id);
        localStorage.setItem('oggEnc',JSON.stringify(nl[0].enc));
      }else{
        try{localStorage.removeItem('oggEnc')}catch{}
        setActiveWalletId('');
      }
      wallet=null; if(el('unlockPassword'))unlockPassword.value='';
      if(el('address'))address.textContent='No wallet loaded';
      if(!nl.length && el('unlockBox'))el('unlockBox').classList.add('hidden');
      syncUnlockPill();
      toast('“'+s.name+'” forgotten. Removed from this device.','success','Wallet forgotten');
    });
}

/* keep picker in sync whenever the setup screen is shown */
setTimeout(()=>{ try{ syncUnlockPill(); document.body.classList.toggle('onSplash', el('screenStart') && el('screenStart').classList.contains('active')); }catch{} },260);

