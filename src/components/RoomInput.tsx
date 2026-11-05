import {useEffect,useRef,useState} from 'react';
import {ArrowUp,Keyboard,Mic,Square,X} from 'lucide-react';
import {useRoomVoice} from '@/lib/useRoomVoice';
export function RoomInput({onSend,busy,speaking,onStop,speechError}:{onSend:(text:string)=>void;busy:boolean;speaking:boolean;onStop:()=>void;speechError:string}){
  const [typing,setTyping]=useState(false),[input,setInput]=useState('');const field=useRef<HTMLInputElement>(null);
  const voice=useRoomVoice(onSend,busy||speaking);
  useEffect(()=>{if(typing)field.current?.focus();},[typing]);
  useEffect(()=>{if(typing)voice.stop();},[typing]);
  const submit=()=>{if(!input.trim())return;onStop();voice.stop();onSend(input);setInput('');};
  return <div className="room-input-wrap">
    <p className="heard-line" aria-live="polite">{voice.interim||voice.error||speechError||''}</p>
    {typing?<form className="room-type" onSubmit={e=>{e.preventDefault();submit();}}><input ref={field} aria-label="想聊点什么" placeholder="说点什么，大家都在听…" value={input} maxLength={400} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Escape')setTyping(false);}}/><button type="submit" aria-label="发送" disabled={!input.trim()||busy}><ArrowUp size={18}/></button><button type="button" aria-label="收起打字" onClick={()=>setTyping(false)}><X size={17}/></button></form>:
      <div className="room-voice"><button className={`speak-button ${voice.enabled?'enabled':''}`} onClick={()=>{onStop();voice.toggle();}} aria-label={voice.enabled?'暂停倾听':'开口聊聊'} aria-pressed={voice.enabled}>{voice.enabled?<span className={`voice-bars ${voice.listening?'hearing':''}`}><i/><i/><i/><i/><i/></span>:<Mic size={19} strokeWidth={1.5}/>}<span>{voice.enabled?(speaking?'听听他们说…':busy?'有人在想…':voice.listening?'在听，你说…':'正在打开麦克风…'):'开口聊聊'}</span></button><button className="room-keyboard" aria-label="打字聊天" onClick={()=>{onStop();setTyping(true);}}><Keyboard size={20} strokeWidth={1.4}/></button>{speaking&&<button className="room-keyboard" aria-label="打断回复" onClick={onStop}><Square size={15}/></button>}</div>}
  </div>;
}
