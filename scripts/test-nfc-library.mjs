import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile('src/features/nfc/content.ts','utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {buildMediaReport,libraryEntries,resolveLibraryMedia,fileUrl}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
for (const type of ['video','audio','file']) {
 const record={session_id:'same-session',type,title:'作品集.pdf',url:'https://example.com/a.pdf',thumbnail:'https://example.com/cover.jpg',duration:5};
 const report=buildMediaReport(record);
 assert.equal(report.episodes[0].template_id,`nfc_${type}`);
 assert.equal(report.episodes[0].copywriting.h2,'作品集.pdf');
 assert.equal(report.episodes[0].copywriting.body,'');
 const media=resolveLibraryMedia({share_id:'s1',report});
 assert.equal(media.type,type);assert.equal(media.title,record.title);
 assert.ok(media.url.startsWith(record.url));
 if(type==='audio') assert.equal(report.episodes[0].images.length,0);
 else assert.equal(report.episodes[0].images[0].original_filename,record.title);
}
assert.equal(fileUrl('https://example.com/a.pdf?name=original','new.pdf'),'https://example.com/a.pdf?name=original');
assert.equal(fileUrl('https://example.com/a.pdf?x=1','作品.pdf'),'https://example.com/a.pdf?x=1&name='+encodeURIComponent('作品.pdf'));
const entries=libraryEntries([
 {share_id:'normal',report_title:'普通画匣子',is_owner:true,created_at:'2026-01-01'},
 {share_id:'old-file',report_title:'NFC文件: 旧资料.pdf',is_owner:true,created_at:'2026-11-01',cover_image:'https://example.com/a.pdf'},
 {share_id:'other',report_title:'NFC文件: 别人的.pdf',is_owner:false,created_at:'2026-11-02'},
 {share_id:'group-1',report_title:'原画匣子',is_owner:true,created_at:'2026-10-01'},
],[{group_id:'group-1',group_name:'参与的合集',latest_created_at:'2026-10-01'},{group_id:'__nfc__',group_name:'内部收纳'}]);
assert.equal(entries.length,3);assert.equal(entries[0].title,'旧资料.pdf');assert.equal(entries[0].cover,'');
assert.equal(entries.filter(e=>e.sourceId==='group-1').length,1);
assert.ok(!entries.some(e=>e.sourceId==='other'||e.sourceId==='__nfc__'));
assert.throws(()=>resolveLibraryMedia({report:{report_title:'NFC文件: 旧资料',episodes:[{template_id:'nfc_file',images:[{image_url:'https://example.com/a.pdf',archived:true}]}]}}),/归档/);
assert.throws(()=>resolveLibraryMedia({report:{report_title:'NFC文件: 已删',episodes:[{template_id:'nfc_file',images:[]}]}}),/移除/);
console.log('PASS: media round-trip, exact filename, empty body, stable URL, legacy records, owner filtering, group dedupe, archived/missing files');
