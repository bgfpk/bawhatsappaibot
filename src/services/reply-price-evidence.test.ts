import test from 'node:test';
import assert from 'node:assert/strict';
import { unpublishedReplyPrice } from './reply-price-evidence';
test('published price evidence handles punctuation and compares complete amounts',()=>{
 assert.equal(unpublishedReplyPrice('Price: PKR 123.','{"price":"PKR 123"}'),false);
 assert.equal(unpublishedReplyPrice('Price: PKR 12.','{"price":"PKR 123"}'),true);
 assert.equal(unpublishedReplyPrice('USD 1,234.50.','USD 1234.5'),false);
 assert.equal(unpublishedReplyPrice('PKR 999.','PKR 123'),true);
});
