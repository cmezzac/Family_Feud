// Family Feud — game server logic.
// Mounted by the root server.js: static files at /games/family-feud/ and
// realtime traffic on the "/family-feud" socket.io namespace.
const express = require('express');
const fs = require('fs');
const path = require('path');

module.exports = function register({ app, io, mountPath, socketAuth }) {
const nsp = io.of('/family-feud');
if (socketAuth) nsp.use(socketAuth);

const DATA = path.join(__dirname, 'public/data');

// ---- Question decks ----
// The server picks random questions so every screen shows the same one.
// Each question that gets played is MOVED (with its answers) out of the
// question file into a "done" file, so it never repeats — even after a
// restart. When a question file runs out, its done questions are moved back
// and the cycle starts over.
function readJSON(file) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (e) { return {}; }
}
function writeJSON(file, data) {
    const lines = Object.keys(data).map(k => '  ' + JSON.stringify(k) + ': ' + JSON.stringify(data[k]));
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, '{\n' + lines.join(',\n') + '\n}\n');
    fs.renameSync(tmp, file); // atomic replace so a crash can't corrupt the file
}

function makeDeck(name, file, doneFile) {
    let remaining = readJSON(file);
    let done = readJSON(doneFile);
    console.log(`${name}: ${Object.keys(remaining).length} questions left, ${Object.keys(done).length} done`);
    return {
        draw(count) {
            const picked = [];
            for (let i = 0; i < count; i++) {
                let keys = Object.keys(remaining);
                if (keys.length === 0) {
                    console.log(`${name}: all questions played — moving them back and starting over.`);
                    remaining = done;
                    done = {};
                    keys = Object.keys(remaining);
                }
                const question = keys[Math.floor(Math.random() * keys.length)];
                const answers = remaining[question];
                delete remaining[question];
                done[question] = answers;
                picked.push({ question, answers });
                console.log(`${name} (${keys.length - 1} left): ${question}`);
            }
            writeJSON(file, remaining);
            writeJSON(doneFile, done);
            return picked;
        }
    };
}

const mainDeck = makeDeck('Main', path.join(DATA, 'Family_Feud_Real_Qs.json'), path.join(DATA, 'already_done_questions.json'));
const fmDeck = makeDeck('Fast Money', path.join(DATA, 'Fast_Money_Qs.json'), path.join(DATA, 'already_done_fast_money.json'));

let current = null; // { question, answers } for the main board

// ---- Fast Money ----
// Two players, five questions each. Player 1 gets 20 seconds, player 2 gets
// 25. Their combined points need to reach 200 to win.
const FM_QUESTIONS = 5;
const FM_TIME = { 1: 20, 2: 25 };
let fm = { active: false };
let fmTimeout = null;

function fmRemaining() {
    if (!fm.timer.running) return fm.timer.remaining;
    return Math.max(0, (fm.timer.endsAt - Date.now()) / 1000);
}
function fmStopTimer() {
    if (!fm.timer) return;
    fm.timer.remaining = Math.ceil(fmRemaining());
    fm.timer.running = false;
    clearTimeout(fmTimeout);
}
function fmSnapshot() {
    if (!fm.active) return { active: false };
    return Object.assign({}, fm, {
        timer: { running: fm.timer.running, remaining: fmRemaining() }
    });
}
function fmBroadcast(event) {
    nsp.emit('fastMoney', { state: fmSnapshot(), event: event || null });
}
function fmEmpty() {
    return Array.apply(null, Array(FM_QUESTIONS)).map(() => null);
}

function fastMoneyAction(data) {
    if (!data) return;
    const a = data.action;

    if (a === 'start') {
        clearTimeout(fmTimeout);
        fm = {
            active: true,
            questions: fmDeck.draw(FM_QUESTIONS),
            player: 1,
            q: 0,
            picks: { 1: fmEmpty(), 2: fmEmpty() },
            hideP1: false,
            timer: { running: false, remaining: FM_TIME[1] }
        };
        return fmBroadcast({ type: 'start' });
    }
    if (!fm.active) return;

    switch (a) {
        case 'end':
            clearTimeout(fmTimeout);
            fm = { active: false };
            return fmBroadcast({ type: 'end' });

        case 'player': {
            const n = data.player === 2 ? 2 : 1;
            fmStopTimer();
            fm.player = n;
            fm.q = Math.max(0, fm.picks[n].indexOf(null));
            fm.hideP1 = (n === 2);
            fm.timer.remaining = FM_TIME[n];
            return fmBroadcast({ type: 'player' });
        }

        case 'goto':
            fm.q = Math.min(FM_QUESTIONS - 1, Math.max(0, data.q | 0));
            return fmBroadcast();

        case 'pick': {
            const q = fm.q;
            const answers = fm.questions[q].answers;
            const idx = data.index;
            const typed = String(data.text || '').trim().slice(0, 40).toUpperCase();
            let pick;
            if (idx >= 0 && idx < answers.length) {
                pick = { text: typed || answers[idx][0], points: parseInt(answers[idx][1], 10), index: idx };
            } else {
                pick = { text: typed || '—', points: 0, index: -1 };
            }
            fm.picks[fm.player][q] = pick;
            const next = fm.picks[fm.player].indexOf(null);
            if (next !== -1) fm.q = next;
            return fmBroadcast({ type: 'pick', player: fm.player, q: q });
        }

        case 'clear':
            fm.picks[fm.player][fm.q] = null;
            return fmBroadcast();

        case 'reveal':
            fm.hideP1 = false;
            return fmBroadcast({ type: 'reveal' });

        case 'duplicate':
            return fmBroadcast({ type: 'duplicate' });

        case 'timerStart': {
            if (fm.timer.running) return;
            if (fm.timer.remaining <= 0) fm.timer.remaining = FM_TIME[fm.player];
            fm.timer.running = true;
            fm.timer.endsAt = Date.now() + fm.timer.remaining * 1000;
            clearTimeout(fmTimeout);
            fmTimeout = setTimeout(() => {
                fm.timer.running = false;
                fm.timer.remaining = 0;
                fmBroadcast({ type: 'timeUp' });
            }, fm.timer.remaining * 1000);
            return fmBroadcast({ type: 'timerStart' });
        }

        case 'timerStop':
            fmStopTimer();
            return fmBroadcast();

        case 'timerReset':
            fmStopTimer();
            fm.timer.remaining = FM_TIME[fm.player];
            return fmBroadcast();
    }
}

// ---- Routes & sockets ----
app.use(mountPath, express.static(path.join(__dirname, 'public')));

nsp.on('connection', (socket) => {
    // First screen to connect draws the first question; later screens catch up to it
    if (!current) current = mainDeck.draw(1)[0];
    socket.emit('listening', Object.assign({ trigger: 'setQuestion' }, current));
    socket.emit('fastMoney', { state: fmSnapshot(), event: null });

    socket.on('talking', (data) => {
        if (data && data.trigger === 'newQuestion') {
            current = mainDeck.draw(1)[0];
            nsp.emit('listening', Object.assign({ trigger: 'newQuestion' }, current));
        } else {
            nsp.emit('listening', data);
        }
    });

    socket.on('fastMoney', fastMoneyAction);
});
};
