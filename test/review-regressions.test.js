import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {startFakeClaude,startCuss,client} from './helpers.js';
let app,ai;
before(async()=>{
 ai=await startFakeClaude((text,step)=>step===0 ? [{type:'tool_use',name:'draft_email',input:{course_id:101,recipients:[{id:501,name:'Dr. Maya Chen'}],subject:'Office hours',body:'Could I attend Wednesday?'}}] : [{type:'text',text:'Draft prepared.'}]);
 app=await startCuss({ANTHROPIC_BASE_URL:ai.url});
});
after(()=>{app?.stop();ai?.close();});
test('review: draft-only request stays unsent with auto-send enabled',async()=>{
 const c=client(app.url);await c.loginDemo('Draft Test');
 await c.json('/api/settings',{method:'POST',json:{autoSendEmails:true}});
 const r=await c.chat('review-draft-only','Draft an email; do not send it.');
 const draft=r.events.find(e=>e.type==='card')?.card;
 assert.equal(draft.status,'draft','draft-only tool call sent the message');
});
test('review: simultaneous send requests deliver a draft only once',async()=>{
 const c=client(app.url);await c.loginDemo('Race Test');
 const r=await c.chat('review-duplicate','Draft an email.');
 const draft=r.events.find(e=>e.type==='card')?.card;
 const responses=await Promise.all([1,2].map(()=>c.json(`/api/drafts/${draft.id}/send`,{method:'POST',json:{}})));
 const count=(await c.json('/api/impact')).counts.email_sent;
 assert.equal(count,1,JSON.stringify({responses,count}));
});
