/*
    Local dev server for the quote tool and admin panel.

    Run this when you want /admin to save directly into pricing.json. It serves
    the static app files and exposes a tiny local-only API:
      GET /api/pricing  -> reads pricing.json
      PUT /api/pricing  -> writes pricing.json

    This is intentionally not a hosted backend yet. It listens on 127.0.0.1 so
    it is for local VSCode/admin work only.
*/
const fs = require('fs/promises');
const http = require('http');
const path = require('path');

const PORT = process.env.PORT || 8008;
const ROOT = __dirname;
const PRICING_FILE = path.join(ROOT, 'pricing.json');

const MIME_TYPES = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
};

async function readRequestJson(req) {
    const chunks = [];
    let size = 0;

    for await (const chunk of req) {
        size += chunk.length;
        if (size > 2 * 1024 * 1024) {
            throw new Error('Request body is too large');
        }
        chunks.push(chunk);
    }

    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function send(res, statusCode, body, contentType = 'text/plain; charset=utf-8') {
    res.writeHead(statusCode, {
        'Content-Type': contentType,
        'Cache-Control': 'no-store',
    });
    res.end(body);
}

async function handlePricing(req, res) {
    try {
        if (req.method === 'GET') {
            const text = await fs.readFile(PRICING_FILE, 'utf8');
            send(res, 200, text, 'application/json; charset=utf-8');
            return;
        }

        if (req.method === 'PUT') {
            const pricing = await readRequestJson(req);
            const formatted = `${JSON.stringify(pricing, null, 2)}\n`;
            JSON.parse(formatted);
            await fs.writeFile(PRICING_FILE, formatted, 'utf8');
            send(res, 200, JSON.stringify({ ok: true }), 'application/json; charset=utf-8');
            return;
        }

        send(res, 405, 'Method not allowed');
    } catch (error) {
        const statusCode = req.method === 'PUT' ? 400 : 500;
        const action = req.method === 'PUT' ? 'write' : 'read';
        send(res, statusCode, `Unable to ${action} pricing.json: ${error.message}`);
    }
}

async function serveStatic(req, res, pathname) {
    const decodedPath = decodeURIComponent(pathname);
    const relativePath = decodedPath === '/' ? 'index.html' : decodedPath.slice(1);
    let filePath = path.resolve(ROOT, relativePath);

    if (!filePath.startsWith(`${ROOT}${path.sep}`) && filePath !== ROOT) {
        send(res, 403, 'Forbidden');
        return;
    }

    try {
        const stat = await fs.stat(filePath);
        if (stat.isDirectory()) {
            filePath = path.join(filePath, 'index.html');
        }

        const content = await fs.readFile(filePath);
        const ext = path.extname(filePath);
        send(res, 200, content, MIME_TYPES[ext] || 'application/octet-stream');
    } catch (error) {
        if (error.code === 'ENOENT') {
            send(res, 404, 'Not found');
            return;
        }
        send(res, 500, `Unable to serve file: ${error.message}`);
    }
}

const server = http.createServer(async (req, res) => {
    try {
        const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);

        if (url.pathname === '/api/pricing') {
            await handlePricing(req, res);
            return;
        }

        if (req.method !== 'GET' && req.method !== 'HEAD') {
            send(res, 405, 'Method not allowed');
            return;
        }

        await serveStatic(req, res, url.pathname);
    } catch (error) {
        send(res, 500, `Server error: ${error.message}`);
    }
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`Quote tool running at http://127.0.0.1:${PORT}/`);
    console.log(`Admin panel running at http://127.0.0.1:${PORT}/admin/`);
});
