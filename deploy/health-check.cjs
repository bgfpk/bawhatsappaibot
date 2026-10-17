const http = require('node:http');
const request = http.get({socketPath:'/state/http.sock', path:'/api/health'}, response => {
  let text = '';
  response.on('data', chunk => text += chunk);
  response.on('end', () => {
    try { process.exit(response.statusCode === 200 && JSON.parse(text).storage === true ? 0 : 1); }
    catch { process.exit(1); }
  });
});
request.setTimeout(4000, () => { request.destroy(); process.exit(1); });
request.on('error', () => process.exit(1));
