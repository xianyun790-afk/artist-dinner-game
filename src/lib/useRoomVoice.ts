import {useCallback,useEffect,useRef,useState} from 'react';
type Result={isFinal:boolean;0:{transcript:string}};
interface Recognition{lang:string;continuous:boolean;interimResults:boolean;onstart:(()=>void)|null;onresult:((e:{resultIndex:number;results:{length:number;[i:number]:Result}})=>void)|null;onerror:((e:{error:string})=>void)|null;onend:(()=>void)|null;start:()=>void;stop:()=>void;abort:()=>void}
type VoiceWindow=Window&{SpeechRecognition?:new()=>Recognition;webkitSpeechRecognition?:new()=>Recognition};
// One permission gesture starts a conversation session. Pause the recognizer
// during every reply to keep the device's own voice out of the next turn.
export function useRoomVoice(onText:(text:string)=>void,blocked:boolean){
  const [enabled,setEnabled]=useState(false),[listening,setListening]=useState(false),[interim,setInterim]=useState(''),[error,setError]=useState('');
  const callback=useRef(onText);callback.current=onText;
  const intent=useRef(false),busy=useRef(blocked),current=useRef<Recognition|null>(null),restart=useRef<ReturnType<typeof setTimeout>|null>(null),startRef=useRef<()=>void>(()=>{});
  busy.current=blocked;
  const stopCurrent=useCallback(()=>{if(restart.current)clearTimeout(restart.current);restart.current=null;const r=current.current;current.current=null;if(r){r.onstart=null;r.onend=null;r.onresult=null;r.onerror=null;r.abort();}setListening(false);setInterim('');},[]);
  const stop=useCallback(()=>{intent.current=false;setEnabled(false);stopCurrent();},[stopCurrent]);
  const start=()=>{
    if(!intent.current||busy.current||current.current||document.hidden)return;
    const w=window as VoiceWindow,Ctor=w.SpeechRecognition??w.webkitSpeechRecognition;
    if(!Ctor){intent.current=false;setEnabled(false);setError('这个浏览器暂不支持语音输入，可以换 Safari／Chrome 或打字聊天。');return;}
    const r=new Ctor();r.onstart=()=>setListening(true);r.lang='zh-CN';r.continuous=false;r.interimResults=true;current.current=r;let delivered=false,failed=false;
    r.onresult=e=>{let final='',partial='';for(let i=e.resultIndex;i<e.results.length;i++){const result=e.results[i];if(result.isFinal)final+=result[0].transcript;else partial+=result[0].transcript;}setInterim(partial||final);if(final.trim()&&!delivered){delivered=true;current.current=null;r.onstart=null;r.onend=null;r.onresult=null;r.onerror=null;r.abort();setListening(false);setInterim('');callback.current(final.trim());}};
    r.onerror=e=>{if(e.error==='no-speech'||e.error==='aborted')return;failed=true;intent.current=false;setEnabled(false);setError(e.error==='not-allowed'?'麦克风或语音识别没有获准，请在浏览器网站设置中允许后重试。':e.error==='audio-capture'?'没有找到麦克风，可以先打字聊天。':e.error==='service-not-allowed'?'浏览器没有允许语音识别，可以换 Safari／Chrome 或先打字。':e.error==='language-not-supported'?'浏览器识别服务暂不支持中文，可以先打字聊天。':'语音输入未连上浏览器识别服务，可以重试或先打字聊天。');};
    r.onend=()=>{if(current.current===r)current.current=null;setListening(false);setInterim('');if(!failed&&!delivered&&intent.current&&!busy.current)restart.current=setTimeout(()=>startRef.current(),650);};
    try{r.start();}catch{current.current=null;intent.current=false;setEnabled(false);setError('语音输入没有启动，可以重试或先打字聊天。');}
  };startRef.current=start;
  const toggle=()=>{if(intent.current){stop();return;}setError('');intent.current=true;setEnabled(true);startRef.current();};
  useEffect(()=>{if(blocked)stopCurrent();else if(intent.current)restart.current=setTimeout(()=>startRef.current(),180);return()=>{if(restart.current)clearTimeout(restart.current);};},[blocked,stopCurrent]);
  useEffect(()=>{const visibility=()=>{if(document.hidden)stop();};document.addEventListener('visibilitychange',visibility);return()=>{intent.current=false;stopCurrent();document.removeEventListener('visibilitychange',visibility);};},[stop,stopCurrent]);
  return{enabled,listening,interim,error,toggle,stop};
}
