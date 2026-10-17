import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { build } from 'esbuild';
test('converted engine imports no order persistence, CRM, billing, legacy text provider or database connector',async()=>{
 const output=await build({entryPoints:['src/conversation/pipeline.ts'],bundle:true,packages:'external',platform:'node',write:false,metafile:true});
 assert.doesNotMatch(Object.keys(output.metafile!.inputs).join('\n'),/order-persistence|crm-service|billing-service|ai-text-provider|database\.ts/);
});
test('active campaign UI removes obsolete controls/navigation and keeps publication plus catalogue',()=>{
 const files=['src/campaigns/ui/AssistantEditor.tsx','src/campaigns/ui/CampaignWorkspace.tsx','src/campaigns/ui/CampaignList.tsx','src/gemini/ui/TestAssistant.tsx'];
 const ui=files.map(p=>fs.readFileSync(p,'utf8')).join('\n');
 assert.doesNotMatch(ui,/Advanced Details|Business timezone|Supported languages|Reply language|Business or assistant name|Daily reply limit|Daily token limit|Enforce operating hours|Maximum reply length|Previous messages to remember/);
 assert.match(ui,/Main AI instructions/);assert.match(ui,/Save Draft/);assert.match(ui,/TestAssistant/);
 const shell=fs.readFileSync('src/staging/StageShell.tsx','utf8');assert.match(shell,/Products & Services/);assert.doesNotMatch(shell,/Knowledge Base|Conversation Memory|Languages/);
});
