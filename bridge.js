// bridge.js -- the whole job of redirect.html.
// A classic script (not a module) so the strict CSP needs no extra allowances.
(function () {
    "use strict";
    var ns = window.msalRedirectBridge;
    var box = document.getElementById("bridge-message");
    if (!ns || typeof ns.broadcastResponseToMainFrame !== "function") {
        box.textContent = "MSAL redirect bridge did not load.";
        return;
    }
    ns.broadcastResponseToMainFrame().catch(function (e) {
        box.textContent =
            "Sign-in could not be completed (" +
            (e && (e.errorCode || e.message) ? e.errorCode || e.message : "unknown") +
            "). Go back to the app and try again.";
    });
})();
