// Fast Money: two players answer the same five questions, one at a time.
// Player 1 gets 20 seconds, player 2 gets 25; together they need 200 points.
// All state lives on the server — this file only renders it and, for the
// host, sends actions back.

var fastMoney = {
    GOAL: 200,
    state: { active: false },
    timerEnd: null,
    timerInterval: null,
    lastBanner: '',

    el: $(`<div class='fmBoard' style='display:none'>
            <div class='fmTop'>
                <div class='fmTitle'>FAST MONEY</div>
                <div class='fmTimer'>20</div>
            </div>
            <div class='fmQuestion'></div>
            <div class='fmGrid'>
                <div class='fmCol' data-player='1'><div class='fmColLabel'>PLAYER 1</div></div>
                <div class='fmCol' data-player='2'><div class='fmColLabel'>PLAYER 2</div></div>
            </div>
            <div class='fmTotalRow'>
                <span>TOTAL</span>
                <div class='fmTotal'>0</div>
                <span class='fmGoal'>/ 200</span>
            </div>
            <div class='fmBanner'></div>

            <div class='fmBecomeHost fmBtn'>Be the host</div>

            <div class='fmHost'>
                <div class='fmControls'>
                    <div class='fmBtn' data-act='p1'>Player 1</div>
                    <div class='fmBtn' data-act='p2'>Player 2</div>
                    <div class='fmBtn fmTimerBtn' data-act='timer'>Start Timer</div>
                    <div class='fmBtn' data-act='timerReset'>Reset Timer</div>
                    <div class='fmBtn' data-act='reveal'>Reveal Player 1</div>
                    <div class='fmBtn fmRed' data-act='duplicate'>Duplicate!</div>
                </div>
                <div class='fmTabs'></div>
                <div class='fmHostQ'></div>
                <input class='fmTyped' maxlength='40' placeholder="What they said (optional — shown on the board instead of the survey answer)"/>
                <div class='fmAnswerList'></div>
                <div class='fmControls'>
                    <div class='fmBtn fmRed' data-act='miss'>Not on board (0)</div>
                    <div class='fmBtn' data-act='clear'>Clear this answer</div>
                    <div class='fmBtn' data-act='start'>New Fast Money</div>
                    <div class='fmBtn' data-act='end'>Back to main game</div>
                </div>
            </div>
        </div>`),

    isHost: () => app.role === 'host',

    send: (action, extra) => {
        if (!fastMoney.isHost()) return;
        app.socket.emit('fastMoney', Object.assign({ action: action }, extra || {}));
    },

    total: (s) => {
        var sum = 0;
        [1, 2].forEach((p) => s.picks[p].forEach((pick) => { if (pick) sum += pick.points; }));
        return sum;
    },

    // ---- Rendering ----
    render: (event) => {
        var s = fastMoney.state;
        var el = fastMoney.el;
        var host = fastMoney.isHost();

        $('.gameBoard').toggle(!s.active);
        el.toggle(!!s.active);
        el.toggleClass('isHost', host);
        el.find('.fmBecomeHost').toggle(!host && $('#hostBTN').length > 0);
        if (!s.active) { fastMoney.stopLocalTimer(); return; }

        // Question for the player currently answering
        el.find('.fmQuestion').text(s.questions[s.q].question);

        // Answer grid
        [1, 2].forEach((p) => {
            var col = el.find(`.fmCol[data-player='${p}']`);
            col.toggleClass('current', s.player === p);
            col.find('.fmRow').remove();
            for (var i = 0; i < s.picks[p].length; i++) {
                var pick = s.picks[p][i];
                var hidden = (p === 1 && s.hideP1);
                var row = $(`<div class='fmRow'><div class='fmAns'></div><div class='fmPts'></div></div>`);
                row.toggleClass('current', s.player === p && s.q === i);
                if (pick && (!hidden || host)) {
                    row.find('.fmAns').text(pick.text);
                    row.find('.fmPts').text(pick.points);
                    if (hidden) row.addClass('peek'); // host sees covered answers, dimmed
                    var isNew = event && event.type === 'pick' && event.player === p && event.q === i;
                    if (isNew) fastMoney.animatePick(row, pick);
                } else if (pick && hidden) {
                    row.addClass('covered');
                }
                col.append(row);
            }
        });

        // Total and banner
        var total = fastMoney.total(s);
        el.find('.fmTotal').text(total);
        var allDone = s.picks[1].concat(s.picks[2]).every((x) => x);
        var banner = total >= fastMoney.GOAL ? 'WINNER! 🎉' : (allDone && !s.hideP1 ? 'SO CLOSE!' : '');
        el.find('.fmBanner').text(banner).toggle(!!banner);
        if (banner && banner !== fastMoney.lastBanner) {
            if (total >= fastMoney.GOAL) fastMoney.play(app.audioFlip); else fastMoney.play(app.audioWrong);
        }
        fastMoney.lastBanner = banner;

        // Timer
        fastMoney.syncTimer(s.timer);
        el.find('.fmTimerBtn').text(s.timer.running ? 'Stop Timer' : 'Start Timer');

        if (host) fastMoney.renderHost(s);
    },

    renderHost: (s) => {
        var el = fastMoney.el;
        el.find("[data-act='p1']").toggleClass('active', s.player === 1);
        el.find("[data-act='p2']").toggleClass('active', s.player === 2);
        el.find("[data-act='reveal']").toggle(s.hideP1);

        // Question tabs
        var tabs = el.find('.fmTabs').empty();
        s.questions.forEach((q, i) => {
            var done = !!s.picks[s.player][i];
            var tab = $(`<div class='fmTab'></div>`).text((i + 1) + (done ? ' ✓' : ''));
            tab.toggleClass('active', i === s.q).toggleClass('done', done);
            tab.on('click', () => fastMoney.send('goto', { q: i }));
            tabs.append(tab);
        });

        el.find('.fmHostQ').text(`Player ${s.player} · Question ${s.q + 1}: ${s.questions[s.q].question}`);

        // Survey answers for the current question
        var list = el.find('.fmAnswerList').empty();
        var mine = s.picks[s.player][s.q];
        var p1 = s.player === 2 ? s.picks[1][s.q] : null;
        s.questions[s.q].answers.forEach((a, i) => {
            var btn = $(`<div class='fmAnswerBtn'><span></span><b></b></div>`);
            btn.find('span').text(a[0]);
            btn.find('b').text(a[1]);
            if (mine && mine.index === i) btn.addClass('chosen');
            if (p1 && p1.index === i) btn.addClass('p1').attr('title', 'Player 1 gave this answer');
            btn.on('click', () => fastMoney.pick(i));
            list.append(btn);
        });
        if (p1) list.append($(`<div class='fmP1Said'></div>`).text(`Player 1 said: ${p1.text}`));
    },

    animatePick: (row, pick) => {
        var ans = row.find('.fmAns'), pts = row.find('.fmPts');
        TweenLite.from(ans, 0.5, { opacity: 0, x: -20 });
        pts.css('visibility', 'hidden');
        setTimeout(() => {
            pts.css('visibility', 'visible');
            TweenLite.from(pts, 0.5, { rotationX: 90 });
            fastMoney.play(pick.points > 0 ? app.audioFlip : app.audioWrong);
        }, 700);
    },

    play: (audio) => {
        try { audio.currentTime = 0; audio.play(); } catch (e) {}
    },

    // ---- Timer (server sends remaining seconds; we count down locally) ----
    syncTimer: (t) => {
        fastMoney.stopLocalTimer();
        var display = fastMoney.el.find('.fmTimer');
        if (t.running) {
            fastMoney.timerEnd = Date.now() + t.remaining * 1000;
            var tick = () => {
                var left = Math.max(0, Math.ceil((fastMoney.timerEnd - Date.now()) / 1000));
                display.text(left).toggleClass('low', left <= 5);
                if (left <= 0) fastMoney.stopLocalTimer();
            };
            tick();
            fastMoney.timerInterval = setInterval(tick, 200);
        } else {
            var left = Math.ceil(t.remaining);
            display.text(left).toggleClass('low', left <= 5);
        }
    },
    stopLocalTimer: () => {
        clearInterval(fastMoney.timerInterval);
        fastMoney.timerInterval = null;
    },

    // ---- Host actions ----
    pick: (index) => {
        var input = fastMoney.el.find('.fmTyped');
        fastMoney.send('pick', { index: index, text: input.val() });
        input.val('').focus();
    },

    onAction: (act) => {
        switch (act) {
            case 'p1': return fastMoney.send('player', { player: 1 });
            case 'p2': return fastMoney.send('player', { player: 2 });
            case 'timer': return fastMoney.send(fastMoney.state.timer.running ? 'timerStop' : 'timerStart');
            case 'miss': return fastMoney.pick(-1);
            case 'end':
                if (confirm('Leave Fast Money and go back to the main game?')) fastMoney.send('end');
                return;
            case 'start':
                if (confirm('Start a new Fast Money round with 5 new questions?')) fastMoney.send('start');
                return;
            default: return fastMoney.send(act);
        }
    },

    onMessage: (msg) => {
        fastMoney.state = msg.state;
        var ev = msg.event;
        if (ev && (ev.type === 'duplicate' || ev.type === 'timeUp')) fastMoney.play(app.audioWrong);
        if (ev && ev.type === 'start') fastMoney.lastBanner = '';
        fastMoney.render(ev);
    },

    init: () => {
        $('body').append(fastMoney.el);
        fastMoney.el.on('click', '.fmHost [data-act]', function () {
            fastMoney.onAction($(this).data('act'));
        });
        fastMoney.el.find('.fmTyped').on('keydown', (e) => {
            if (e.key === 'Enter') fastMoney.pick(-1); // Enter = typed answer not on the board
        });
        fastMoney.el.find('.fmBecomeHost').on('click', () => $('#hostBTN').click());

        // Start button on the main board's host controls
        $(document).on('click', '#fastMoneyBTN', () => {
            if (confirm('Start Fast Money?')) fastMoney.send('start');
        });
        // Re-render once this screen becomes (or loses the chance to be) the host
        $(document).on('click', '#hostBTN', () => setTimeout(() => fastMoney.render(), 0));
        app.socket.on('listening', (d) => { if (d && d.trigger === 'hostAssigned') fastMoney.render(); });

        app.socket.on('fastMoney', fastMoney.onMessage);
    }
};
fastMoney.init();
