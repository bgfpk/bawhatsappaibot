import { detectCustomerActualLanguage,detectExplicitLanguageRequest,resolveCustomerReplyLanguage } from '../services/customer-language-preference-service';
export function automaticLanguage(profile:any,text:string){
 const actual=detectCustomerActualLanguage(text),neutral=/^(?:ok(?:ay)?|thanks?|yes|no|ji|\d+)[.! ]*$/i.test(text);
 const result=resolveCustomerReplyLanguage({profile,preferredLanguage:profile.customerLanguagePreference||actual||'english',latestText:neutral&&!detectExplicitLanguageRequest(text)?'':text});
 return {language:result.language,profile:{...profile,...result.patch}};
}
