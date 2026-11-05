import type {Artist} from './types';
export const topicFor=(a:Artist)=>a.id==='monet'?'光影':a.id==='vincent'?'色彩':a.id==='dali'?'梦境':a.id==='georgia'?'日常':'灵感';
const themes:Record<string,RegExp>={
  monet:/光影|阳光|日落|夕阳|影子|风景|睡莲|花园|光线|倒影/,
  vincent:/色彩|颜色|黄色|蓝色|红色|向日葵|星空|画笔|笔触/,
  dali:/梦境|做梦|梦见|梦到|奇怪|荒诞|超现实|时钟|想象|梦/,
  georgia:/日常|生活|今天|吃|面包|水果|梨|累|难过|开心|心情|烦|焦虑/,
};
export function responderFor(text:string,guests:Artist[],preferredId:string|null,previousId:string|null):Artist|undefined{
  // A direct address takes precedence over the selected seat and topic.
  const named=guests.find(a=>[a.name,a.fullName,a.english,...(a.id==='georgia'?['欧姬弗','奥姬芙']:[])].some(name=>name&&text.toLowerCase().includes(name.toLowerCase())));
  if(named)return named;
  if(preferredId){const picked=guests.find(a=>a.id===preferredId);if(picked)return picked;}
  const themed=guests.find(a=>themes[a.id]?.test(text));if(themed)return themed;
  // An unaddressed follow-up continues the last speaker; no setup is required.
  return guests.find(a=>a.id===previousId)??guests.find(a=>a.id==='georgia')??guests[0];
}
export function roomReply(a:Artist,text:string):string|null{
  if(/不想|不要|别|不愿/.test(text))return null;
  if(/你好|晚上好|嗨|哈喽/.test(text))return a.greeting;
  if(a.id==='monet'&&themes.monet.test(text)){
    if(/日落|夕阳/.test(text))return '日落最有意思的，是你刚想记住它，它已经换了一种颜色。我常常来不及，只好明天再等。';
    return '我会先看光落在哪里。同一块白色，在不同光线里会变。我倒愿意多看一会儿。';
  }
  if(a.id==='vincent'&&themes.vincent.test(text)){
    if(/蓝色/.test(text))return '我会想试试蓝旁边放一点黄。两种颜色挨着时，和单独看不太一样。';
    if(/黄色|向日葵/.test(text))return '我偏爱有力的黄。可只看黄还不够，旁边放什么颜色，也得一起看。';
    return '我在意两种颜色挨着时发生了什么。有时只改旁边那一小块，感觉就完全变了。';
  }
  if(a.id==='dali'&&themes.dali.test(text))return /梦见|梦到/.test(text)?'我先不替梦找寓意。你说的那个意外，倒值得接着听。':'如果在想象里只改一条规则，我会先让椅子自己挑客人。它得有点眼光。';
  if(a.id==='georgia'&&themes.georgia.test(text)){
    if(/累|难过|烦|焦虑/.test(text))return '那就先歇会儿。想聊什么，再聊。';
    if(/开心|高兴/.test(text))return '听着不错。是什么好事？';
    return '日常的小事也可以聊。不必先找个特别的话题。';
  }
  return null;
}
