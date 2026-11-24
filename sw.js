// Last Omen's offline cache. The game is a 60 MB pack plus a 35 MB engine: fetched once,
// then served from the phone, so a launch needs no network and re-downloads nothing.
//   the page itself  -> network first (so a new build is seen), the saved copy when offline
//   version.json     -> network only; offline it answers "{}" and the page stays as it is
//   the pack         -> cache first, keyed by its build; older packs are dropped
//   everything else  -> cache first, refreshed in the background
const CACHE = 'last-omen-1';
const leaf = (url) => new URL(url).pathname.split('/').pop() || 'index.html';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

async function page(req) {
	const c = await caches.open(CACHE);
	try {
		const r = await fetch(req, { cache: 'no-store' });
		if (r.ok) { c.put('index.html', r.clone()); }
		return r;
	} catch (e) {
		return (await c.match('index.html')) || Response.error();
	}
}

async function pack(req) {
	const c = await caches.open(CACHE);
	const build = new URL(req.url).searchParams.get('v') || '';
	const key = 'index.pck.enc?v=' + build;
	const hit = await c.match(key);
	if (hit) { return hit; }
	const r = await fetch(req);
	if (r.ok && r.status === 200) {
		for (const k of await c.keys()) {
			if (leaf(k.url) === 'index.pck.enc') { await c.delete(k); }
		}
		c.put(key, r.clone());
	}
	return r;
}

async function asset(req) {
	const c = await caches.open(CACHE);
	const key = leaf(req.url);
	const hit = await c.match(key);
	const fresh = fetch(req).then((r) => {
		if (r.ok && r.status === 200) { c.put(key, r.clone()); }
		return r;
	});
	if (hit) { fresh.catch(() => {}); return hit; }
	return fresh;
}

self.addEventListener('fetch', (e) => {
	const u = new URL(e.request.url);
	if (e.request.method !== 'GET' || u.origin !== self.location.origin) { return; }
	const name = leaf(e.request.url);
	if (name === 'sw.js') { return; }
	if (name === 'version.json') {
		e.respondWith(fetch(e.request).catch(() => new Response('{}',
			{ headers: { 'content-type': 'application/json' } })));
	} else if (name === 'index.html') {
		e.respondWith(page(e.request));
	} else if (name === 'index.pck.enc') {
		e.respondWith(pack(e.request));
	} else {
		e.respondWith(asset(e.request));
	}
});
