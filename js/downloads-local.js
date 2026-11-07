/*
 * Lokaler Ersatz für die "downloads"-Fähigkeit aus Cowork (window.claude.use("downloads")).
 * Wird nur als Fallback benutzt, wenn der Browser kein natives Teilen-Menü
 * (navigator.share) für Dateien unterstützt (v. a. am Desktop). Löst einen
 * normalen Browser-Download über einen unsichtbaren <a download>-Link aus.
 */
(function () {
  "use strict";

  function saveLocal(opts) {
    return new Promise(function (resolve, reject) {
      try {
        var blob = opts.data;
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = opts.filename || "download";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () {
          URL.revokeObjectURL(url);
        }, 1000);
        resolve();
      } catch (e) {
        reject(e);
      }
    });
  }

  window.claude = window.claude || {};
  var originalUse = window.claude.use;
  window.claude.use = function (name) {
    if (name === "downloads") {
      return Promise.resolve({ save: saveLocal });
    }
    if (typeof originalUse === "function") return originalUse(name);
    return Promise.resolve(null);
  };
})();
