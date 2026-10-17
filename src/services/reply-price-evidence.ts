/** Compare complete written amounts without treating sentence punctuation as a decimal. */
export function unpublishedReplyPrice(reply:string,training:string){
 const normalize=(value:string)=>{const parts=value.replace(/,/g,'').replace(/\.+$/,'').split('.'),whole=parts[0].replace(/^0+(?=\d)/,'')||'0',fraction=(parts[1]||'').replace(/0+$/,'');return whole+(fraction?'.'+fraction:'');};
 const evidence=new Set((training.match(/\d+(?:,\d{3})*(?:\.\d+)?/g)||[]).map(normalize));
 const quoted=reply.match(/(?:Rs\.?|PKR|\$|USD|EUR|GBP)\s*([0-9,.]+)|(?:fee|cost|charge|price|total|monthly)(?:\s+is\s+|\s+of\s+|[\s:=])*([0-9,.]+)/ig)||[];
 return quoted.some(price=>{const value=price.replace(/[^0-9.,]/g,'');return /\d/.test(value)&&!evidence.has(normalize(value));});
}
