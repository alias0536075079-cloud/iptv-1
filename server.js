const http = require('http');
const https = require('https');
const url = require('url');

const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const targetPath = parsedUrl.path;

    if (targetPath === '/' || targetPath === '/favicon.ico') {
        res.writeHead(200, { 'Content-Type': 'text/plain;charset=UTF-8' });
        res.end('IPTV M3U8 Rewriting Proxy is running!');
        return;
    }

    const initialTarget = `http://103.176.90.137${targetPath}`;

    function makeProxyRequest(currentUrl, originalReq) {
        const client = currentUrl.startsWith('https') ? https : http;

        client.get(currentUrl, {
            headers: {
                'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18',
                'Referer': 'http://103.176.90.137/',
                'Accept': '*/*'
            }
        }, (proxyRes) => {
            // تتبع التحويل (Redirect)
            if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
                let redirectUrl = proxyRes.headers.location;
                if (redirectUrl.startsWith('/')) {
                    const parsedOriginal = new URL(currentUrl);
                    redirectUrl = `${parsedOriginal.protocol}//${parsedOriginal.host}${redirectUrl}`;
                }
                return makeProxyRequest(redirectUrl, originalReq);
            }

            const host = originalReq.headers['host'];
            const protocol = 'https://';
            const contentType = proxyRes.headers['content-type'] || '';
            const isM3U8 = currentUrl.includes('.m3u8') || contentType.includes('mpegurl') || contentType.includes('text');

            if (isM3U8) {
                // إذا كان الملف عبارة عن M3U8، نقوم بقراءته وتعديل الروابط داخله
                let data = '';
                proxyRes.on('data', chunk => { data += chunk; });
                proxyRes.on('end', () => {
                    // استبدال روابط الـ http والـ IPs بـ رابط البروكسي الخاص بك لتبقى آمنة
                    let modifiedData = data.replace(/http:\/\/([^\/]+)(\/[^\s]+)?/g, (match, p1, p2) => {
                        return `${protocol}${host}${p2 || ''}`;
                    });

                    // إذا كانت الروابط داخل ملف الـ m3u8 نسبية (تبدأ بدون http)
                    modifiedData = modifiedData.replace(/^(?!#)(.+\.(ts|m4s|m3u8).*)$/gm, (match) => {
                        if (match.startsWith('http')) return match;
                        const basePath = currentUrl.substring(0, currentUrl.lastIndexOf('/') + 1);
                        const absoluteTarget = new URL(match, basePath).toString();
                        // تحويل الرابط المطلق ليخضع للبروكسي
                        const parsedAbs = new URL(absoluteTarget);
                        return `${protocol}${host}${parsedAbs.pathname}${parsedAbs.search}`;
                    });

                    res.writeHead(proxyRes.statusCode, {
                        ...proxyRes.headers,
                        'Access-Control-Allow-Origin': '*',
                        'Content-Length': Buffer.byteLength(modifiedData)
                    });
                    res.end(modifiedData);
                });
            } else {
                // إذا كان جزء فيديو مباشر (TS)، يتم تمريره بسلاسة وبدون تعديل
                res.writeHead(proxyRes.statusCode, {
                    ...proxyRes.headers,
                    'Access-Control-Allow-Origin': '*'
                });
                proxyRes.pipe(res);
            }

        }).on('error', (err) => {
            if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'text/plain;charset=UTF-8' });
                res.end('Proxy Error: ' + err.message);
            }
        });
    }

    makeProxyRequest(initialTarget, req);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
