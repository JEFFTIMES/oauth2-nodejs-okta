# OAuth 2.0 practice

##1. Authentication Code Flow (client secret)

###1.1. reference
https://developer.okta.com/docs/concepts/oauth-openid/#authorization-code-flow

###1.2. code 
server-client-secret.js

###1.3. core APIs

1. router.route('/path').get((req,res,next)=>{})
2. finalhandler(req, res)
3. crypto.randomBytes(len, (err,buffer)=>{})
4. new Promise((resolve,reject)=>{
    asyncFunc(params, (err,result)=>{ 
      if(err) return reject(err); 
      return resolve(result);
    })
  })
5. encodeURIComponent(str)
6. urlObj = new URL(req.url, baseUrl)
7. urlobj.searchParams.get('key')
8. Object.keys(obj).map((key)=> {key + '=' + obj[key]}).join('&')
9. http.request(url, option, responseCallback)
10. response.on('data', (data)=>{})
11. response.on('end',()=>{})
12. Buffer.concat()
13. JSON.parse()
14. response.writeHead(307, {'Location' : url})

##2. Authorization Code flow with PKCE

###2.1. reference
https://developer.okta.com/docs/concepts/oauth-openid/#authorization-code-flow-with-pkce

###2.2. core APIs
1. crypto.createHash('sha256').update(str).digest(encoder)
2. Base64String.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g,'');
3. base64url(string)
