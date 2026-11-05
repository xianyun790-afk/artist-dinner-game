import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowRight, BookOpen, Check, Info, Moon, Palette, Sun, Volume2, Wind, X, Download, Trash2, UserRoundPlus } from 'lucide-react';
import { allArtists, artists } from '@/lib/artists';
import { choose, clearMemories, enterConversation, freeTalk, makeMark, nextNight, saveWork, relationship } from '@/lib/engine';
import { exportSave, loadSave, writeSave } from '@/lib/storage';
import { useSpeech } from '@/lib/useSpeech';
import type { Artist, Save } from '@/lib/types';
import { Modal } from '@/components/ui/Modal';
import { SalonScene } from '@/components/SalonScene';
import { RoomInput } from '@/components/RoomInput';
import { responderFor, roomReply } from '@/lib/room';
import { GuestBook } from '@/components/GuestBook';
import { Artwork } from '@/components/Artwork';
import { Activity } from '@/components/Activity';
import { detectKeyword, keywordInfo, type Keyword } from '@/lib/keywords';

type Panel='activity'|'guests'|'addArtist'|'works'|'settings'|'memory'|'end'|null;
export default function App(){
  const initial=useRef<ReturnType<typeof loadSave>|null>(null);if(!initial.current)initial.current=loadSave();
  const [save,setSave]=useState<Save>(initial.current.save);const [panel,setPanel]=useState<Panel>(null);const [toast,setToast]=useState(initial.current.error??'');const [saved,setSaved]=useState(true);const [voiceArtist,setVoiceArtist]=useState('vincent');const [confirmForget,setConfirmForget]=useState<string|null>(null);
  const [suggestion,setSuggestion]=useState<Keyword|null>(null);
  const [preferred,setPreferred]=useState<string|null>(null);
  const [reply,setReply]=useState<{artistId:string;text:string;thinking:boolean}|null>(null);
  const [pending,setPending]=useState(false);const replyTimer=useRef<ReturnType<typeof setTimeout>|null>(null);const previousSpeaker=useRef<string|null>(null);
  useEffect(()=>()=>{if(replyTimer.current)clearTimeout(replyTimer.current);},[]);
  const speech=useSpeech();const speechRef=useRef(speech);speechRef.current=speech;
  const catalog=useMemo(()=>allArtists(save.customArtists).map(a=>({...a,...save.voiceSettings[a.id]})),[save.customArtists,save.voiceSettings]);
  const guests=save.invited.map(id=>catalog.find(a=>a.id===id)).filter((a):a is Artist=>!!a);
  const active=catalog.find(a=>a.id===save.activeId);const person=active?save.people[active.id]:undefined;
  const last=person?.messages.filter(m=>m.who==='artist').at(-1);
  const closePanel=useCallback(()=>{setPanel(null);setConfirmForget(null);speechRef.current.stop();},[]);
  useEffect(()=>{const ok=writeSave(save);setSaved(ok);},[save]);
  useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(''),4500);return()=>clearTimeout(t);},[toast]);
  useEffect(()=>{if(saved)return;const handler=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',handler);return()=>window.removeEventListener('beforeunload',handler);},[saved]);
  const select=(id:string)=>{setPreferred(p=>p===id?null:id);setSuggestion(null);};
  const beginArt=()=>{if(save.ended){setPanel('end');return;}const a=active??guests[0];if(a){setSave(s=>choose(enterConversation(s,a),a,'create','要不要一起试一张？'));setPanel('activity');}};
  const toggleGuest=(id:string)=>setSave(s=>{if(s.invited.includes(id)){if(s.invited.length===1){setToast('至少留一位来宾，晚宴才好开始。');return s;}return{...s,invited:s.invited.filter(x=>x!==id),activeId:s.activeId===id?null:s.activeId};}if(s.invited.length>=5){setToast('这张长桌最多坐五位来宾。先空出一张椅子吧。');return s;}return{...s,invited:[...s.invited,id]};});
  const reorder=(id:string,dir:number)=>setSave(s=>{const ids=[...s.invited];const i=ids.indexOf(id),j=i+dir;if(i<0||j<0||j>=ids.length)return s;[ids[i],ids[j]]=[ids[j],ids[i]];return{...s,invited:ids};});
  const createArtist=(a:Artist)=>{setSave(s=>({...s,customArtists:[...s.customArtists,a],invited:s.invited.length<5?[...s.invited,a.id]:s.invited}));setToast(`${a.name}已加入来宾册${save.invited.length<5?'，也收到了今晚的请柬':'，可以为这位来宾空出一个席位'}。`);};
  const voiceTarget=catalog.find(a=>a.id===voiceArtist)??catalog[0];
  const updateVoice=(values:Partial<{rate:number;pitch:number;voiceURI:string}>)=>setSave(s=>({...s,voiceSettings:{...s.voiceSettings,[voiceTarget.id]:{rate:voiceTarget.rate,pitch:voiceTarget.pitch,voiceURI:voiceTarget.voiceURI,...values}}}));
  const send=(text:string)=>{
    const input=text.trim();if(!input||pending)return;
    const a=responderFor(input,guests,preferred,previousSpeaker.current);if(!a)return;
    speech.stop();setSuggestion(null);setPending(true);setReply({artistId:a.id,text:'',thinking:true});previousSpeaker.current=a.id;
    if(replyTimer.current)clearTimeout(replyTimer.current);
    replyTimer.current=setTimeout(()=>{
      const base=save.ended?nextNight(save):save;
      const result=freeTalk(enterConversation(base,a),a,input);const p=result.people[a.id];
      // Short topic replies are authored for this shared table, preserving the
      // emotion/boundary handling in the local conversation engine.
      const contextual=roomReply(a,input);if(contextual&&!/闭嘴|垃圾|蠢|必须|抱歉|对不起|不想|不要|别|不愿/.test(input))p.messages[p.messages.length-1].text=contextual;
      const line=p.messages.filter(m=>m.who==='artist').at(-1)?.text??a.quiet;
      setSave(result);setReply({artistId:a.id,text:line,thinking:false});setPending(false);speechRef.current.play(line,a);
      const key=detectKeyword(input);
      if((key==='invite'&&/邀请|来宾册|换.*人设/.test(input))||(key==='settings'&&/设置|音色/.test(input)))setSuggestion(key);
    },600);
  };
  const confirmSuggestion=()=>{const key=suggestion;setSuggestion(null);if(key==='art')beginArt();else if(key==='works')setPanel('works');else if(key==='invite')setPanel('guests');else if(key==='settings')setPanel('settings');else if(key==='memory')setPanel('memory');else if(key==='end')setPanel('end');};
  return <div className="app-shell fullscreen-dinner">
    <main className="main-content"><section className="stage-shell room-stage" aria-label="艺术家晚宴场景"><div className="stage-scroll"><div className="stage-inner"><SalonScene guests={guests} people={save.people} activeId={reply?.artistId??null} preferredId={preferred} onSelect={select} speaking={speech.speaking} reply={reply}/></div></div>
      <button className="room-add-artist" aria-label="添加艺术家" title="添加艺术家" aria-haspopup="dialog" onClick={()=>{speech.stop();setSuggestion(null);setPanel('addArtist');}}><UserRoundPlus size={21} strokeWidth={1.5}/></button>
      <RoomInput onSend={send} busy={pending||!!panel} speaking={speech.speaking} onStop={speech.stop} speechError={speech.error}/>
      {suggestion&&<aside className="keyword-popup room-suggestion" aria-label="对话中的小提议" role="status"><button className="keyword-dismiss icon-btn" aria-label="关闭小提议" onClick={()=>setSuggestion(null)}><X size={14}/></button><p>{keywordInfo[suggestion].title}</p><button className="keyword-action" onClick={confirmSuggestion}>{keywordInfo[suggestion].action}<ArrowRight size={14}/></button></aside>}
    </section></main>
    {panel==='activity'&&active&&person&&<Modal title={`和${active.name}一起画一会儿`} onClose={closePanel}><Activity artist={active} person={person} onChoose={id=>setSave(s=>choose(s,active,id))} onMark={(mark,paths)=>setSave(s=>makeMark(s,active,mark,paths))} onSave={title=>setSave(s=>saveWork(s,active,title))}/></Modal>}
    {(panel==='guests'||panel==='addArtist')&&<Modal title="给喜欢的人，一张请柬。" subtitle="选人、换座位，或邀请一位只属于你的艺术家。" onClose={closePanel} wide><GuestBook initialCreating={panel==='addArtist'} catalog={catalog} save={save} onToggle={toggleGuest} onReorder={reorder} onCreate={createArtist} onPreview={a=>speech.play(a.greeting,a)} onClose={closePanel}/>{speech.error&&<p className="inline-notice">{speech.error}</p>}</Modal>}
    {panel==='works'&&<Modal title="这一晚，我们留下的。" subtitle="每一笔都有来处，意见不同的版本也值得收好。" onClose={closePanel} wide>{save.works.length?<div className="works-grid">{[...save.works].reverse().map(w=>{const a=catalog.find(a=>a.id===w.artistId)??artists[0];return <article className="work-card" key={w.id}><Artwork artist={a} mark={w.mark} paths={w.paths}/><div className="work-meta"><small>第{w.night}夜 · {w.disagreement?'保留不同意见':'共同试稿'}</small><h3>{w.title}</h3><p>你 × {a.name} <span>{w.shared?'已展示到餐桌':'仅你们两人可见'}</span></p><div className="work-actions"><button className="text-btn" onClick={()=>{setSave(s=>({...s,works:s.works.map(x=>x.id===w.id?{...x,shared:!x.shared}:x)}));setToast(w.shared?'作品已收回私有作品夹。已经看过的人不会因此失忆。':'只展示这张作品，私聊与争执没有公开。');}}>{w.shared?'收回作品夹':'摆到桌上'}</button><button className="text-btn" onClick={()=>{const link=document.createElement('a');const svg=document.querySelector(`[data-work="${w.id}"] svg`);if(svg){link.href=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml'}));link.download=`${w.title}.svg`;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);}}}><ArrowDownToLine size={13}/>下载</button></div></div><div data-work={w.id} hidden><Artwork artist={a} mark={w.mark} paths={w.paths}/></div></article>;})}</div>:<div className="empty-state"><Palette size={35} strokeWidth={1}/><h3>还没有一张画，也没关系。</h3><p>靠近任何一位来宾，问问“要不要一起画点什么”。</p><button className="button" onClick={()=>{closePanel();beginArt();}}>试着接下一笔 <ArrowRight size={15}/></button></div>}<div className="modal-bottom"><span>作品保存在这台设备的浏览器中</span><button className="text-btn" onClick={()=>exportSave(save)}><Download size={14}/>导出完整存档</button></div></Modal>}
    {panel==='settings'&&<Modal title="把这一晚调得舒服些。" subtitle="声音属于人设的演绎，不是艺术家本人原声。" onClose={closePanel}><div className="settings-body"><div className="settings-section"><h3><Sun size={16}/>今晚的光</h3><div className="scene-options"><button className={save.scene==='dusk'?'selected':''} onClick={()=>setSave(s=>({...s,scene:'dusk'}))}><Sun size={20}/><strong>柔和白光</strong><small>白色背景与白色桌布</small></button><button className={save.scene==='rain'?'selected':''} onClick={()=>setSave(s=>({...s,scene:'rain'}))}><Wind size={20}/><strong>安静白光</strong><small>保持简约的白色场景</small></button></div></div><div className="settings-section"><h3><Volume2 size={16}/>来宾的声音</h3><label>选择艺术家<select value={voiceTarget.id} onChange={e=>{speech.stop();setVoiceArtist(e.target.value);}}>{catalog.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label>设备音色<select value={voiceTarget.voiceURI??''} onChange={e=>updateVoice({voiceURI:e.target.value})}><option value="">自动选择中文音色</option>{speech.voices.map(v=><option key={v.voiceURI} value={v.voiceURI}>{v.name} · {v.lang}</option>)}</select></label><div className="form-pair"><label>语速 <span>{voiceTarget.rate.toFixed(2)}×</span><input type="range" min="0.65" max="1.25" step="0.05" value={voiceTarget.rate} onChange={e=>updateVoice({rate:Number(e.target.value)})}/></label><label>音调 <span>{voiceTarget.pitch.toFixed(2)}</span><input type="range" min="0.7" max="1.3" step="0.05" value={voiceTarget.pitch} onChange={e=>updateVoice({pitch:Number(e.target.value)})}/></label></div><button className="button secondary" onClick={()=>speech.play(voiceTarget.greeting,voiceTarget)}><Volume2 size={15}/>试听{voiceTarget.name}</button>{speech.error&&<p className="inline-notice">{speech.error}</p>}<p className="form-note">使用浏览器／系统提供的合成音色。不同设备可用音色不同，可随时停止播放。语音输入使用浏览器识别服务，部分浏览器可能联网处理音频；仅在点击麦克风后开始，关闭对话即停止。当前未接入云端 AI 或声音克隆。</p></div><div className="settings-section"><h3><Info size={16}/>关于这场晚宴</h3><p className="about-copy">一场允许不同意见的艺术沙龙。当前使用本地分支剧本，文字输入按话题规则响应；不连接云端大模型。人物为有骨架的 2.5D 公仔图像，包含基础姿态动画，没有逐字口型。</p><button className="text-btn" onClick={()=>exportSave(save)}><Download size={14}/>导出作品与存档</button></div></div></Modal>}
    {panel==='memory'&&<Modal title="有些事，他们记得。" subtitle="每个人只记得自己参与的对话。你可以清除这些记忆。" onClose={closePanel}><div className="memory-list">{catalog.filter(a=>save.people[a.id]?.messages.length||save.people[a.id]?.memories.length).map(a=>{const p=save.people[a.id];return <article className="memory-person" key={a.id}><div><img src={a.image} alt=""/><h3>{a.name}<small>{relationship(p)}</small></h3><button className="icon-btn" aria-label={`清除${a.name}的记忆`} onClick={()=>setConfirmForget(a.id)}><Trash2 size={15}/></button></div>{p.memories.length?p.memories.map(m=><p key={m.id}><span>第{m.night}夜</span>{m.text}</p>):<p>我们刚刚开始交谈，还没有新的约定。</p>}{confirmForget===a.id&&<div className="forget-confirm"><p>清除这位来宾的聊天与记忆？已保存的作品会保留，不再用于主动回认。</p><button className="button small" onClick={()=>{setSave(s=>clearMemories(s,a.id));setConfirmForget(null);}}>确认清除</button><button className="text-btn" onClick={()=>setConfirmForget(null)}>取消</button></div>}</article>;})}{!Object.keys(save.people).length&&<div className="empty-state"><BookOpen size={30}/><p>先和一位来宾说说话，记忆会从具体的小事开始。</p></div>}</div></Modal>}
    {panel==='end'&&<Modal title={save.ended?'今晚的余光，已经收好。':'今天，就到这里？'} subtitle="不必完成所有对话，留下来的东西下次还能接着看。" onClose={closePanel}><div className="ending-body"><div className="ending-symbol"><Moon size={35} strokeWidth={1}/><span>第 {save.night} 夜</span></div><div className="ending-stats"><span><strong>{Object.values(save.people).filter(p=>p.messages.length).length}</strong>位交谈的来宾</span><span><strong>{save.works.filter(w=>w.night===save.night).length}</strong>张留下的试稿</span></div><p>今晚也许没有达成一致，但每一个认真听过的瞬间，都算数。</p>{!saved&&<p className="inline-notice">浏览器保存失败，请先导出存档再离开。</p>}<button className="button" onClick={()=>{if(save.ended){setSave(s=>nextNight(s));closePanel();}else{setSave(s=>({...s,ended:true,activeId:null}));speech.stop();}}}>{save.ended?'开启下一夜':'收好今晚'}<ArrowRight size={16}/></button><button className="text-btn" onClick={()=>exportSave(save)}><Download size={14}/>导出存档</button></div></Modal>}
    {toast&&<div className="toast" role="status"><Check size={16}/>{toast}<button aria-label="关闭提示" onClick={()=>setToast('')}><X size={14}/></button></div>}
    {!saved&&<div className="save-error" role="alert">进度未保存 <button onClick={()=>setSaved(writeSave(save))}>重试保存</button><button onClick={()=>exportSave(save)}>导出存档</button></div>}
  </div>;
}
