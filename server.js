// Game portal: login -> pick a game -> loading screen -> game.
// Each game lives in games/<name>/ and registers its own routes + socket namespace.
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io').listen(server);
const port = Number(process.env.PORT) || 8080;

// ---- Games ----
// To add a game: create games/<folder>/server.js and add an entry here.
const GAMES = [
    {
        id: 'family-feud',
        folder: 'family_feud',
        name: 'Family Feud',
        description: 'Survey says! Host-controlled board with Fast Money.',
        emoji: '🎤'
    }
];

// ---- Auth ----
// Hard-coded single user. The session is a signed cookie holding an expiry
// time; every authenticated request (including the 1-minute heartbeat that
// open pages send) pushes the expiry 10 minutes out. Away for 10+ minutes
// means the cookie is stale and you have to log in again.
const USER = 'chris';
const PASSWORD = 'letmein';
const IDLE_MS = 10 * 60 * 1000;
const SECRET = 'family-feud-portal-secret';
const COOKIE = 'portal_session';

function sign(value) {
    return crypto.createHmac('sha256', SECRET).update(value).digest('hex');
}
function readCookie(req) {
    const header = (req.headers && req.headers.cookie) || '';
    const match = header.split(/;\s*/).find(c => c.startsWith(COOKIE + '='));
    return match ? decodeURIComponent(match.slice(COOKIE.length + 1)) : null;
}
function isValid(req) {
    const raw = readCookie(req);
    if (!raw) return false;
    const [expires, sig] = raw.split('.');
    if (!expires || !sig || sig.length !== 64) return false;
    const expected = sign(expires);
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
    return Number(expires) > Date.now();
}
function setSession(res) {
    const expires = String(Date.now() + IDLE_MS);
    res.cookie(COOKIE, expires + '.' + sign(expires), {
        httpOnly: true, sameSite: 'lax', maxAge: IDLE_MS, path: '/'
    });
}
function safeNext(next) {
    return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

app.use(express.urlencoded({ extended: false }));
app.use('/portal', express.static(path.join(__dirname, 'portal')));

app.get('/login', (req, res) => {
    if (isValid(req)) return res.redirect(safeNext(req.query.next));
    res.sendFile(path.join(__dirname, 'portal/login.html'));
});
app.post('/login', (req, res) => {
    const next = safeNext(req.body.next);
    if (req.body.username === USER && req.body.password === PASSWORD) {
        setSession(res);
        return res.redirect(next);
    }
    res.redirect('/login?error=1&next=' + encodeURIComponent(next));
});
app.post('/logout', (req, res) => {
    res.clearCookie(COOKIE, { path: '/' });
    res.redirect('/login');
});

// Everything below requires a live session (and refreshes it).
app.use((req, res, next) => {
    if (!isValid(req)) {
        if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'expired' });
        return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
    }
    setSession(res);
    next();
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'portal/home.html')));
app.get('/api/ping', (req, res) => res.status(204).end());
app.get('/api/games', (req, res) => res.json(GAMES.map(g => ({
    id: g.id, name: g.name, description: g.description, emoji: g.emoji, url: '/games/' + g.id + '/'
}))));

// Sockets are checked at connect time using the same cookie.
function socketAuth(socket, next) {
    if (isValid(socket.request)) return next();
    next(new Error('unauthorized'));
}

GAMES.forEach(g => {
    require('./games/' + g.folder + '/server.js')({
        app, io, socketAuth, mountPath: '/games/' + g.id
    });
});

server.listen(port);
console.log('Listening on ' + port);
