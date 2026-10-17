// src/services/whatsapp-cloud-api-normalizer.test.ts
import test from "node:test";
import assert from "node:assert";
import {
  normalizeCloudApiWebhookMessage,
  normalizeCloudApiStatusWebhook,
} from "./whatsapp-cloud-api-normalizer.ts";
import { NormalizedIncomingMessage, NormalizedStatusUpdate } from "./whatsapp-transport-types.ts";

function makePayload(message:any){
  return {
    object:"whatsapp_business_account",
    entry:[{changes:[{value:{messages:[message]}}]}]
  } as any;
}
function makeStatusPayload(status:any){
  return {
    object:"whatsapp_business_account",
    entry:[{changes:[{value:{statuses:[status]}}]}]
  } as any;
}

test("normalize text message",()=>{
  const payload=makePayload({
    from:"contact-b7fef06f39af@example.invalid",
    id:"msg-1",
    timestamp:"1353143134",
    type:"text",
    text:{body:"Hello"},
  });
  const norm=normalizeCloudApiWebhookMessage(payload) as NormalizedIncomingMessage;
  assert.equal(norm.messageType,"text");
  assert.equal(norm.text,"Hello");
  assert.equal(norm.hasMedia,false);
});

test("normalize image with caption",()=>{
  const payload=makePayload({
    from:"contact-b7fef06f39af@example.invalid",
    id:"msg-2",
    timestamp:"1103294457",
    type:"image",
    image:{id:"media-1",mime_type:"image/jpeg",caption:"Pic"},
  });
  const norm=normalizeCloudApiWebhookMessage(payload) as NormalizedIncomingMessage;
  assert.equal(norm.messageType,"image");
  assert.equal(norm.mediaId,"media-1");
  assert.equal(norm.mediaMimeType,"image/jpeg");
  assert.equal(norm.caption,"Pic");
  assert.equal(norm.hasMedia,true);
});

test("normalize voice message",()=>{
  const payload=makePayload({
    from:"contact-b7fef06f39af@example.invalid",
    id:"msg-3",
    timestamp:"1212856740",
    type:"voice",
    voice:{id:"media-2",mime_type:"audio/ogg"},
  });
  const norm=normalizeCloudApiWebhookMessage(payload) as NormalizedIncomingMessage;
  assert.equal(norm.messageType,"voice");
  assert.equal(norm.mediaId,"media-2");
  assert.equal(norm.mediaMimeType,"audio/ogg");
  assert.equal(norm.hasMedia,true);
});

test("normalize location",()=>{
  const payload=makePayload({
    from:"contact-b7fef06f39af@example.invalid",
    id:"msg-4",
    timestamp:"1971292741",
    type:"location",
    location:{latitude:"12.34",longitude:"56.78"},
  });
  const norm=normalizeCloudApiWebhookMessage(payload) as NormalizedIncomingMessage;
  assert.equal(norm.messageType,"location");
  assert.equal(norm.text,"12.34,56.78");
  assert.equal(norm.hasMedia,true);
});

test("unknown type",()=>{
  const payload=makePayload({
    from:"contact-b7fef06f39af@example.invalid",
    id:"msg-5",
    timestamp:"1453741721",
    type:"foobar",
  });
  const norm=normalizeCloudApiWebhookMessage(payload) as NormalizedIncomingMessage;
  assert.equal(norm.messageType,"unknown");
  assert.equal(norm.hasMedia,false);
});

test("invalid payload",()=>{
  assert.equal(normalizeCloudApiWebhookMessage({}) as any,null);
});

test("status webhook",()=>{
  const payload=makeStatusPayload({
    id:"msg-10",
    status:"sent",
    timestamp:"1704173201",
  });
  const norm=normalizeCloudApiStatusWebhook(payload) as NormalizedStatusUpdate;
  assert.equal(norm.providerMessageId,"msg-10");
  assert.equal(norm.status,"sent");
});
