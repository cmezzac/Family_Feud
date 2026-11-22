// Keeps the session alive while any portal or game page is open.
// The server expires the session after 10 minutes without a request, so
// closing the site for 10+ minutes sends you back to the login page.
(function () {
    function ping() {
        fetch('/api/ping', { credentials: 'same-origin', cache: 'no-store' })
            .then(function (res) {
                if (res.status === 401) {
                    location.href = '/login?next=' + encodeURIComponent(location.pathname + location.search);
                }
            })
            .catch(function () { /* offline / server restarting: try again next tick */ });
    }
    setInterval(ping, 60 * 1000);
    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) ping();
    });
})();
