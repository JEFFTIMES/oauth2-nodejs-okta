// dependencies
const debug       = require('debug')('nodejs-regular-webapp2:server');
const http        = require('http');
const https       = require('https');
const fs          = require('fs');
const path        = require('path');
const dotenv      = require('dotenv').config();
const Router      = require('router');
const finalhandler = require('finalhandler');
const compression = require('compression');
const crypto      = require('crypto');


// env and configuration.
const port = process.env.PORT || 5000;

// configuration for communicating with the authorization server.
const authConfig = {
  client_id: process.env.CLIENT_ID,
  client_secret: process.env.CLIENT_SECRET,
  redirect_uri: process.env.ORIGIN + `${port}` + process.env.REDIRECT_PATH,
  authorization_endpoint: process.env.AUTHORIZATION_ENDPOINT,
  token_endpoint: process.env.TOKEN_ENDPOINT,
  requested_scopes: "openid profile email"
};

// local storage to persistent the state, verifier, code challenge, and the tokens.
const localStorage = {};

// creating router for directing incoming requests.
const router = Router();

// loading the static page with a given filename.
const loadPage =  function ( req, res, next, fileName ) {
  const {method, url, headers, body} = req;
  const filename = path.join(__dirname, 'public', fileName);
  res.writeHead(200, { 'Content-Type': 'text/html' });
  rStream = fs.createReadStream(filename);
  rStream
    .on('open', 
      function (){
        console.log(`opening file...${filename}`);
        rStream.pipe(res);
      }
    )
    .on('error', 
      function (err){
        next(err);
      }
    );
}

// generating radom string for the state and verifier.
// to use the asynchronous version of randomBytes(), new a Promise.
const generateRadomString = function (length = 56) {
  return new Promise((resolve,reject) => {
    crypto.randomBytes(length, (err, buffer)=>{
      if(err) reject(err);
      resolve(buffer.toString('hex'));
    })    
  }); 
}

// composing the request url for diverting the user to the authorization server.
const composeAuthorizationURL = async function (config, localStor) {
  
  // generating the state, verifier and code challenge.
  const state = await generateRadomString();
  
  // store them in localStorage for further comparison.
  localStor.state = state;
  
  // constructing the authorization request url.
  const url = authConfig.authorization_endpoint 
        + "?response_type=code"
        + "&client_id="+encodeURIComponent(config.client_id)
        + "&state="+encodeURIComponent(localStor.state)
        + "&scope="+encodeURIComponent(config.requested_scopes)
        + "&redirect_uri="+encodeURIComponent(config.redirect_uri)
        ;
  return url;
}

// creating server with router.
// registering finalhandler to process errors. 
const server = http.createServer(function onRequest(req, res){
  router(req,res,finalhandler(req,res));
});

// router use middleware compression().
router.use(compression());

// middleware to process all three conditional '/' , '/index' , '/index.html' as the home page.
router.use( (req, res, next) => {
  if(req.url === '/' || req.url === '/index' || req.url === '/index.html'){
    loadPage( req, res, next, 'index.html' );
  }else{
    next();
  }   
});

// redirect user to authorization server.
router.route('/login').get(function (req, res, next){
  
  // have to complete the response cycle inside the promise.then()
  // due to the composeRedirectURL is an asynchronous function.
  composeAuthorizationURL(authConfig, localStorage)
    .then((authUrl)=>{
      console.log('authUrl: ',authUrl);
      res.writeHead( 307, {'Location': authUrl});
      res.end();
    })
    .catch((error)=>{
      next(error);
    });
});

// the user will be redirected to /profile page when got the authorization.
router.route('/profile').get(function (req, res, next){
  console.log('goes in to /profile.html ...');
  loadPage(req, res, next, 'profile.html');
})

// the user comes back from authorization server. 
// compare the returned state with local stored, 
// if the states are the same, asking the access token from the server's token endpoint.
router.route('/authorized').get(function (req, res, next){
  const returnedUrl = new URL(req.url, `http://localhost:${port}/`);
  console.log('returned url: ', returnedUrl.toString());
  if(returnedUrl.searchParams.get('error')){
    next(new Error(returnedUrl.error));
  }
  if(returnedUrl.searchParams.get('state') !== localStorage.state){
    next(new Error('state is not the same.'))
  }
  if(returnedUrl.searchParams.get('code')){
    
    // setting up url for accessing the token endpoint.
    const tokenEndpointUrl = new URL(process.env.TOKEN_ENDPOINT);
    
    // setting up method and headers for the request.
    const options = {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
      }
    }
    
    // exchange data to be sent to the token endpoint in the request's body.
    const dataExchange = {
      grant_type: 'authorization_code',
      code: returnedUrl.searchParams.get('code'),
      redirect_uri: authConfig.redirect_uri,
      client_id: authConfig.client_id,
      client_secret: process.env.CLIENT_SECRET
    }  
    
    // creating body string: 
    // grant_type=authorization_type&code=RETURNED_CODE&client_id=XXX&redirect_uri=XXX&client_secret=XXX
    const requestBody = Object.keys(dataExchange).map(key => key + '=' + dataExchange[key]).join('&');   
    console.log(requestBody);
    
    // defining the response processing callback.
    const tokenExchangeRequestCallback = function (response) {
      //check status
      console.log('token exchange response status: ', response.statusCode);
      let responseBody = [];
      response.on('data', (data) => {
        console.log('get a chunk...')
        responseBody.push(data);
      })
      response.on('end', () => {
        responseBody = Buffer.concat(responseBody).toString();
        console.log('token exchange response body: ', JSON.parse(responseBody));
        if(response.statusCode === 200){
          localStorage.accessToken = responseBody.access_token;
          localStorage.idToken=responseBody.id_token;
          localStorage.state = '';
          console.log('tokens saved.');
          // redirecting user to the profile page.
          res.writeHead( 307, {'Location': `http://localhost:${port}${process.env.PROFILE_PATH}`});
          res.end();
        }else{ // status code !== 200
          next( new Error(JSON.stringify(responseBody)));
        }
      })
    }

    // creating the request object.
    const tokenExchangeRequest = https.request(tokenEndpointUrl, options, tokenExchangeRequestCallback);
    // writing the body of the request.
    tokenExchangeRequest.write(requestBody);
    //firing the token exchange request.
    tokenExchangeRequest.end();
  }else{
    next(new Error('response without code property.'))
  }
});

server.listen(port);
server.on('error', onError);
server.on('listening', onListening);

// define an error handler for the server errors.
function onError(error){
  if (error.syscall !== 'listen') {
    throw error;
  }

  var bind = typeof port === 'string'
    ? 'Pipe ' + port
    : 'Port ' + port;

  // handle specific listen errors with friendly messages
  switch (error.code) {
    case 'EACCES':
      console.error(bind + ' requires elevated privileges');
      process.exit(1);
      break;
    case 'EADDRINUSE':
      console.error(bind + ' is already in use');
      process.exit(1);
      break;
    default:
      throw error;
  }
}

// define a handler for the listening events.
function onListening(event) {
  const addr = server.address();
  const bind = typeof addr === 'string'
    ? 'pipe ' + addr
    : 'port ' + addr.port;
  debug('Listening on ' + bind);
  console.log('Listening on ' + bind);
}





