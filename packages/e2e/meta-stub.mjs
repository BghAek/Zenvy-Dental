import { createServer } from 'node:http';

// Stands in for graph.facebook.com while the E2E suite runs: accepts any send
// and answers the way Meta does, so the outbound half of the inbox round-trip
// is exercised for real without a WhatsApp number. The API points at it via
// META_GRAPH_BASE_URL (unset everywhere else — see apps/api/src/whatsapp/graph.ts).
// Plain .mjs so Playwright can start it as a webServer with no build step.

const port = Number(process.env.PORT ?? 4010);

createServer((req, res) => {
  // GET is Playwright's readiness probe; every real call is a POST /messages.
  if (req.method !== 'POST') {
    res.writeHead(200, { 'content-type': 'text/plain' }).end('meta stub');
    return;
  }
  req.resume();
  req.on('end', () => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ messages: [{ id: `wamid.e2e-${Date.now()}` }] }));
  });
}).listen(port, () => console.log(`Meta Graph stub listening on ${port}`));
