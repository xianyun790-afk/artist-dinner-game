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
    if(!Ctor){intent.current=false;setEnabled(false);setError('这个浏览器暂不支持语音，打字也能聊。');return;}
    const r=new Ctor();r.onstart=()=>setListening(true);r.lang='zh-CN';r.continuous=false;r.interimResults=true;current.current=r;let delivered=false,failed=false;
    r.onresult=e=>{let final='',partial='';for(let i=e.resultIndex;i<e.results.length;i++){const result=e.results[i];if(result.isFinal)final+=result[0].transcript;else partial+=result[0].transcript;}setInterim(partial||final);if(final.trim()&&!delivered){delivered=true;current.current=null;r.onstart=null;r.onend=null;r.onresult=null;r.onerror=null;r.abort();setListening(false);setInterim('');callback.current(final.trim());}};
    r.onerror=e=>{if(e.error==='no-speech'||e.error==='aborted')return;failed=true;intent.current=false;setEnabled(false);setError(e.error==='not-allowed'?'麦克风没有获准，打字也能继续聊。':e.error==='audio-capture'?'没有找到麦克风，打字也能聊。':'语音暂时没连上，可以重试或打字。');};
    r.onend=()=>{if(current.current===r)current.current=null;setListening(false);setInterim('');if(!failed&&!delivered&&intent.current&&!busy.current)restart.current=setTimeout(()=>startRef.current(),650);};
    try{r.start();}catch{current.current=null;intent.current=false;setEnabled(false);setError('语音没有启动，可以重试或打字。');}
  };startRef.current=start;
  const toggle=()=>{if(intent.current){stop();return;}setError('');intent.current=true;setEnabled(true);startRef.current();};
  useEffect(()=>{if(blocked)stopCurrent();else if(intent.current)restart.current=setTimeout(()=>startRef.current(),550);return()=>{if(restart.current)clearTimeout(restart.current);};},[blocked,stopCurrent]);
  useEffect(()=>{const visibility=()=>{if(document.hidden)stop();};document.addEventListener('visibilitychange',visibility);return()=>{intent.current=false;stopCurrent();document.removeEventListener('visibilitychange',visibility);};},[stop,stopCurrent]);
  return{enabled,listening,interim,error,toggle,stop};
}
