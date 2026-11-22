console.clear()

var app = {
    version: 1,
    role: "player",
    socket: io.connect(),
    wrong: 0,
    audioFlip: new Audio('/public/audio/flip.mp3'),
    audioWrong: new Audio('/public/audio/wrong.mp3'),
    audioTheme: new Audio('/public/audio/theme_song.mp3'),
    THEME_SECONDS: 7,
    themeTimer: null,
    themeLeft: 7,
    themeStarted: 0,
    themeBtn: $(`<div id='themeBTN' title='Play theme song'>
                    <svg class='iconPlay' viewBox='0 0 24 24' aria-hidden='true'>
                        <path d='M4 9v6h4l5 4V5L8 9H4z'/>
                        <path d='M16 8.5a4.5 4.5 0 0 1 0 7M18.5 6a8 8 0 0 1 0 12' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round'/>
                    </svg>
                    <svg class='iconPause' viewBox='0 0 24 24' aria-hidden='true'>
                        <rect x='6' y='5' width='4' height='14' rx='1'/>
                        <rect x='14' y='5' width='4' height='14' rx='1'/>
                    </svg>
                </div>`),
    board: $(`<div class='gameBoard'>

                <!--- Scores --->
                <div class='score' id='boardScore'>0</div>
                <div class='score' id='team1' >0</div>
                <div class='score' id='team2' >0</div>

                <!--- Main Board --->
                <div id='middleBoard'>

                    <!--- Question --->
                    <div class='questionHolder'>
                        <span class='question'></span>
                    </div>

                    <!--- Answers --->
                    <div class='colHolder'>
                    </div>

                </div>
                <!--- Wrong --->
                <div class='wrongX wrongBoard'>
                    <img alt="not on board" src="/public/img/Wrong.svg"/>
                    <img alt="not on board" src="/public/img/Wrong.svg"/>
                    <img alt="not on board" src="/public/img/Wrong.svg"/>
                </div>

                <!--- Buttons --->
                <div class='btnHolder hide' id="host">
                    <div id='hostBTN'     class='button'>Be the host</div>
                    <div id='awardTeam1'  class='button' data-team='1'>Award Team 1</div>
                    <div id='newQuestion' class='button'>New Question</div>
                    <div id="wrong"       class='button wrongX'>
                        <img alt="not on board" src="/public/img/Wrong.svg"/>
                    </div>
                    <div id='awardTeam2'  class='button' data-team='2' >Award Team 2</div>
                    <div id='fastMoneyBTN' class='button'>Fast Money</div>
                </div>

                </div>`),

    // Utility functions
    shuffle: (array) => {
        var currentIndex = array.length,
            temporaryValue, randomIndex;

        while (0 !== currentIndex) {
            randomIndex = Math.floor(Math.random() * currentIndex);
            currentIndex -= 1;
            temporaryValue = array[currentIndex];
            array[currentIndex] = array[randomIndex];
            array[randomIndex] = temporaryValue;
        }
        return array;
    },

    // Action functions
    // The server picks a random, non-repeating question and sends its answers
    makeQuestion: (qText, qAnswr) => {
        if (!qText || !qAnswr) return;

        var qNum = qAnswr.length;
        qNum = (qNum < 8) ? 8 : qNum;
        qNum = (qNum % 2 != 0) ? qNum + 1 : qNum;

        var boardScore = app.board.find("#boardScore");
        var question = app.board.find(".question");
        var holderMain = app.board.find(".colHolder");

        boardScore.html(0);
        question.html(qText.replace(/&x22;/gi, '"'));
        holderMain.empty();

        app.wrong = 0;
        var wrong = app.board.find(".wrongBoard")
        $(wrong).find("img").hide()
        $(wrong).hide()

        qNum = 10

        for (var i = 0; i < qNum; i++) {
            var aLI;
            if (qAnswr[i]) {
                aLI = $(`<div class='cardHolder'>
                            <div class='card' data-id='${i}'>
                                <div class='front'>
                                    <span class='DBG'>${(i + 1)}</span>
                                    <span class='answer'>${qAnswr[i][0]}</span>
                                </div>
                                <div class='back DBG'>
                                    <span>${qAnswr[i][0]}</span>
                                    <b class='LBG'>${qAnswr[i][1]}</b>
                                </div>
                            </div>
                        </div>`)
            } else {
                aLI = $(`<div class='cardHolder empty'><div></div></div>`)
            }

            var parentDiv = holderMain//(i < (qNum / 2)) ? col1 : col2;
            aLI.on('click', {
                trigger: 'flipCard',
                num: i
            }, app.talkSocket);
            $(aLI).appendTo(parentDiv)
        }

        var cardHolders = app.board.find('.cardHolder');
        var cards = app.board.find('.card');
        var backs = app.board.find('.back');
        var cardSides = app.board.find('.card>div');

        TweenLite.set(cardHolders, {
            perspective: 800
        });
        TweenLite.set(cards, {
            transformStyle: "preserve-3d"
        });
        TweenLite.set(backs, {
            rotationX: 180
        });
        TweenLite.set(cardSides, {
            backfaceVisibility: "hidden"
        });
        cards.data("flipped", false);
    },
    getBoardScore: () => {
        var cards = app.board.find('.card');
        var boardScore = app.board.find('#boardScore');
        var currentScore = {
            var: boardScore.html()
        };
        var score = 0;

        function tallyScore() {
            if ($(this).data("flipped")) {
                var value = $(this).find("b").html();
                score += parseInt(value)
            }
        }
        $.each(cards, tallyScore);
        TweenMax.to(currentScore, 1, {
            var: score,
            onUpdate: function () {
                boardScore.html(Math.round(currentScore.var));
            },
            ease: Power3.easeOut
        });
    },
    awardPoints: (num) => {
        var boardScore = app.board.find('#boardScore');
        var currentScore = {
            var: parseInt(boardScore.html())
        };
        var team = app.board.find("#team" + num);
        var teamScore = {
            var: parseInt(team.html())
        };
        var teamScoreUpdated = (teamScore.var + currentScore.var);
        TweenMax.to(teamScore, 1, {
            var: teamScoreUpdated,
            onUpdate: function () {
                team.html(Math.round(teamScore.var));
            },
            ease: Power3.easeOut
        });

        TweenMax.to(currentScore, 1, {
            var: 0,
            onUpdate: function () {
                boardScore.html(Math.round(currentScore.var));
            },
            ease: Power3.easeOut
        });
    },
    changeQuestion: (data) => {
        app.makeQuestion(data.question, data.answers);
    },
    makeHost: () => {
        app.role = "host";
        app.board.find(".hide").removeClass('hide');
        app.board.addClass('showHost');
        app.socket.emit("talking", {
            trigger: 'hostAssigned'
        });
    },
    flipCard: (n) => {
        console.log("card");
        console.log(n);
        var card = $('[data-id="' + n + '"]');
        var flipped = $(card).data("flipped");

        app.audioFlip.currentTime = 0;
        app.audioFlip.play();

        var cardRotate = (flipped) ? 0 : -180;
        TweenLite.to(card, 1, {
            rotationX: cardRotate,
            ease: Back.easeOut
        });
        flipped = !flipped;
        $(card).data("flipped", flipped);
        app.getBoardScore()
    },
    wrongAnswer: () => {
        app.wrong++
        console.log("wrong: " + app.wrong)
        var wrong = app.board.find(".wrongBoard")

        app.audioWrong.currentTime = 0;
        app.audioWrong.play();

        $(wrong).find("img:nth-child(" + app.wrong + ")").show()
        $(wrong).show()
        setTimeout(() => {
            $(wrong).hide();
        }, 1000);

    },

    // Theme song: plays for THEME_SECONDS. Pausing keeps the spot, so the
    // next click resumes with the time that was left.
    themePlay: () => {
        if (app.themeTimer) return;
        if (app.themeLeft <= 0) app.themeReset();
        app.themeStarted = Date.now();
        app.audioTheme.play().catch(() => {});
        app.themeTimer = setTimeout(() => {
            app.themePause();
            app.themeReset();
        }, app.themeLeft * 1000);
        app.themeBtn.addClass('playing').attr('title', 'Pause theme song');
    },
    themePause: () => {
        if (!app.themeTimer) return;
        clearTimeout(app.themeTimer);
        app.themeTimer = null;
        app.themeLeft -= (Date.now() - app.themeStarted) / 1000;
        app.audioTheme.pause();
        app.themeBtn.removeClass('playing').attr('title', 'Play theme song');
    },
    themeReset: () => {
        app.audioTheme.currentTime = 0;
        app.themeLeft = app.THEME_SECONDS;
    },
    themeClick: () => {
        var action = app.themeTimer ? 'pause' : 'play';
        // The host's button plays the song on every screen; anyone else
        // just hears it on their own screen.
        if (app.role == "host") app.socket.emit("talking", { trigger: 'theme', action: action });
        else app.themeAction(action);
    },
    themeAction: (action) => {
        if (action == 'pause') app.themePause();
        else app.themePlay();
    },

    // Socket Test
    talkSocket: (e) => {
        if (app.role == "host") app.socket.emit("talking", e.data);
    },
    listenSocket: (data) => {
        console.log(data);
        switch (data.trigger) {
            case "newQuestion":
            case "setQuestion":
                app.changeQuestion(data);
                break;
            case "awardTeam1":
                app.awardPoints(1);
                break;
            case "awardTeam2":
                app.awardPoints(2);
                break;
            case "flipCard":
                app.flipCard(data.num);
                break;
            case "hostAssigned":
                app.board.find('#hostBTN').remove();
                break;
            case "wrong":
                app.wrongAnswer()
                break;
            case "theme":
                app.themeAction(data.action);
                break;
        }
    },

    // Inital function
    init: () => {

        app.board.find('.host').hide();
        $('body').append(app.board);
        $('body').append(app.themeBtn);
        app.themeBtn.on('click', app.themeClick);

        app.board.find('#hostBTN').on('click', app.makeHost);
        app.board.find('#awardTeam1').on('click', { trigger: 'awardTeam1' }, app.talkSocket);
        app.board.find('#awardTeam2').on('click', { trigger: 'awardTeam2' }, app.talkSocket);
        app.board.find('#newQuestion').on('click', { trigger: 'newQuestion' }, app.talkSocket);
        app.board.find('#wrong').on('click', { trigger: 'wrong' }, app.talkSocket);

        app.socket.on('listening', app.listenSocket)
    }
};
app.init();