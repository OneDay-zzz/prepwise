// Voice for the chat, using the browser's own speech features. Nothing here costs tokens.

export const speechLanguages=[{id:'en-US',label:'English'},{id:'zh-CN',label:'中文'}] as const;
export type SpeechLanguage=typeof speechLanguages[number]['id'];
const LANGUAGE_KEY='prepwise-speech-language';
const MAX_CHUNK=220;
const HAN=/\p{Script=Han}/u;

/** What's worth hearing in a Markdown reply: no code blocks, images, addresses, or formatting marks. */
export function speechText(markdown:string) {
  return markdown
    .replace(/^ {0,3}(```|~~~)[\s\S]*?(^ {0,3}\1[^\n]*$|(?![\s\S]))/gm,'')
    .replace(/!\[[^\]]*\]\([^)]*\)/g,'')
    .replace(/\[([^\]]*)\]\([^)]*\)/g,'$1')
    .replace(/https?:\/\/\S+/g,'')
    .replace(/<[^>\n]+>/g,'')
    .replace(/^[ \t]*\|?[ \t:|-]+\|[ \t:|-]*$/gm,'')
    .replace(/^[ \t]*\|(.*)\|[ \t]*$/gm,(_,row:string)=>row.split('|').map(cell=>cell.trim()).join(', '))
    .replace(/^[ \t]*([-*_])([ \t]*\1){2,}[ \t]*$/gm,'')
    .replace(/^ {0,3}#{1,6}[ \t]+/gm,'')
    .replace(/^[ \t]*>[ \t]?/gm,'')
    .replace(/^[ \t]*[-*+][ \t]+(\[[ xX]\][ \t]+)?/gm,'')
    .replace(/(\*\*|__|~~|`)/g,'')
    .replace(/(^|[\s(])[*_](?=\S)([^*_\n]*?\S)[*_]/g,'$1$2')
    .replace(/[ \t]+/g,' ')
    .replace(/\n{3,}/g,'\n\n')
    .trim();
}

/** Chrome can stop partway through a long utterance, so speech goes one short piece at a time. A piece with Chinese in it gets a Chinese voice. */
export function speechChunks(text:string) {
  const chunks:{text:string;lang:SpeechLanguage}[]=[];
  for(const part of text.split(/(?<=[.!?])\s+|(?<=[。！？])|\n+/u)) {
    const sentence=part.trim();
    if(!sentence)continue;
    const lang:SpeechLanguage=HAN.test(sentence) ? 'zh-CN' : 'en-US';
    const last=chunks.at(-1);
    if(last && last.lang===lang && last.text.length+sentence.length<MAX_CHUNK) {last.text+=`${lang==='zh-CN' ? '' : ' '}${sentence}`;continue;}
    for(let start=0;start<sentence.length;start+=MAX_CHUNK)chunks.push({text:sentence.slice(start,start+MAX_CHUNK),lang});
  }
  return chunks;
}

/** Puts spoken words where the cursor was, with spaces only where they're needed. */
export function joinDictation(before:string,spoken:string,after:string) {
  const words=spoken.trim();
  if(!words)return before+after;
  const gap=(left:string,right:string)=>left && right && !/\s$/.test(left) && !/^\s/.test(right) && !HAN.test(left.at(-1)!) && !HAN.test(right[0]) && !/^[.,!?;:]/.test(right) ? ' ' : '';
  return before+gap(before,words)+words+gap(words,after)+after;
}

export function savedSpeechLanguage():SpeechLanguage {
  try {
    const saved=localStorage.getItem(LANGUAGE_KEY);
    return speechLanguages.find(language=>language.id===saved)?.id ?? 'en-US';
  }catch{return 'en-US';}
}
export function saveSpeechLanguage(language:SpeechLanguage) {
  try {localStorage.setItem(LANGUAGE_KEY,language);}catch{/* It just won't be remembered. */}
}

type RecognitionEvent={results:ArrayLike<ArrayLike<{transcript:string}>>};
type Recognition={lang:string;continuous:boolean;interimResults:boolean;onresult:((e:RecognitionEvent)=>void)|null;onerror:((e:{error:string})=>void)|null;onend:(()=>void)|null;start():void;stop():void;abort():void};
const recognitionClass=()=>{
  if(typeof window==='undefined')return undefined;
  const speech=window as unknown as {SpeechRecognition?:new()=>Recognition;webkitSpeechRecognition?:new()=>Recognition};
  return speech.SpeechRecognition ?? speech.webkitSpeechRecognition;
};
export const canDictate=()=>!!recognitionClass();
export const canReadAloud=()=>typeof window!=='undefined' && 'speechSynthesis' in window;

const DICTATION_ERRORS:Record<string,string>={
  'not-allowed':'Allow the microphone for this site in your browser, then try again.',
  'service-not-allowed':'Your browser’s speech service is turned off or blocked.',
  'audio-capture':'No microphone was found.',
  network:'Couldn’t reach your browser’s speech service. Check your connection.',
  'no-speech':'Didn’t hear anything. Try the mic again.',
  'language-not-supported':'Your browser can’t recognize this language.',
};

export type Dictation={stop():void;abort():void};
let activeDictation:Dictation|null=null;

/** Listens until stopped. After abort, nothing more arrives, so a late result can't refill a message that's been sent. */
export function startDictation(lang:string,onText:(spoken:string)=>void,onEnd:(error?:string)=>void):Dictation|null {
  const Speech=recognitionClass();
  if(!Speech)return null;
  activeDictation?.abort();
  stopSpeaking();
  const recognition=new Speech();
  recognition.lang=lang;
  recognition.continuous=true;
  recognition.interimResults=true;
  let live=true;
  let failure:string|undefined;
  const finish=()=>{
    if(!live)return;
    live=false;
    if(activeDictation===handle)activeDictation=null;
    onEnd(failure);
  };
  const handle:Dictation={
    stop:()=>{try {recognition.stop();}catch{finish();}},
    abort:()=>{finish();try {recognition.abort();}catch{/* It has already ended. */}},
  };
  recognition.onresult=e=>{
    if(!live)return;
    onText(Array.from(e.results,result=>result[0].transcript).join(''));
  };
  recognition.onerror=e=>{if(e.error!=='aborted')failure=DICTATION_ERRORS[e.error] || 'Dictation stopped because of a speech error.';};
  recognition.onend=finish;
  try {recognition.start();}
  catch{failure='Couldn’t start the microphone.';finish();return null;}
  activeDictation=handle;
  return handle;
}

let speakingId='';
let speakingUtterance:SpeechSynthesisUtterance|null=null;
const listeners=new Set<()=>void>();
const setSpeaking=(id:string)=>{speakingId=id;listeners.forEach(listener=>listener());};
export const speakingMessage=()=>speakingId;
export const subscribeSpeaking=(listener:()=>void)=>{listeners.add(listener);return ()=>{listeners.delete(listener);};};

export function stopSpeaking() {
  if(!canReadAloud())return;
  speakingUtterance=null;
  window.speechSynthesis.cancel();
  if(speakingId)setSpeaking('');
}

/** Reads a reply aloud. Starting another reply, or dictating, stops the one playing. */
export function readAloud(id:string,markdown:string) {
  if(!canReadAloud())return;
  activeDictation?.abort();
  stopSpeaking();
  const chunks=speechChunks(speechText(markdown));
  if(!chunks.length)return;
  setSpeaking(id);
  const next=(index:number)=>{
    if(index>=chunks.length) {speakingUtterance=null;setSpeaking('');return;}
    const utterance=new SpeechSynthesisUtterance(chunks[index].text);
    utterance.lang=chunks[index].lang;
    // Held in a variable because Chrome can drop the end event of one it has garbage collected.
    speakingUtterance=utterance;
    utterance.onend=()=>{if(speakingUtterance===utterance)next(index+1);};
    utterance.onerror=()=>{if(speakingUtterance===utterance) {speakingUtterance=null;setSpeaking('');}};
    window.speechSynthesis.speak(utterance);
  };
  next(0);
}

// Browsers can keep talking through a reload.
if(canReadAloud())window.addEventListener('pagehide',()=>window.speechSynthesis.cancel());
