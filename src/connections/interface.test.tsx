import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import { QrPairingPanel } from '../instance-hub/qr/QrPairingPanel';
test('transferred QR interface never renders synthetic QR or Connected as an actual session',()=>{
 for(const evidence of ['synthetic','unavailable']as const){const html=renderToStaticMarkup(<QrPairingPanel evidence={evidence} statusInput={{status:'connected',jid:'fixture'}} qrCode="data:image/png;base64,NOT_REAL"/>);assert.doesNotMatch(html,/<img|WhatsApp Connected|Active Session Protected/);}
 for(const status of ['unpaired','repairing','disconnected']){const html=renderToStaticMarkup(<QrPairingPanel evidence="verified" statusInput={{status}}/>);assert.doesNotMatch(html,/WhatsApp Connected|<img/);}
 const connecting=renderToStaticMarkup(<QrPairingPanel evidence="verified" statusInput={{status:'connecting'}}/>);assert.match(connecting,/Preparing WhatsApp Connection/);
});
test('registered connection engine excludes skeleton provider, legacy worker graph and plaintext auth folders',async()=>{
 const output=await build({entryPoints:['src/connections/engine.ts'],bundle:true,write:false,metafile:true,platform:'node',packages:'external'});
 const files=Object.keys(output.metafile!.inputs).join('\n');assert.doesNotMatch(files,/baileys-transport-provider|bot-worker\.ts|bot-context|db-service|appwrite|billing|inventory|record-flow/);
 assert.match(files,/bot-worker-lifecycle-service|baileys-transport-normalizer|conversation\/pipeline|gemini\/provider/);
});
