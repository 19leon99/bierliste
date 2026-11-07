/*
 * Lokaler Ersatz für die "db"-Fähigkeit aus Cowork (window.claude.use("db")).
 *
 * Diese Datei stellt dieselbe kleine API bereit (collection/doc, get/set/update/
 * delete/add, onSnapshot, orderBy/limit, acquire), speichert die Daten aber im
 * localStorage des Browsers statt in einer geteilten Cloud-Datenbank. Dadurch
 * läuft app.js unverändert als statische Seite (z. B. auf GitHub Pages), ohne
 * Backend.
 *
 * Wichtig: localStorage ist PRO BROWSER/GERÄT. Es gibt keine Synchronisierung
 * zwischen mehreren Geräten/Personen mehr – jede:r, der die Seite öffnet, hat
 * seinen eigenen Datenstand. Für ein Team, das sich einen gemeinsamen Stand
 * teilen möchte, eignet sich das nur mit manuellem Export/Import oder einem
 * echten Backend (siehe README.md).
 */
(function () {
  "use strict";

  var STORAGE_KEY = "bierliste_db_v1";

  function loadStore() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      console.error("db-local: konnte Store nicht laden", e);
      return {};
    }
  }
  function saveStore(store) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch (e) {
      console.error("db-local: konnte Store nicht speichern (localStorage voll/blockiert?)", e);
    }
  }

  var store = loadStore();
  var listeners = []; // {type:'doc'|'query', path, collectionPath, orderField, dir, limitN, next}

  // app.js ruft beim Start mehrere onSnapshot-Abos direkt hintereinander auf (settings,
  // players, events, penalties, dienste) und löst aus den Callbacks von "players"/"settings"
  // heraus sofort maybeGenerateSlots()/reassignSpielPriority() aus, die ihrerseits lesend auf
  // das Modul-Array der "events"-Subscription zugreifen. Würde der jeweils erste Snapshot
  // synchron in Abo-Reihenfolge zugestellt, wäre bei jedem Seitenaufruf "events" noch leer,
  // wenn "players"/"settings" ihren ersten Callback bekommen – das lässt die Generierung
  // fälschlich glauben, es fehlten alle Termine der Woche, und sie überschreibt bereits
  // bestätigte Häkchen (z. B. "gebracht") mit dem Standardwert. Deshalb wird der JEWEILS
  // ERSTE Snapshot pro Abo nicht sofort, sondern gesammelt in einem Microtask zugestellt,
  // sortiert nach Pfad/Collection – alphabetisch kommt "events" vor "meta/settings" und vor
  // "players", sodass die Terminliste beim ersten Lauf immer schon gefüllt ist, bevor die
  // Rotation/Generierung geprüft wird. Spätere Updates (nach einem Write) laufen weiterhin
  // sofort über notify().
  var pendingInitial = [];
  var pendingScheduled = false;
  function scheduleInitialDelivery(sortKey, deliver) {
    pendingInitial.push({ key: sortKey, deliver: deliver });
    if (pendingScheduled) return;
    pendingScheduled = true;
    Promise.resolve().then(function () {
      var batch = pendingInitial;
      pendingInitial = [];
      pendingScheduled = false;
      batch.sort(function (a, b) {
        return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
      });
      batch.forEach(function (item) {
        try {
          item.deliver();
        } catch (e) {
          console.error("db-local: Listener-Fehler", e);
        }
      });
    });
  }

  function parentCollection(path) {
    var parts = path.split("/");
    parts.pop();
    return parts.join("/");
  }

  function docSnapshot(path) {
    var rec = store[path];
    return {
      id: path.split("/").pop(),
      exists: !!rec,
      data: function () {
        return rec ? JSON.parse(JSON.stringify(rec)) : undefined;
      },
      metadata: { fromCache: false, hasPendingWrites: false },
    };
  }

  function matchedDocs(collectionPath, orderField, dir, limitN) {
    var docs = [];
    Object.keys(store).forEach(function (p) {
      if (parentCollection(p) === collectionPath) docs.push(p);
    });
    docs.sort(function (a, b) {
      if (orderField) {
        var av = store[a][orderField];
        var bv = store[b][orderField];
        if (av === undefined && bv === undefined) return a.localeCompare(b);
        if (av === undefined) return 1;
        if (bv === undefined) return -1;
        if (av < bv) return dir === "desc" ? 1 : -1;
        if (av > bv) return dir === "desc" ? -1 : 1;
        return 0;
      }
      return a.localeCompare(b);
    });
    if (limitN) docs = docs.slice(0, limitN);
    return docs.map(docSnapshot);
  }

  function notify(path) {
    var coll = parentCollection(path);
    listeners.forEach(function (l) {
      if (l.type === "doc" && l.path === path) {
        try {
          l.next(docSnapshot(path));
        } catch (e) {
          console.error("db-local: Listener-Fehler", e);
        }
      } else if (l.type === "query" && l.collectionPath === coll) {
        var docs = matchedDocs(l.collectionPath, l.orderField, l.dir, l.limitN);
        try {
          l.next({
            docs: docs,
            size: docs.length,
            empty: docs.length === 0,
            docChanges: function () {
              return [];
            },
            metadata: { fromCache: false, hasPendingWrites: false },
          });
        } catch (e) {
          console.error("db-local: Listener-Fehler", e);
        }
      }
    });
  }

  var autoCounter = 0;

  function makeDocRef(path) {
    return {
      id: path.split("/").pop(),
      path: path,
      get: function () {
        return Promise.resolve(docSnapshot(path));
      },
      set: function (data) {
        store[path] = JSON.parse(JSON.stringify(data));
        saveStore(store);
        notify(path);
        return Promise.resolve();
      },
      update: function (data) {
        if (!store[path]) {
          return Promise.reject({ code: "invalid_argument", message: "not found" });
        }
        Object.assign(store[path], JSON.parse(JSON.stringify(data)));
        saveStore(store);
        notify(path);
        return Promise.resolve();
      },
      delete: function () {
        delete store[path];
        saveStore(store);
        notify(path);
        return Promise.resolve();
      },
      // Einfache Lease-Simulation: da hier immer nur ein lokaler Nutzer schreibt,
      // wird jede Anfrage sofort gewährt (anders als bei der echten, geteilten db).
      acquire: function (opts) {
        return Promise.resolve({
          acquired: true,
          version: 1,
          holder: opts && opts.holder,
          expiresAt: new Date(Date.now() + ((opts && opts.ttlMs) || 30000)).toISOString(),
        });
      },
      onSnapshot: function (next, error) {
        var l = { type: "doc", path: path, next: next, error: error };
        listeners.push(l);
        scheduleInitialDelivery(path, function () {
          next(docSnapshot(path));
        });
        return function () {
          listeners = listeners.filter(function (x) {
            return x !== l;
          });
        };
      },
    };
  }

  function makeCollectionRef(collPath) {
    var orderField = null;
    var dir = "asc";
    var limitN = null;
    var api = {
      path: collPath,
      orderBy: function (f, d) {
        orderField = f;
        dir = d || "asc";
        return api;
      },
      limit: function (n) {
        limitN = n;
        return api;
      },
      where: function () {
        // Nicht implementiert (wird von app.js aktuell nicht benutzt) – gibt
        // einfach ungefiltert weiter, statt einen Fehler zu werfen.
        return api;
      },
      get: function () {
        return Promise.resolve({
          docs: matchedDocs(collPath, orderField, dir, limitN),
          size: 0,
          empty: false,
          docChanges: function () {
            return [];
          },
          metadata: { fromCache: false, hasPendingWrites: false },
        });
      },
      doc: function (id) {
        return makeDocRef(collPath + "/" + (id || "auto" + ++autoCounter));
      },
      add: function (data) {
        var ref = makeDocRef(collPath + "/" + "auto" + ++autoCounter);
        return ref.set(data).then(function () {
          return ref;
        });
      },
      onSnapshot: function (next, error) {
        var l = {
          type: "query",
          collectionPath: collPath,
          orderField: orderField,
          dir: dir,
          limitN: limitN,
          next: next,
          error: error,
        };
        listeners.push(l);
        scheduleInitialDelivery(collPath, function () {
          var docs = matchedDocs(collPath, orderField, dir, limitN);
          next({
            docs: docs,
            size: docs.length,
            empty: docs.length === 0,
            docChanges: function () {
              return [];
            },
            metadata: { fromCache: false, hasPendingWrites: false },
          });
        });
        return function () {
          listeners = listeners.filter(function (x) {
            return x !== l;
          });
        };
      },
    };
    return api;
  }

  var dbLocal = {
    doc: function (p) {
      return makeDocRef(p);
    },
    collection: function (p) {
      return makeCollectionRef(p);
    },
  };

  window.claude = window.claude || {};
  var originalUse = window.claude.use;
  window.claude.use = function (name) {
    if (name === "db") return Promise.resolve(dbLocal);
    if (typeof originalUse === "function") return originalUse(name);
    return Promise.resolve(null);
  };
})();
