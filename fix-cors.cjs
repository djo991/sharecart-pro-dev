const fs = require('fs');
const files = [
    'app/routes/api.customer.share-carts.jsx',
    'app/routes/api.customer.share-carts.$id.jsx',
    'app/routes/api.customer.share-carts.$id.toggle.jsx'
];
const corsBlock = `export function getCorsHeaders(request) {
  const origin = request.headers?.get('Origin') || '';
  const allowed = (
    origin.endsWith('.myshopify.com') ||
    origin.endsWith('.shopify.com') ||
    origin === 'https://extensions.shopifycdn.com'
  ) ? origin : 'https://extensions.shopifycdn.com';

  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function corsJson(request, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...getCorsHeaders(request) },
  });
}`;

for (let file of files) {
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace(/const CORS_HEADERS = \{[\s\S]*?function corsJson\(data, status = 200\) \{[\s\S]*?\}\n/g, corsBlock + '\n');
    content = content.replace(/headers: CORS_HEADERS/g, 'headers: getCorsHeaders(request)');
    content = content.replace(/corsJson\(/g, 'corsJson(request, ');
    fs.writeFileSync(file, content);
}
console.log('Fixed CORS in customer api routes');
