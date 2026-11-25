// Last Omen without a connection. Three kinds of file pass through here:
//   the page      fresh whenever it can be had; otherwise (or when asked with ?saved) the copy
//                 the page put by itself once its whole build was on the device
//   e/<hash>/...  the engine, named by what it holds: fetched once, kept, never looked at again
//   the rest      small pictures: the kept copy at once, refreshed behind it
// pck/ (the pack's bundles) is the page's own business and passes straight through.
// Other sites live on this origin, so only caches this game named are ever touched.
const CACHE = 'last-omen-2';
const NOT_YET = '<!doctype html><meta name="viewport" content="width=device-width">' +
	'<body style="background:#000;color:#888;font:16px system-ui;text-align:center;' +
	'margin:40vh 24px 0">Last Omen needs a connection to finish downloading.</body>';
caches.delete('last-omen-1');   // the worker before this one kept its files there

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

async function page(u) {
	const saved = async () => (await caches.open(CACHE)).match('index.html');
	const live = () => fetch(u.href, { cache: 'no-store' });
	if (u.searchParams.has('saved')) { return (await saved()) || live(); }
	try { return await live(); } catch (e) {
		return (await saved()) || new Response(NOT_YET, { headers: { 'content-type': 'text/html' } });
	}
}

async function kept(e, u, refresh) {
	const c = await caches.open(CACHE);
	const key = u.origin + u.pathname;
	const hit = await c.match(key);
	if (hit && !refresh) { return hit; }
	const fresh = fetch(e.request).then((r) => {
		if (r.status === 200) { e.waitUntil(c.put(key, r.clone())); }
		return r;
	});
	if (hit) { e.waitUntil(fresh.catch(() => {})); return hit; }
	return fresh;
}

self.addEventListener('fetch', (e) => {
	const u = new URL(e.request.url);
	if (e.request.method !== 'GET' || u.origin !== self.location.origin) { return; }
	const name = u.pathname.split('/').pop();
	if (name === 'sw.js' || u.pathname.includes('/pck/')) { return; }
	if (name === 'version.json') {
		e.respondWith(fetch(e.request).catch(() => new Response('{}',
			{ headers: { 'content-type': 'application/json' } })));
	} else if (name === '' || name === 'index.html') {
		e.respondWith(page(u));
	} else {
		e.respondWith(kept(e, u, !u.pathname.includes('/e/')));
	}
});
