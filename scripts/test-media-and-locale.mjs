import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
function load(file, deps = {}, globals = {}) {
 const source = fs.readFileSync(file, 'utf8');
 const code = ts.transpileModule(source, {compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,resolveJsonModule:true,esModuleInterop:true}}).outputText;
 const exports = {}; vm.runInNewContext(code,{exports,require:name=>name in deps?deps[name]:require(name),console,Promise,Map,Set,URL,Blob,Date,...globals},{filename:file}); return exports;
}
const log={info(){},warn(){}};
let type='album', fail=false, groupCalls=0;
const route=load('src/services/contentNavigation.ts',{'@/api/share':{fetchShare:async()=>{if(fail)throw Error('offline');return{share_type:type,group_id:'a'}},fetchPermissions:async()=>({share_type:'album'})},'@/api/group':{fetchGroupMemories:async()=>{groupCalls++;return{memories:[{},{}]}}},'@/utils/logger':{logger:log}});
assert.equal(await route.resolveContentDestination('a'),'/pages/album/index?id=a');assert.equal(groupCalls,0);
type=undefined;assert.equal(await route.resolveContentDestination('a'),'/pages/album/index?id=a');
type='memory';assert.equal(await route.resolveContentDestination('a'),'/pages/group/index?id=a');
fail=true;await assert.rejects(route.resolveContentDestination('a'),/offline/);
const vue=require('vue'), pinia=require('pinia');pinia.setActivePinia(pinia.createPinia());const auth=vue.reactive({token:'a',user:{entitlements:['preset_links']}});
const debug=load('src/stores/debug.ts',{'vue':vue,'pinia':pinia,'./auth':{useAuthStore:()=>auth}}).useDebugStore();
assert.equal(debug.enabled,false);debug.setEnabled(true);assert.equal(debug.enabled,true);auth.token='b';await vue.nextTick();assert.equal(debug.enabled,false);auth.user.entitlements=[];debug.setEnabled(true);assert.equal(debug.enabled,false);
let cleanup, calls=0, closeCount=0, resolvePermission, ticks, errors=[],ready=[];
class Recorder {static isTypeSupported(type){return type.startsWith('audio/webm')} constructor(_stream,opts){this.mimeType=opts.mimeType;this.state='inactive'}start(){this.state='recording';Recorder.current=this}stop(){this.state='inactive';this.ondataavailable({data:new Blob(['audio'],{type:'audio/webm'})});this.onstop()}}
const browser=load('src/composables/useBrowserRecorder.ts',{'vue':{ref:value=>({value}),onUnmounted:fn=>{cleanup=fn}},'@/utils/logger':{logger:log}},{window:{isSecureContext:true},navigator:{mediaDevices:{getUserMedia(){calls++;return new Promise(r=>resolvePermission=r)}}},MediaRecorder:Recorder,setInterval:fn=>{ticks=fn;return 1},clearInterval(){},URL:{createObjectURL:()=> 'blob:recording',revokeObjectURL(){}}});
const rec=browser.useBrowserRecorder({onAudioReady:a=>ready.push(a),onError:e=>errors.push(e)});
const pending=rec.startRecording();await rec.startRecording();assert.equal(calls,1);resolvePermission({getTracks:()=>[{stop(){closeCount++}}]});await pending;assert.equal(rec.isRecording.value,true);rec.stopRecording();assert.equal(ready.length,1);assert.equal(ready[0].format,'webm');assert.equal(closeCount,1);assert.equal(rec.isRecording.value,false);cleanup();
const pending2=browser.useBrowserRecorder({onAudioReady:a=>ready.push(a)}).startRecording();cleanup();resolvePermission({getTracks:()=>[{stop(){closeCount++}}]});await pending2;assert.equal(ready.length,1);assert.equal(closeCount,2);
let watchPref, intersection, mutation, visibility;const prefs={autoplay:true};const videos=[0,1].map(()=>({isConnected:true,plays:0,pauses:0,closest(){return this.disabled?{}:null},play(){this.plays++;return Promise.resolve()},pause(){this.pauses++}}));
class IO {constructor(fn){intersection=fn}observe(){}unobserve(){}}class MO {constructor(fn){mutation=fn}observe(){}}
load('src/services/viewportPlayback.ts',{'vue':{watch:(_get,fn)=>watchPref=fn},'@/stores/playback':{usePlaybackStore:()=>prefs}},{IntersectionObserver:IO,MutationObserver:MO,document:{hidden:false,body:{},querySelectorAll:()=>videos,addEventListener:(_event,fn)=>visibility=fn}}).installViewportPlayback();
intersection(videos.map(target=>({target,isIntersecting:true,intersectionRatio:1})));assert.equal(videos[0].plays,1);assert.equal(videos[1].plays,1);assert.equal(videos[0].muted,true);
intersection([{target:videos[0],isIntersecting:false,intersectionRatio:0}]);assert.ok(videos[0].pauses);prefs.autoplay=false;watchPref();const count=videos[1].plays;mutation([{type:'attributes'}]);assert.equal(videos[1].plays,count);
const dict=JSON.parse(fs.readFileSync('src/i18n/en.json'));for(const f of ['ui-source.json','runtime-source.json','dynamic-source.json'])for(const phrase of JSON.parse(fs.readFileSync('src/i18n/'+f)))assert.ok(dict[phrase], 'Missing English: '+phrase);
let storedLocale=null;const interceptors={};const language=load('src/i18n/index.ts',{'vue':vue,'./en.json':dict},{getCurrentPages:()=>[],navigator:{language:'en-US'},localStorage:{getItem:()=>storedLocale,setItem:(_key,value)=>storedLocale=value},uni:{getStorageSync:()=>'',setStorageSync(){},addInterceptor:(name,hooks)=>interceptors[name]=hooks},document:{documentElement:{lang:''}}});
// Production may expose only statically imported uni APIs; installation cannot inspect uni[name].
language.installLocale({mixin(){}});assert.equal(Object.keys(interceptors).length,4);
const callback=()=>{};const toast={title:'保存',success:callback};interceptors.showToast.invoke(toast);assert.equal(toast.title,'Save');assert.equal(toast.success,callback);
const modal={title:'用户自己的标题'};interceptors.showModal.invoke(modal);assert.equal(modal.title,'用户自己的标题');assert.equal(modal.confirmText,'OK');
assert.equal(language.locale.value,'en');assert.equal(language.t('已追加 3 个媒体'),'Added 3 media items');assert.equal(language.t('将「用户原文」绑定到 UID 末四位 abcd 的卡片？不会重新上传。'),'Link “用户原文” to the card ending in abcd? No upload is needed.');language.setLocale('zh');assert.equal(storedLocale,'zh');assert.equal(language.t('保存'),'保存');
assert.equal(language.t('用户自己的标题'),'用户自己的标题');
console.log('PASS: album/legacy/group routes, failure without guessing, debug authorization/default/reset, browser recording lifecycle/race/unmount, independent visible video autoplay/opt-out, locale catalog coverage');
