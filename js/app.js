(function(){
  "use strict";

  var CATALOG = [
    {id:1,  name:"Bierstrafen",                  amount:0,   nonMonetary:"1 Strafkiste", individual:false},
    {id:2,  name:"Vergessen (Halle)",             amount:2,   nonMonetary:null,           individual:false},
    {id:3,  name:"Amt/Spond vergessen",           amount:5,   nonMonetary:null,           individual:false},
    {id:4,  name:"unentsch. Training",            amount:25,  nonMonetary:"1 Strafkiste", individual:false},
    {id:5,  name:"unentsch. Spiel",               amount:50,  nonMonetary:null,           individual:false},
    {id:6,  name:"unentsch. Spät Training",       amount:5,   nonMonetary:null,           individual:false},
    {id:7,  name:"unentsch. Spät Spiel",          amount:10,  nonMonetary:null,           individual:false},
    {id:8,  name:"Meckern 1",                     amount:50,  nonMonetary:null,           individual:false},
    {id:9,  name:"Meckern 2",                     amount:100, nonMonetary:null,           individual:false},
    {id:10, name:"Meckern 3",                     amount:150, nonMonetary:null,           individual:false},
    {id:11, name:"Rot Beleidigung",                amount:150, nonMonetary:null,           individual:false},
    {id:12, name:"Schädigendes Verhalten",         amount:null,nonMonetary:null,           individual:true},
    {id:13, name:"Handy/Furzen Sitzung",           amount:5,   nonMonetary:null,           individual:false},
    {id:14, name:"Trikots vergessen",             amount:5,   nonMonetary:"1 Strafkiste", individual:false},
    {id:15, name:"Nicht anw. Dienst",              amount:5,   nonMonetary:null,           individual:false},
    {id:16, name:"Kabinenfest",                    amount:0,   nonMonetary:"1 Kabinenfest",individual:false}
  ];
  var CRATE_CATALOG_IDS = [1,4,14]; // catalog entries whose penalty includes "1 Strafkiste"
  var PAYMENT_ID = "payment"; // sentinel catalogId for "Beitrag bezahlt" entries in the Strafenlog
  var TEAM_FEE = 120;
  var BIERLOG_END = "2027-05-31";
  var WD_SHORT = ["So","Mo","Di","Mi","Do","Fr","Sa"];
  var MONTH_SHORT = ["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"];
  var clientId = "c-" + Math.random().toString(36).slice(2) + Date.now().toString(36);

  var UEBERSICHT_FIXED_COLS = [
    {key:"bierliste",          label:"Bierliste",             type:"int",    editable:false},
    {key:"offeneKisten",       label:"offene Kisten",         type:"int",    editable:false},
    {key:"kfOffen",            label:"KF offen",              type:"int",    editable:false},
    {key:"dienste",            label:"Dienste",               type:"int",    editable:false},
    {key:"strafkisten",        label:"Strafkisten",           type:"int",    editable:false},
    {key:"strafkistenBezahlt", label:"Strafkisten bezahlt",   type:"int",    editable:false},
    {key:"grundbeitrag",       label:"Grundbeitrag",          type:"euro",   editable:false},
    {key:"strafen",            label:"Strafen",               type:"euro",   editable:false},
    {key:"bezahlt",            label:"Bezahlt",                type:"euro",   editable:false},
    {key:"offeneSumme",        label:"Offene Summe",          type:"euro",   editable:false},
    {key:"birthday",           label:"Geburtstag",           type:"date",   editable:false}
  ];

  var db = null;
  var playersMap = {};
  var playersOrder = [];
  var eventsList = [];
  var penaltiesList = [];
  var diensteList = [];
  var appSettings = {}; // meta/settings – z.B. autoGenerationEnabled (Standard: aktiv)
  var settingsLoaded = false; // erst true, sobald meta/settings tatsächlich geladen wurde
  var isGenerating = false;
  var isReassigning = false;
  var isAddingBirthday = false;
  var bierlogExtraWeeks = 0; // zusätzlich zu den immer sichtbaren 2 Basiswochen, in 2er-Schritten via "Mehr anzeigen"
  var bierlogPastWeeksShown = 0; // Anzahl sichtbarer Wochen vor der aktuellen Woche, in 2er-Schritten via "Ältere Termine anzeigen"
  var uebersichtEditing = false;
  var uebersichtRenderPending = false;
  var penaltySort = {key:"date", dir:"desc"}; // Sortierung des Strafenlogs, per Klick auf Spaltenkopf änderbar

  // ---------- Übersicht: Spaltenauswahl (pro Gerät in localStorage gespeichert) ----------
  var UEBERSICHT_COLVIS_KEY = "bierliste_uebersicht_colvis_v1";
  var uebersichtColVisibility = {};  // c.key -> false, wenn ausgeblendet (Standard: alle sichtbar)
  var uebersichtCatalogVisible = true; // steuert die 16 einzelnen Strafenkatalog-Spalten gemeinsam

  function loadUebersichtColVisibility(){
    try{
      var raw = window.localStorage ? window.localStorage.getItem(UEBERSICHT_COLVIS_KEY) : null;
      if(!raw) return;
      var parsed = JSON.parse(raw);
      if(parsed && typeof parsed === "object"){
        if(parsed.cols && typeof parsed.cols === "object") uebersichtColVisibility = parsed.cols;
        if(typeof parsed.catalog === "boolean") uebersichtCatalogVisible = parsed.catalog;
      }
    } catch(e){ /* localStorage evtl. nicht verfügbar – Standard (alles sichtbar) bleibt */ }
  }
  function saveUebersichtColVisibility(){
    try{
      if(!window.localStorage) return;
      window.localStorage.setItem(UEBERSICHT_COLVIS_KEY, JSON.stringify({cols: uebersichtColVisibility, catalog: uebersichtCatalogVisible}));
    } catch(e){ /* Speichern optional – ohne Persistenz bleibt die Auswahl nur für diese Sitzung */ }
  }
  function isColVisible(key){ return uebersichtColVisibility[key] !== false; }

  function renderUebersichtColpicker(){
    var grid = $("uebersichtColpickerGrid");
    var html = UEBERSICHT_FIXED_COLS.map(function(c){
      return '<label class="check"><input type="checkbox" data-colkey="' + esc(c.key) + '"' + (isColVisible(c.key) ? " checked" : "") + '> ' + esc(c.label) + '</label>';
    }).join("");
    html += '<label class="check"><input type="checkbox" id="uebersichtColpickerCatalog"' + (uebersichtCatalogVisible ? " checked" : "") + '> Strafenkatalog (16 Einzelspalten)</label>';
    grid.innerHTML = html;
    grid.querySelectorAll("input[data-colkey]").forEach(function(inp){
      inp.addEventListener("change", function(){
        uebersichtColVisibility[inp.dataset.colkey] = inp.checked;
        saveUebersichtColVisibility();
        renderUebersicht();
      });
    });
    $("uebersichtColpickerCatalog").addEventListener("change", function(){
      uebersichtCatalogVisible = this.checked;
      saveUebersichtColVisibility();
      renderUebersicht();
    });
  }
  $("btnToggleColpicker").addEventListener("click", function(){
    var panel = $("uebersichtColpicker");
    panel.hidden = !panel.hidden;
  });

  function $(id){ return document.getElementById(id); }
  function todayISO(){ var d = new Date(); return toISODate(d); }
  function toISODate(d){
    var y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,"0"), day = String(d.getDate()).padStart(2,"0");
    return y + "-" + m + "-" + day;
  }
  function parseISO(s){ return new Date(s + "T00:00:00"); }
  function formatDateDE(iso){
    var d = parseISO(iso);
    return String(d.getDate()).padStart(2,"0") + "." + String(d.getMonth()+1).padStart(2,"0") + "." + d.getFullYear();
  }
  function euro(n){
    n = Math.round((Number(n)||0) * 100) / 100;
    return n.toLocaleString("de-DE",{minimumFractionDigits:2, maximumFractionDigits:2}) + " €";
  }
  function esc(s){
    return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
    });
  }
  function playerLabel(id){
    var p = playersMap[id];
    if(!p) return "#" + id;
    return p.number + " · " + p.initials;
  }
  function playerChip(id){
    if(!id) return '<span class="player-chip muted">– nicht zugeteilt –</span>';
    var p = playersMap[id];
    if(!p) return '<span class="player-chip"><span class="no">?</span> Unbekannt</span>';
    var cls = "player-chip" + (p.active === false ? " inactive" : "");
    return '<span class="' + cls + '"><span class="no">' + esc(p.number) + '</span>' + esc(p.initials) + '</span>';
  }
  function activeRoster(){
    return playersOrder.filter(function(id){ return playersMap[id] && playersMap[id].active !== false; });
  }

  // ---------- tabs ----------
  // Es gibt zwei Navigationen (obere Tab-Leiste am Desktop, untere Tab-Leiste auf dem Handy –
  // per CSS wird je nach Bildschirmbreite nur eine davon angezeigt), die beide dieselben
  // data-tab-Buttons verwenden und daher gemeinsam synchron gehalten werden.
  function selectTab(tabName){
    document.querySelectorAll("[data-tab]").forEach(function(b){
      b.setAttribute("aria-selected", b.dataset.tab === tabName ? "true" : "false");
    });
    document.querySelectorAll(".panel").forEach(function(p){ p.hidden = (p.dataset.panel !== tabName); });
    window.scrollTo(0, 0);
  }
  document.querySelectorAll("[data-tab]").forEach(function(btn){
    btn.addEventListener("click", function(){ selectTab(btn.dataset.tab); });
  });

  // ---------- init ----------
  // Vorbefüllung für den Bierlog-Altdaten-Import (Saisonstart bis 28.09., aus der
  // bestehenden Liste übernommen). Kann vor dem Import bei Bedarf noch angepasst werden.
  var BIERLOG_IMPORT_PREFILL = [
    "2026-06-08;training;19;1;0","2026-06-09;training;22;1;0","2026-06-11;training;7;1;0",
    "2026-06-15;training;72;1;0","2026-06-16;training;2;1;0","2026-06-18;training;8;1;0",
    "2026-06-22;training;1;1;0","2026-06-23;training;17;1;0","2026-06-29;training;12;1;1",
    "2026-06-30;training;21;1;0","2026-07-28;training;23;1;1","2026-08-03;training;71;1;1",
    "2026-08-04;training;4;1;0","2026-08-06;training;7;1;0","2026-08-10;training;12;1;0",
    "2026-08-11;spiel;95;1;0","2026-08-13;training;36;1;0","2026-08-15;spiel;26;1;0",
    "2026-08-17;training;1;1;0","2026-08-19;training;32;1;0","2026-08-19;training;32;1;0",
    "2026-08-20;training;19;1;0","2026-08-20;training;19;1;0","2026-08-22;training;10;1;0",
    "2026-08-23;training;7;1;0","2026-08-24;training;24;1;0","2026-08-25;training;4;1;0",
    "2026-08-29;training;32;1;1","2026-08-30;training;26;1;1","2026-08-30;training;7;1;0",
    "2026-08-30;training;7;1;0","2026-08-30;training;7;1;0","2026-08-30;training;7;1;0",
    "2026-09-01;training;7;1;0","2026-09-03;training;34;1;0","2026-09-06;spiel;8;1;1",
    "2026-09-07;training;2;1;0","2026-09-08;training;72;1;1","2026-09-10;training;22;1;0",
    "2026-09-14;training;24;1;0","2026-09-17;training;95;1;0","2026-09-22;training;23;1;0",
    "2026-09-24;training;17;1;0","2026-09-28;training;21;1;1"
  ].join("\n");

  // Vorbefüllung für den Strafenlog-Altdaten-Import (aus der per Datum;Spieler-Nr.;
  // Strafen-Nr.;Bemerkung übermittelten Liste in Katalog-Namen übersetzt; "Beitrag" mit
  // Betrag statt Bemerkung wird zu "Beitrag bezahlt").
  var STRAFEN_IMPORT_PREFILL = [
    "2026-05-22;19;Kabinenfest;;Geburtstag","2026-05-11;23;Kabinenfest;;Geburtstag",
    "2026-05-21;12;Kabinenfest;;Geburtstag","2026-06-08;26;Kabinenfest;;Einstand",
    "2026-06-08;32;Kabinenfest;;Einstand","2026-06-09;1;Kabinenfest;;Geburtstag",
    "2026-06-26;2;Kabinenfest;;Geburtstag","2026-06-28;77;Kabinenfest;;Geburtstag",
    "2026-07-02;10;Bierstrafen;;Kiste vergessen","2026-07-05;72;Kabinenfest;;Geburtstag",
    "2026-07-25;71;Kabinenfest;;Geburtstag","2026-08-09;1;Bierstrafen;;Bier verschüttet",
    "2026-08-09;12;Bierstrafen;;Angetrunken","2026-08-09;95;Bierstrafen;;Angetrunken",
    "2026-08-10;95;unentsch. Spät Training;;","2026-08-11;77;Vergessen (Halle);;Ball",
    "2026-07-28;4;Vergessen (Halle);;Ball","2026-08-20;8;Kabinenfest;;Geburtstag",
    "2026-08-20;19;Bierstrafen;;30. verweigert","2026-08-20;32;Bierstrafen;;30. Tor",
    "2026-08-24;8;Kabinenfest;;Geburtstag","2026-08-24;21;Kabinenfest;;Geburtstag",
    "2026-08-22;1;Vergessen (Halle);;Shirt","2026-08-22;7;Bierstrafen;;30. Tor",
    "2026-08-24;8;Vergessen (Halle);;Ball","2026-08-24;95;unentsch. Spät Training;;",
    "2026-08-25;95;unentsch. Spät Training;;","2026-08-29;4;Beitrag bezahlt;42;",
    "2026-08-29;34;Bierstrafen;;30. verweigert","2026-08-29;19;Bierstrafen;;30. Tor",
    "2026-08-29;21;Bierstrafen;;Bier verschüttet","2026-08-29;26;Bierstrafen;;Bier verschüttet",
    "2026-08-30;77;Amt/Spond vergessen;;Leibchen","2026-08-30;32;Bierstrafen;;30. Tor",
    "2026-08-30;22;Beitrag bezahlt;60;"
  ].join("\n");

  async function init(){
    $("manualEventDate").value = todayISO();
    $("penaltyDate").value = todayISO();
    $("dienstDate").value = todayISO();
    $("importBierlogText").value = BIERLOG_IMPORT_PREFILL;
    $("importStrafenText").value = STRAFEN_IMPORT_PREFILL;
    renderCatalogTable();
    buildPenaltySelect();
    loadUebersichtColVisibility();
    renderUebersichtColpicker();

    if(!window.claude || typeof window.claude.use !== "function"){
      showBanner("Diese Seite läuft außerhalb der Claude-Umgebung und kann keine Daten speichern.", true);
      return;
    }
    db = await window.claude.use("db");
    if(!db){
      showBanner("Die gemeinsame Datenbank ist in dieser Ansicht nicht verfügbar. Änderungen können nicht gespeichert werden.", true);
      return;
    }
    // Zuerst abonnieren, damit appSettings/settingsLoaded gesetzt ist, bevor die anderen
    // Snapshots (die ihrerseits maybeGenerateSlots/reassignSpielPriority anstoßen) eintreffen
    // – verhindert, dass vor dem Laden der Einstellung kurzzeitig mit der Standardannahme
    // "Auto-Zuteilung aktiv" generiert wird, obwohl sie eigentlich ausgeschaltet ist.
    subscribeSettings();
    subscribePlayers();
    subscribeEvents();
    subscribePenalties();
    subscribeDienste();
  }

  function showBanner(msg, isError){
    $("statusBanner").innerHTML = '<div class="banner' + (isError ? "" : " info") + '">' + esc(msg) + "</div>";
  }

  function subscribePlayers(){
    db.collection("players").orderBy("order","asc").onSnapshot(function(snap){
      var map = {}, order = [];
      snap.docs.forEach(function(d){ map[d.id] = d.data(); order.push(d.id); });
      playersMap = map; playersOrder = order;
      buildPenaltySelect();
      renderRosterAdmin();
      renderBierlog();
      renderUebersicht();
      renderStrafenlog();
      renderDienste();
      maybeGenerateSlots();
      reassignSpielPriority();
      maybeAddBirthdayPenalties();
    }, function(err){ console.error("players", err); });
  }

  // Globale Einstellung: schaltet die automatische Rotations-Generierung und die
  // Prioritäts-Neuzuteilung ab, falls Termine ausschließlich manuell gepflegt werden sollen.
  function subscribeSettings(){
    db.doc("meta/settings").onSnapshot(function(snap){
      appSettings = snap.exists ? (snap.data() || {}) : {};
      settingsLoaded = true;
      var toggle = $("autoGenerationToggle");
      if(toggle) toggle.checked = appSettings.autoGenerationEnabled !== false;
      maybeGenerateSlots();
      reassignSpielPriority();
    }, function(err){ console.error("settings", err); });
  }
  $("autoGenerationToggle").addEventListener("change", function(){
    if(!db) return;
    db.doc("meta/settings").set(Object.assign({}, appSettings, {autoGenerationEnabled: this.checked}))
      .catch(function(e){ console.error(e); });
  });

  $("btnDeleteFutureEvents").addEventListener("click", function(){
    if(!db) return;
    var btn = $("btnDeleteFutureEvents");
    var today = todayISO();
    var future = eventsList.filter(function(e){ return e.date >= today; });
    if(!btn.dataset.armed){
      btn.dataset.armed = "1";
      btn.textContent = "Wirklich " + future.length + " Termin(e) löschen und Auto-Zuteilung ausschalten? Nochmal klicken zum Bestätigen";
      setTimeout(function(){ btn.dataset.armed = ""; btn.textContent = "Alle zukünftigen Termine löschen"; }, 6000);
      return;
    }
    btn.dataset.armed = "";
    btn.textContent = "Alle zukünftigen Termine löschen";
    // Automatische Zuteilung wird zuerst ausgeschaltet und erst danach gelöscht – sonst
    // könnte die Rotation die gerade gelöschten Termine (durch eine zwischenzeitliche
    // Snapshot-Aktualisierung während des Löschens) sofort wieder neu anlegen.
    db.doc("meta/settings").set(Object.assign({}, appSettings, {autoGenerationEnabled: false}))
      .then(function(){
        return Promise.all(future.map(function(e){ return db.doc("events/" + e.id).delete(); }));
      })
      .then(function(){
        $("deleteFutureEventsResult").textContent = future.length + " zukünftige Termin(e) gelöscht. Automatische Zuteilung wurde dabei ausgeschaltet – über die Checkbox oben wieder aktivierbar.";
      })
      .catch(function(e){ console.error(e); $("deleteFutureEventsResult").textContent = "Fehler: " + e.message; });
  });

  // Legt ab der aktuellen Kalenderwoche bis zum Saisonende (BIERLOG_END) die üblichen
  // Termine (gleiches Wochentagsmuster/gleiche IDs wie die automatische Rotation) an, aber
  // ohne playerId – anders als die reguläre Rotation NICHT auf einen 2-Wochen-Horizont
  // begrenzt, da hier ja niemand automatisch zugeteilt wird. Bereits vorhandene Termine
  // (egal ob zugeteilt oder nicht) werden dabei nie angetastet.
  $("btnRestoreEmptySlots").addEventListener("click", function(){
    if(!db) return;
    var seasonStart = weekMonday(new Date());
    var seasonEnd = parseISO(BIERLOG_END);

    var existingIds = {};
    eventsList.forEach(function(e){ existingIds[e.id] = true; });

    var writes = [];
    for(var d = new Date(seasonStart); d <= seasonEnd; d.setDate(d.getDate() + 1)){
      var wd = d.getDay();
      var type = null;
      if(wd === 1 || wd === 2 || wd === 4) type = "training";
      else if(wd === 6) type = "spiel";
      if(!type) continue;
      var iso = toISODate(d);
      var key = iso + "_" + type;
      var needed = type === "spiel" ? 2 : 1;
      for(var slot = 0; slot < needed; slot++){
        var id = needed > 1 ? (key + "_" + (slot + 1)) : key;
        if(existingIds[id]) continue;
        writes.push(db.doc("events/" + id).set({date: iso, weekday: wd, type: type, playerId: "", done:false, manual:false}));
      }
    }
    if(writes.length === 0){
      $("restoreEmptyResult").textContent = "Für den aktuellen Zeitraum sind bereits alle Termine vorhanden.";
      return;
    }
    Promise.all(writes)
      .then(function(){ $("restoreEmptyResult").textContent = writes.length + " Termin(e) ohne Zuteilung wiederhergestellt."; })
      .catch(function(e){ console.error(e); $("restoreEmptyResult").textContent = "Fehler: " + e.message; });
  });

  function subscribeEvents(){
    db.collection("events").orderBy("date","desc").limit(1000).onSnapshot(function(snap){
      eventsList = snap.docs.map(function(d){ return Object.assign({id:d.id}, d.data()); });
      renderBierlog();
      renderUebersicht();
      maybeGenerateSlots();
      reassignSpielPriority();
    }, function(err){ console.error("events", err); });
  }

  function subscribePenalties(){
    db.collection("penalties").orderBy("date","desc").limit(1000).onSnapshot(function(snap){
      penaltiesList = snap.docs.map(function(d){ return Object.assign({id:d.id}, d.data()); });
      renderStrafenlog();
      renderUebersicht();
      reassignSpielPriority();
      maybeAddBirthdayPenalties();
    }, function(err){ console.error("penalties", err); });
  }

  function subscribeDienste(){
    db.collection("dienste").orderBy("date","desc").limit(1000).onSnapshot(function(snap){
      diensteList = snap.docs.map(function(d){ return Object.assign({id:d.id}, d.data()); });
      renderDienste();
      renderUebersicht();
    }, function(err){ console.error("dienste", err); });
  }

  // ---------- rotation generation (rollierend, max. 2 Wochen im Voraus) ----------
  async function maybeGenerateSlots(){
    if(!db || isGenerating) return;
    if(!settingsLoaded) return; // erst generieren, wenn meta/settings wirklich geladen ist
    if(appSettings.autoGenerationEnabled === false) return;
    var roster = activeRoster();
    if(roster.length === 0) return;

    // Termine werden immer ab der aktuellen Kalenderwoche generiert (nicht ab einem fest
    // hinterlegten Datum), damit beim Öffnen nie eine "leere" aktuelle/kommende Woche entsteht.
    // Die automatische Zuteilung erfolgt aber bewusst nur rollierend max. zwei Wochen im
    // Voraus (aktuelle + kommende KW) – so bleiben weiter in der Zukunft liegende Termine
    // frei für manuelle Planung und werden nicht vorzeitig automatisch belegt. Manuelle
    // Einträge (eigene IDs) liegen dabei ohnehin nie im Weg, da die Rotation ausschließlich
    // ihre eigene deterministische "Datum_Art"-ID prüft/schreibt und so nie etwas überschreibt,
    // das über den Horizont hinaus manuell eingetragen wurde.
    var seasonStart = weekMonday(new Date());
    var horizonEnd = new Date(seasonStart);
    horizonEnd.setDate(horizonEnd.getDate() + 13); // Ende der kommenden Kalenderwoche
    var seasonEnd = parseISO(BIERLOG_END);
    if(horizonEnd > seasonEnd) horizonEnd = seasonEnd;

    function neededFor(type){ return type === "spiel" ? 2 : 1; }

    // Anzahl bereits vorhandener automatischer (nicht manueller) bzw. manueller Termine je
    // Datum+Art. Manuelle Einträge (z. B. wenn schon jemand von Hand als zusätzliche Person
    // für ein Spiel eingetragen wurde) zählen auf den Bedarf – so werden nie mehr automatische
    // Slots erzeugt, als zusammen mit vorhandenen manuellen Einträgen insgesamt benötigt
    // werden. Stornierte automatische Slots zählen weiterhin als "vorhanden" (verhindert
    // Wiederauferstehung), fließen aber nicht in die Überschuss-Bereinigung unten ein.
    var existingAutoCountByKey = {};
    var manualCountByKey = {};
    var activeAutoDocsByKey = {};
    eventsList.forEach(function(e){
      var key = e.date + "_" + e.type;
      if(e.manual){
        if(!e.cancelled) manualCountByKey[key] = (manualCountByKey[key] || 0) + 1;
        return;
      }
      existingAutoCountByKey[key] = (existingAutoCountByKey[key] || 0) + 1;
      if(!e.cancelled){
        if(!activeAutoDocsByKey[key]) activeAutoDocsByKey[key] = [];
        activeAutoDocsByKey[key].push(e);
      }
    });

    var missing = [];
    for(var d = new Date(seasonStart); d <= horizonEnd; d.setDate(d.getDate() + 1)){
      var wd = d.getDay();
      var type = null;
      if(wd === 1 || wd === 2 || wd === 4) type = "training";
      else if(wd === 6) type = "spiel";
      if(!type) continue;
      var iso = toISODate(d);
      var key = iso + "_" + type;
      // Standardmäßig werden bei einem Spiel zwei Kisten (zwei unabhängige, je einzeln
      // absagbare Termine) eingeteilt, beim Training weiterhin nur eine – abzüglich bereits
      // vorhandener manueller Einträge für dasselbe Datum.
      var needed = neededFor(type);
      var autoNeeded = Math.max(0, needed - (manualCountByKey[key] || 0));
      var have = existingAutoCountByKey[key] || 0;
      for(var slot = have; slot < autoNeeded; slot++){
        var id = needed > 1 ? (key + "_" + (slot + 1)) : key;
        missing.push({id:id, date:iso, weekday:wd, type:type});
      }
    }

    // Überzählige automatisch generierte Termine bereinigen: kann entstehen, wenn für ein
    // Datum bereits manuell eine zusätzliche Person eingetragen war (z. B. aus der Zeit vor
    // der festen Zwei-Kisten-Regel) und zusätzlich automatische Slots hinzukamen, sodass in
    // Summe mehr als die gewünschte Anzahl an Terminen entsteht. Es werden ausschließlich
    // automatisch generierte, nicht bereits stornierte Überschuss-Termine entfernt – nie
    // manuell angelegte Einträge, denn die dürfen bewusst über den Bedarf hinausgehen.
    var cleanupWrites = [];
    Object.keys(activeAutoDocsByKey).forEach(function(key){
      var type = key.slice(11);
      var needed = neededFor(type);
      var autoNeeded = Math.max(0, needed - (manualCountByKey[key] || 0));
      var autoDocs = activeAutoDocsByKey[key];
      if(autoDocs.length <= autoNeeded) return;
      var excess = autoDocs.length - autoNeeded;
      var sorted = autoDocs.slice().sort(function(a,b){
        // Unangetastete Slots zuerst entfernen, danach nach ID (höchste zuerst).
        var aTouched = (a.done || a.kabinenfest || a.kistenBezahlt) ? 1 : 0;
        var bTouched = (b.done || b.kabinenfest || b.kistenBezahlt) ? 1 : 0;
        if(aTouched !== bTouched) return aTouched - bTouched;
        return b.id.localeCompare(a.id);
      });
      for(var i = 0; i < excess; i++){
        cleanupWrites.push(db.doc("events/" + sorted[i].id).delete());
      }
    });

    if(missing.length === 0 && cleanupWrites.length === 0) return;

    isGenerating = true;
    try{
      if(cleanupWrites.length) await Promise.all(cleanupWrites);
      if(missing.length){
        var lockRef = db.doc("meta/rotation");
        var acquireRes = await lockRef.acquire({holder: clientId, ttlMs: 60000});
        if(acquireRes.acquired){
          var snap = await lockRef.get();
          var nextIndex = (snap.exists && typeof snap.data().nextIndex === "number") ? snap.data().nextIndex : 0;
          var writes = missing.map(function(slot){
            var playerId = roster[nextIndex % roster.length];
            nextIndex++;
            return db.doc("events/" + slot.id).set({
              date: slot.date, weekday: slot.weekday, type: slot.type,
              playerId: playerId, done:false, manual:false
            });
          });
          await Promise.all(writes);
          await lockRef.set({nextIndex: nextIndex});
        }
      }
    } catch(e){ console.error("Rotation-Generierung/-Bereinigung fehlgeschlagen", e); }
    isGenerating = false;
  }
  $("btnRefreshSlots").addEventListener("click", function(){ maybeGenerateSlots(); reassignSpielPriority(); });

  // ---------- weekend priority reassignment ----------
  // Spieler mit offenen Strafkisten werden primär für kommende Spiele (Wochenende)
  // eingeteilt, bis ihre Schuld (aufgerundet auf ganze Termine, da ein gebrachter
  // Kasten am Wochenende doppelt zählt) rechnerisch beglichen wäre. Läuft ohne Lease,
  // da die Zuteilung deterministisch aus dem aktuellen Datenstand berechnet wird und
  // bei unverändertem Stand keine erneuten Schreibvorgänge auslöst (konvergent).
  function reassignSpielPriority(){
    if(!db || isReassigning) return;
    if(!settingsLoaded) return;
    if(appSettings.autoGenerationEnabled === false) return;
    var today = todayISO();
    // Termine, bei denen die Person über das Dropdown "Spieler tauschen" bewusst manuell
    // zugeteilt wurde (assignedManually), werden von der automatischen Prioritäts-Zuteilung
    // ausgenommen – sonst würde jede Neuberechnung (z. B. ausgelöst durch ein angekreuztes
    // Häkchen an anderer Stelle) eine per Hand gesetzte Zuteilung wieder überschreiben.
    var upcomingSpiel = eventsList.filter(function(e){
      return e.type === "spiel" && !e.manual && !e.done && !e.cancelled && !e.assignedManually && e.date >= today;
    }).sort(function(a,b){ return a.date.localeCompare(b.date); });
    if(upcomingSpiel.length === 0) return;

    var roster = activeRoster();
    if(roster.length === 0) return;

    var debts = {};
    roster.forEach(function(pid){ debts[pid] = computeRow(pid).offeneKisten; });
    var debtors = roster.filter(function(pid){ return debts[pid] > 0; })
      .sort(function(a,b){ return debts[b] - debts[a]; });
    if(debtors.length === 0) return;

    var slotAssignments = [];
    debtors.forEach(function(pid){
      var slotsForDebt = Math.ceil(debts[pid] / 2);
      for(var i = 0; i < slotsForDebt; i++) slotAssignments.push(pid);
    });

    var writes = [];
    for(var i = 0; i < upcomingSpiel.length && i < slotAssignments.length; i++){
      var ev = upcomingSpiel[i];
      var desired = slotAssignments[i];
      if(ev.playerId !== desired){
        writes.push(db.doc("events/" + ev.id).update({playerId: desired}));
      }
    }
    if(writes.length === 0) return;
    isReassigning = true;
    Promise.all(writes).catch(function(e){ console.error("Prioritäts-Zuteilung fehlgeschlagen", e); })
      .then(function(){ isReassigning = false; }, function(){ isReassigning = false; });
  }

  // ---------- automatische Geburtstags-Kabinenfeste ----------
  // An ihrem Geburtstag bekommt jede Person automatisch eine Kabinenfest-Strafe mit der
  // Bemerkung "Geburtstag" ins Strafenlog eingetragen – nur am Tag selbst, nie im Voraus
  // (Prüfung läuft live gegen das heutige Datum) und nur einmal pro Person und Jahr
  // (deterministische Dokument-ID "birthday-{Spieler}-{Jahr}" verhindert Duplikate).
  function maybeAddBirthdayPenalties(){
    if(!db || isAddingBirthday) return;
    var today = todayISO();
    var todayMD = today.slice(5);
    var year = today.slice(0, 4);
    var kfCatalog = CATALOG.find(function(c){ return c.id === KABINENFEST_CATALOG_ID; });
    if(!kfCatalog) return;

    var writes = [];
    playersOrder.forEach(function(id){
      var p = playersMap[id];
      if(!p || !p.birthday || p.birthday.slice(5) !== todayMD) return;
      var docId = "birthday-" + id + "-" + year;
      var already = penaltiesList.some(function(pen){ return pen.id === docId; });
      if(already) return;
      writes.push(db.doc("penalties/" + docId).set({
        playerId: id, catalogId: kfCatalog.id, catalogName: kfCatalog.name, isPayment: false,
        date: today, amountEuro: kfCatalog.amount || 0, nonMonetary: kfCatalog.nonMonetary || null,
        note: "Geburtstag", createdAt: new Date().toISOString(), auto: true
      }));
    });
    if(writes.length === 0) return;
    isAddingBirthday = true;
    Promise.all(writes).catch(function(e){ console.error("Geburtstags-Kabinenfest fehlgeschlagen", e); })
      .then(function(){ isAddingBirthday = false; }, function(){ isAddingBirthday = false; });
  }

  // ---------- Bierlog rendering ----------
  function dateParts(iso){
    var d = parseISO(iso);
    return {day: String(d.getDate()).padStart(2,"0"), wd: WD_SHORT[d.getDay()], month: MONTH_SHORT[d.getMonth()], year: d.getFullYear()};
  }

  function eventRowHTML(ev){
    var dp = dateParts(ev.date);
    var typeBadge = ev.type === "spiel" ? '<span class="badge badge-spiel">Spiel</span>' : '<span class="badge badge-training">Training</span>';
    var manualBadge = ev.manual ? '<span class="badge badge-manual">manuell</span>' : "";
    var rowCls = "event-row" + (ev.cancelled ? " cancelled" : (ev.vergessen ? " vergessen" : (ev.done ? " done" : "")));
    var toggleBtn = '<button type="button" class="iconbtn" data-action="delete-event" data-id="' + esc(ev.id) +
      '" data-cancelled="' + (ev.cancelled ? "true" : "false") + '" title="' +
      (ev.cancelled ? "Absage rückgängig machen" : "Termin absagen") + '">' + (ev.cancelled ? "↺" : "✕") + '</button>';

    if(ev.cancelled){
      // Abgesagte Termine bleiben sichtbar (rot markiert), aber ohne Spielerauswahl/-häkchen –
      // ein erneuter Klick auf den Button macht die Absage rückgängig.
      var cancelledBadge = '<span class="badge badge-cancelled">Abgesagt</span>';
      return (
        '<div class="' + rowCls + '">' +
          '<div class="date-block"><div class="day">' + dp.day + '</div><div class="sub">' + dp.wd + '. ' + dp.month + '</div></div>' +
          '<div class="row-mid">' + typeBadge + manualBadge + cancelledBadge + playerChip(ev.playerId) + '</div>' +
          '<div></div>' +
          '<div class="row-actions">' + toggleBtn + '</div>' +
        '</div>'
      );
    }

    var doneChecked = ev.done ? "checked" : "";
    var kfChecked = ev.kabinenfest ? "checked" : "";
    var vergessenChecked = ev.vergessen ? "checked" : "";
    // Zuteilungs-Dropdown: zeigt neben Name (ohne Trikotnummer) auch den aktuellen
    // Bierliste-Wert (Übersicht) und das Datum des letzten mitgebrachten Kastens. Sortiert
    // wird zuerst aufsteigend nach dem Bierliste-Wert (wer am wenigsten mitgebracht hat, steht
    // oben) und bei Gleichstand aufsteigend nach dem Datum der letzten Einteilung (wer am
    // längsten nicht mehr dran war bzw. noch nie eingeteilt wurde, steht oben).
    var swapRosterSorted = activeRoster().slice().sort(function(idA, idB){
      var diff = computeRow(idA).bierliste - computeRow(idB).bierliste;
      if(diff !== 0) return diff;
      var dateA = lastBierlisteDate(idA) || "";
      var dateB = lastBierlisteDate(idB) || "";
      return dateA.localeCompare(dateB);
    });
    var swapOptions = '<option value=""' + (!ev.playerId ? " selected" : "") + '>– zuteilen –</option>' +
      swapRosterSorted.map(function(id){
        var lastDate = lastBierlisteDate(id);
        var p = playersMap[id];
        var name = p ? p.initials : ("#" + id);
        var info = " (Bierliste: " + computeRow(id).bierliste + ", zuletzt: " + (lastDate ? formatDateDE(lastDate) : "–") + ")";
        return '<option value="' + esc(id) + '"' + (id === ev.playerId ? " selected" : "") + '>' + esc(name) + esc(info) + '</option>';
      }).join("");
    return (
      '<div class="' + rowCls + '">' +
        '<div class="date-block"><div class="day">' + dp.day + '</div><div class="sub">' + dp.wd + '. ' + dp.month + '</div></div>' +
        '<div class="row-mid">' + typeBadge + manualBadge + playerChip(ev.playerId) + '</div>' +
        '<div></div>' +
        '<div class="row-actions">' +
          '<label class="check icon-check icon-done" title="gebracht' + (ev.type === "spiel" ? " – zählt bei Spielen automatisch 2 Strafkisten als bezahlt" : "") + '"><input type="checkbox" data-action="toggle-done" data-id="' + esc(ev.id) + '" aria-label="gebracht" ' + doneChecked + '><span class="icon-box" aria-hidden="true">&#10003;</span></label>' +
          '<label class="check icon-check icon-kf" title="Kabinenfest"><input type="checkbox" data-action="toggle-kf" data-id="' + esc(ev.id) + '" aria-label="Kabinenfest" ' + kfChecked + '><span class="icon-box" aria-hidden="true">&#127829;</span></label>' +
          '<label class="check icon-check icon-vergessen" title="vergessen – trägt dem eingeteilten Spieler automatisch eine Strafe (1 - Bierstrafen) mit der Bemerkung \'Bier vergessen\' ins Strafenlog ein."><input type="checkbox" data-action="toggle-vergessen" data-id="' + esc(ev.id) + '" aria-label="vergessen" ' + vergessenChecked + '><span class="icon-box" aria-hidden="true">?</span></label>' +
          '<select data-action="swap-player" data-id="' + esc(ev.id) + '">' + swapOptions + '</select>' +
          toggleBtn +
        '</div>' +
      '</div>'
    );
  }

  function weekMonday(d){
    var wd = d.getDay();
    var diff = wd === 0 ? 6 : wd - 1;
    var m = new Date(d);
    m.setDate(m.getDate() - diff);
    return m;
  }
  function isoWeekNumber(d){
    var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    var dayNum = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - dayNum);
    var yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil((((t - yearStart) / 86400000) + 1) / 7);
  }
  function weekDividerHTML(monday){
    var sunday = new Date(monday); sunday.setDate(sunday.getDate() + 6);
    var mp = dateParts(toISODate(monday)), sp = dateParts(toISODate(sunday));
    return '<div class="week-divider"><span class="kw">KW ' + isoWeekNumber(monday) + '</span><span>' +
      mp.day + '.' + (monday.getMonth()+1) + '. – ' + sp.day + '.' + (sunday.getMonth()+1) + '.' + sp.year +
    '</span></div>';
  }

  function renderBierlog(){
    var today = todayISO();
    var currentMonday = weekMonday(parseISO(today));
    var seasonEnd = parseISO(BIERLOG_END);

    // "Älter" heißt: Woche vor der aktuellen Kalenderwoche – nicht einfach "vor heute", damit
    // ein bereits vergangener Wochentag innerhalb der aktuellen Woche (z. B. Montags-Training,
    // wenn heute Donnerstag ist) weiterhin wie gewohnt behandelt wird und nicht fälschlich den
    // "Ältere Termine"-Button auslöst.
    var currentMondayISO = toISODate(currentMonday);
    var pastEvents = eventsList.filter(function(e){ return weekMonday(parseISO(e.date)) < currentMonday; })
      .sort(function(a,b){ return a.date.localeCompare(b.date) || a.type.localeCompare(b.type); });
    // Ab Wochenbeginn (nicht erst ab "heute") filtern, damit ein bereits vergangener
    // Wochentag innerhalb der aktuellen Woche (z. B. Montags-Training, wenn heute Donnerstag
    // ist) wie im obigen Kommentar beschrieben in der aktuellen Woche auftaucht, statt weder
    // hier noch bei "Ältere Termine" zu erscheinen.
    var upcoming = eventsList.filter(function(e){ return e.date >= currentMondayISO && e.date <= BIERLOG_END; })
      .sort(function(a,b){ return a.date.localeCompare(b.date) || a.type.localeCompare(b.type); });

    // Gesamtzahl der Kalenderwochen vor der aktuellen Woche, die überhaupt Altdaten enthalten
    // (von der frühesten aufgezeichneten Woche bis exklusive der aktuellen Woche).
    var earliestMonday = pastEvents.length > 0 ? weekMonday(parseISO(pastEvents[0].date)) : null;
    var totalPastWeeks = 0;
    if(earliestMonday){
      for(var cw = new Date(earliestMonday); cw < currentMonday; cw.setDate(cw.getDate() + 7)) totalPastWeeks++;
    }
    var pastWeeksToShow = Math.min(bierlogPastWeeksShown, totalPastWeeks);

    $("btnOlderBierlog").hidden = pastWeeksToShow >= totalPastWeeks;

    var html = "";

    // Ältere Termine (z. B. importierte Altdaten von vor Saisonstart) – standardmäßig
    // ausgeblendet. "Ältere Termine anzeigen" blendet dabei, analog zu "Mehr anzeigen" bei den
    // kommenden Terminen, immer nur 2 weitere Kalenderwochen VOR den bereits sichtbaren Wochen
    // ein (nicht gleich alle auf einmal) – der Button bleibt danach verfügbar, bis die früheste
    // aufgezeichnete Woche erreicht ist. Wochenweise wie der übrige Bierlog dargestellt,
    // chronologisch aufsteigend bis zur aktuellen Woche.
    if(pastWeeksToShow > 0){
      var visibleStart = new Date(currentMonday); visibleStart.setDate(visibleStart.getDate() - pastWeeksToShow * 7);
      for(var pw = new Date(visibleStart); pw < currentMonday; pw.setDate(pw.getDate() + 7)){
        var pwEnd = new Date(pw); pwEnd.setDate(pwEnd.getDate() + 7);
        var pwStartISO = toISODate(pw), pwEndISO = toISODate(pwEnd);
        html += weekDividerHTML(pw);
        var weekPast = pastEvents.filter(function(e){ return e.date >= pwStartISO && e.date < pwEndISO; });
        if(weekPast.length === 0){
          html += '<div class="empty">Keine Termine in dieser Woche.</div>';
        } else {
          weekPast.forEach(function(ev){ html += eventRowHTML(ev); });
        }
      }
    }

    if(upcoming.length === 0){
      html += '<div class="empty">Keine Termine im Zeitraum – Kader oder Verbindung prüfen.</div>';
      $("btnMoreBierlog").hidden = true;
      $("bierlogList").innerHTML = html;
      bindRowActions("bierlogList");
      return;
    }

    // Basis: aktuelle Kalenderwoche + KW+1, IMMER mit eigenem Wochenteiler gezeigt – auch
    // wenn eine davon (noch) keine Termine enthält. Jeder Klick auf "Mehr anzeigen" blendet
    // genau zwei weitere Wochen ein (nicht gleich den ganzen Rest der Saison); der Button
    // bleibt danach verfügbar, bis das Saisonende erreicht ist.
    var totalWeeks = 2 + bierlogExtraWeeks;

    var weeksRendered = 0;
    for(var i = 0; i < totalWeeks; i++){
      var weekStart = new Date(currentMonday); weekStart.setDate(weekStart.getDate() + i * 7);
      if(weekStart > seasonEnd) break;
      var weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 7);
      var weekStartISO = toISODate(weekStart), weekEndISO = toISODate(weekEnd);

      html += weekDividerHTML(weekStart);
      var weekEvents = upcoming.filter(function(e){ return e.date >= weekStartISO && e.date < weekEndISO; });
      if(weekEvents.length === 0){
        html += '<div class="empty">Keine Termine in dieser Woche.</div>';
      } else {
        weekEvents.forEach(function(ev){ html += eventRowHTML(ev); });
      }
      weeksRendered++;
    }

    var nextWindowStart = new Date(currentMonday); nextWindowStart.setDate(nextWindowStart.getDate() + weeksRendered * 7);
    $("btnMoreBierlog").hidden = nextWindowStart > seasonEnd;

    $("bierlogList").innerHTML = html;
    bindRowActions("bierlogList");
  }
  $("btnMoreBierlog").addEventListener("click", function(){ bierlogExtraWeeks += 2; renderBierlog(); });
  $("btnOlderBierlog").addEventListener("click", function(){ bierlogPastWeeksShown += 2; renderBierlog(); });

  // ---------- Bierlog-Export (kopierbare Nachricht) ----------
  // Baut aus der aktuellen, der kommenden und der übernächsten Kalenderwoche eine Textnachricht
  // im Format "Datum: Name" (mit "Kabinenfest " vor dem Namen, falls dort eingetragen), mit einer
  // Leerzeile zwischen den Wochen – zum Einfügen z. B. in den Team-Chat. Enthält nur
  // Trainings-Termine (Spiele werden hier bewusst nicht aufgelistet) und nur Termine, bei denen
  // bereits jemand eingeteilt wurde (nicht zugeteilte Termine werden ausgelassen). Bereits
  // verstrichene Termine der aktuellen Woche (z. B. Montag/Dienstag, wenn man erst mittwochs
  // kopiert) werden nicht mehr mit aufgeführt – es zählt das heutige Datum, nicht der
  // Wochenbeginn. Leere Wochen-Blöcke (z. B. weil die übernächste Woche noch nicht eingeteilt
  // ist) werden übersprungen, statt eine leere Zeile zu erzeugen. Der Nachricht wird immer die
  // Überschrift "Bier für:" mit einer Leerzeile voran gestellt.
  function buildBierlogExportText(){
    var today = todayISO();
    var currentMonday = weekMonday(parseISO(today));
    var week0End = new Date(currentMonday); week0End.setDate(week0End.getDate() + 7);
    var week0EndISO = toISODate(week0End);
    var week1End = new Date(week0End); week1End.setDate(week1End.getDate() + 7);
    var week1EndISO = toISODate(week1End);
    var week2End = new Date(week1End); week2End.setDate(week2End.getDate() + 7);
    var week2EndISO = toISODate(week2End);

    var relevant = eventsList.filter(function(e){
      return !e.cancelled && e.type === "training" && !!e.playerId &&
        e.date >= today && e.date < week2EndISO;
    }).sort(function(a,b){ return a.date.localeCompare(b.date) || a.type.localeCompare(b.type); });

    var week0Lines = [], week1Lines = [], week2Lines = [];
    relevant.forEach(function(e){
      var p = playersMap[e.playerId];
      var name = p ? p.initials : "– nicht zugeteilt –";
      var line = formatDateDE(e.date) + ": " + (e.kabinenfest ? "Kabinenfest " : "") + name;
      var bucket = e.date < week0EndISO ? week0Lines : (e.date < week1EndISO ? week1Lines : week2Lines);
      bucket.push(line);
    });
    var body = [week0Lines, week1Lines, week2Lines]
      .filter(function(lines){ return lines.length > 0; })
      .map(function(lines){ return lines.join("\n"); })
      .join("\n\n");
    return "Bier für:\n\n" + body;
  }

  $("btnExportBierlog").addEventListener("click", function(){
    var text = buildBierlogExportText();
    var output = $("bierlogExportOutput");
    var resultEl = $("bierlogExportResult");
    output.value = text;
    output.hidden = false;
    output.focus();
    output.select();

    function fallbackCopy(){
      try{
        var ok = document.execCommand && document.execCommand("copy");
        resultEl.textContent = ok
          ? "In die Zwischenablage kopiert."
          : "Bitte manuell kopieren (markiert, Strg+C bzw. Cmd+C).";
      } catch(e){
        resultEl.textContent = "Bitte manuell kopieren (markiert, Strg+C bzw. Cmd+C).";
      }
    }

    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text)
        .then(function(){ resultEl.textContent = "In die Zwischenablage kopiert."; })
        .catch(fallbackCopy);
    } else {
      fallbackCopy();
    }
  });

  function bindRowActions(containerId){
    var el = $(containerId);
    el.querySelectorAll('[data-action="toggle-done"]').forEach(function(box){
      box.onchange = function(){ db.doc("events/" + box.dataset.id).update({done: box.checked}).catch(function(e){ console.error(e); }); };
    });
    el.querySelectorAll('[data-action="toggle-kf"]').forEach(function(box){
      box.onchange = function(){ db.doc("events/" + box.dataset.id).update({kabinenfest: box.checked}).catch(function(e){ console.error(e); }); };
    });
    el.querySelectorAll('[data-action="toggle-vergessen"]').forEach(function(box){
      // Ankreuzen trägt automatisch eine Strafe (1 - Bierstrafen, "Bier vergessen") für den an
      // diesem Termin eingeteilten Spieler ins Strafenlog ein; die erzeugte Strafen-ID wird am
      // Termin gespeichert, damit ein erneutes Abhaken sie gezielt wieder entfernen kann, statt
      // pauschal nach passenden Strafen zu suchen.
      box.onchange = function(){
        var id = box.dataset.id;
        var checked = box.checked;
        var ev = eventsList.find(function(e){ return e.id === id; });
        if(!ev) return;
        if(checked){
          var c = CATALOG.find(function(x){ return x.id === 1; });
          db.collection("penalties").add({
            playerId: ev.playerId, catalogId: c.id, catalogName: c.name, isPayment:false,
            date: ev.date, amountEuro: c.amount || 0, nonMonetary: c.nonMonetary || null,
            note: "Bier vergessen", createdAt: new Date().toISOString()
          }).then(function(ref){
            return db.doc("events/" + id).update({vergessen:true, vergessenPenaltyId: ref.id});
          }).catch(function(e){ console.error(e); });
        } else {
          var penaltyId = ev.vergessenPenaltyId;
          var p = db.doc("events/" + id).update({vergessen:false, vergessenPenaltyId: null});
          if(penaltyId) p = Promise.all([p, db.doc("penalties/" + penaltyId).delete()]);
          p.catch(function(e){ console.error(e); });
        }
      };
    });
    el.querySelectorAll('[data-action="swap-player"]').forEach(function(sel){
      // Eine per Hand über dieses Dropdown gewählte Zuteilung wird als "assignedManually"
      // markiert und danach nie wieder automatisch überschrieben (siehe reassignSpielPriority).
      sel.onchange = function(){
        db.doc("events/" + sel.dataset.id).update({playerId: sel.value, assignedManually: true}).catch(function(e){ console.error(e); });
      };
    });
    el.querySelectorAll('[data-action="delete-event"]').forEach(function(btn){
      // "Absagen": statt den Termin hart zu löschen, wird er als storniert markiert – der
      // Eintrag bleibt sichtbar (rot, ohne Spielerauswahl) und zählt nirgends mehr, aber die
      // automatische Rotation legt für dieses Datum keinen neuen Termin nach. Ein erneuter
      // Klick macht die Absage rückgängig (Toggle, Zustand kommt aus data-cancelled).
      btn.onclick = function(){
        var isCancelled = btn.dataset.cancelled === "true";
        db.doc("events/" + btn.dataset.id).update({cancelled: !isCancelled}).catch(function(e){ console.error(e); });
      };
    });
  }

  // ---------- manual event form ----------
  function fillPlayerSelect(sel, includeInactive){
    var ids = includeInactive ? playersOrder : activeRoster();
    sel.innerHTML = ids.map(function(id){ return '<option value="' + esc(id) + '">' + esc(playerLabel(id)) + '</option>'; }).join("");
  }

  $("manualEventForm").addEventListener("submit", function(ev){
    ev.preventDefault();
    if(!db) return;
    var date = $("manualEventDate").value;
    var type = $("manualEventType").value;
    var playerId = $("manualEventPlayer").value;
    var done = $("manualEventDone").checked;
    if(!date || !playerId) return;
    // Eigene, eindeutige ID pro Eintrag (statt "Datum_Art") – so lassen sich für
    // denselben Termin mehrere manuelle Einträge anlegen, z. B. wenn bei einem
    // Spiel mehrere Personen eine Kiste mitbringen.
    db.collection("events").add({date:date, weekday: parseISO(date).getDay(), type:type, playerId:playerId, done:done, manual:true})
      .then(function(){ ev.target.reset(); $("manualEventDate").value = todayISO(); })
      .catch(function(e){ console.error(e); });
  });

  // ---------- roster admin ----------
  function renderRosterAdmin(){
    fillPlayerSelect($("manualEventPlayer"), false);
    $("rosterList").innerHTML = playersOrder.map(function(id){
      var p = playersMap[id];
      var toggleLabel = p.active === false ? "reaktivieren" : "entfernen";
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--border);">' +
        playerChip(id) +
        '<button type="button" class="iconbtn" data-action="toggle-active" data-id="' + esc(id) + '">' + toggleLabel + '</button>' +
      '</div>';
    }).join("") || '<div class="empty">Noch keine Spieler im Kader.</div>';
    $("rosterList").querySelectorAll('[data-action="toggle-active"]').forEach(function(btn){
      btn.onclick = function(){
        var p = playersMap[btn.dataset.id];
        db.doc("players/" + btn.dataset.id).update({active: p.active === false ? true : false}).catch(function(e){ console.error(e); });
      };
    });
  }

  $("rosterForm").addEventListener("submit", function(ev){
    ev.preventDefault();
    if(!db) return;
    var number = $("rosterNumber").value.trim();
    var initials = $("rosterInitials").value.trim().toUpperCase();
    if(!number || !initials) return;
    var maxOrder = -1;
    playersOrder.forEach(function(id){ if(playersMap[id].order > maxOrder) maxOrder = playersMap[id].order; });
    db.doc("players/" + number).set({number:number, initials:initials, order: maxOrder + 1, active:true})
      .then(function(){ ev.target.reset(); })
      .catch(function(e){ console.error(e); });
  });

  // ---------- Bierlog-Altdaten-Import ----------
  // Einmaliger Massenimport historischer Termine (z. B. vor Einführung der App geführte
  // Listen). Jede Zeile "Datum;Art;Rückennummer;gebracht;Kabinenfest" wird ein eigener
  // manueller Bierlog-Termin. Erneuter Import derselben Zeilen erzeugt keine Duplikate,
  // da inhaltlich identische, bereits vorhandene manuelle Termine übersprungen werden.
  function numberToPlayerId(num){
    var found = null;
    playersOrder.forEach(function(id){
      if(found) return;
      if(String(playersMap[id].number) === String(num)) found = id;
    });
    return found;
  }

  $("btnImportBierlog").addEventListener("click", function(){
    if(!db) return;
    var raw = $("importBierlogText").value.split("\n");
    var toWrite = [], errors = [], skippedDup = 0, skippedEmpty = 0;
    raw.forEach(function(line, idx){
      line = line.trim();
      if(!line || line.charAt(0) === "#") return;
      var parts = line.split(";").map(function(s){ return s.trim(); });
      if(parts.length < 3 || !parts[0] || !parts[2]){ errors.push("Zeile " + (idx+1) + ": ungültiges Format"); return; }
      var date = parts[0];
      var type = (parts[1] || "training").toLowerCase() === "spiel" ? "spiel" : "training";
      var num = parts[2];
      var done = parts[3] === "1";
      var kabinenfest = parts[4] === "1";
      var d;
      try{ d = parseISO(date); if(isNaN(d.getTime())) throw new Error("bad date"); }
      catch(e){ errors.push("Zeile " + (idx+1) + ": ungültiges Datum \"" + date + "\""); return; }
      var playerId = numberToPlayerId(num);
      if(!playerId){ errors.push("Zeile " + (idx+1) + ": Rückennummer " + num + " nicht im Kader gefunden"); return; }
      var already = eventsList.some(function(e){
        return e.manual && e.date === date && e.type === type && e.playerId === playerId &&
          !!e.done === done && !!e.kabinenfest === kabinenfest;
      });
      if(already){ skippedDup++; return; }
      toWrite.push({date: date, weekday: d.getDay(), type: type, playerId: playerId, done: done, manual: true, kabinenfest: kabinenfest});
    });
    if(toWrite.length === 0){
      $("importBierlogResult").textContent = "Nichts zu importieren. " +
        (skippedDup ? skippedDup + " Zeile(n) bereits vorhanden. " : "") +
        (errors.length ? "Fehler: " + errors.join(" | ") : "");
      return;
    }
    Promise.all(toWrite.map(function(ev){ return db.collection("events").add(ev); }))
      .then(function(){
        $("importBierlogResult").textContent = toWrite.length + " Termin(e) importiert." +
          (skippedDup ? " " + skippedDup + " bereits vorhanden übersprungen." : "") +
          (errors.length ? " Fehler: " + errors.join(" | ") : "");
      })
      .catch(function(e){ console.error(e); $("importBierlogResult").textContent = "Fehler beim Import: " + e.message; });
  });

  // ---------- Dienste ----------
  $("dienstForm").addEventListener("submit", function(ev){
    ev.preventDefault();
    if(!db) return;
    var title = $("dienstTitle").value.trim();
    var date = $("dienstDate").value;
    var time = $("dienstTime").value;
    var count = Math.max(1, Math.round(Number($("dienstCount").value || 1)));
    if(!title || !date) return;
    db.collection("dienste").add({
      title: title,
      date: date,
      time: time,
      requiredCount: count,
      assignedPlayerIds: new Array(count).fill(null),
      createdAt: new Date().toISOString()
    }).then(function(){
      ev.target.reset();
      $("dienstDate").value = todayISO();
      $("dienstCount").value = 1;
    }).catch(function(e){ console.error(e); });
  });

  function dienstSlotCount(d){
    if(typeof d.requiredCount === "number" && d.requiredCount > 0) return d.requiredCount;
    if(Array.isArray(d.assignedPlayerIds)) return d.assignedPlayerIds.length;
    return 1;
  }
  function dienstAssigned(d){
    if(Array.isArray(d.assignedPlayerIds)) return d.assignedPlayerIds;
    if(d.playerId) return [d.playerId];
    return [];
  }

  function dienstRowHTML(d){
    var count = dienstSlotCount(d);
    var assigned = dienstAssigned(d);
    var roster = activeRoster();
    var slots = [];
    for(var i = 0; i < count; i++){
      var current = assigned[i] || "";
      var options = '<option value="">–</option>' + roster.map(function(id){
        return '<option value="' + esc(id) + '"' + (id === current ? " selected" : "") + '>' + esc(playerLabel(id)) + '</option>';
      }).join("");
      var slotCls = current ? "" : " class=\"dienst-slot-open\"";
      slots.push('<select data-action="dienst-slot" data-id="' + esc(d.id) + '" data-slot="' + i + '"' + slotCls + '>' + options + '</select>');
    }
    return '<tr>' +
      '<td class="num">' + formatDateDE(d.date) + '</td>' +
      '<td class="num">' + esc(d.time || "") + '</td>' +
      '<td>' + esc(d.title || d.note || "") + '</td>' +
      '<td><div class="row-mid">' + slots.join("") + '</div></td>' +
      '<td><button type="button" class="iconbtn" data-action="delete-dienst" data-id="' + esc(d.id) + '" title="Löschen">✕</button></td>' +
    '</tr>';
  }

  function renderDienste(){
    var rows = diensteList.slice().sort(function(a,b){
      return a.date.localeCompare(b.date) || (a.time || "").localeCompare(b.time || "");
    });
    $("dienstEmpty").hidden = rows.length > 0;
    $("dienstTable").querySelector("tbody").innerHTML = rows.map(dienstRowHTML).join("");
    $("dienstTable").querySelectorAll('[data-action="delete-dienst"]').forEach(function(btn){
      btn.onclick = function(){ db.doc("dienste/" + btn.dataset.id).delete().catch(function(e){ console.error(e); }); };
    });
    $("dienstTable").querySelectorAll('[data-action="dienst-slot"]').forEach(function(sel){
      sel.onchange = function(){
        var id = sel.dataset.id, slotIdx = Number(sel.dataset.slot);
        var d = diensteList.find(function(x){ return x.id === id; });
        if(!d) return;
        var count = dienstSlotCount(d);
        var arr = dienstAssigned(d).slice();
        while(arr.length < count) arr.push(null);
        arr[slotIdx] = sel.value || null;
        db.doc("dienste/" + id).update({assignedPlayerIds: arr, requiredCount: count}).catch(function(e){ console.error(e); });
      };
    });
  }

  // Letztes Datum, an dem diese Person laut der gleichen Logik wie der "Bierliste"-Zähler in
  // der Übersicht einen Kasten mitgebracht hat (Training: "gebracht" oder "Kabinenfest"; Spiel:
  // nur "Kabinenfest") – oder null, falls noch nie. Wird im Zuteilungs-Dropdown im Bierlog
  // angezeigt, damit man sieht, wer zuletzt dran war.
  function lastBierlisteDate(id){
    var last = null;
    eventsList.forEach(function(e){
      if(e.cancelled || e.playerId !== id) return;
      var counts = e.type === "spiel" ? !!e.kabinenfest : (e.done || e.kabinenfest);
      if(!counts) return;
      if(!last || e.date > last) last = e.date;
    });
    return last;
  }

  // ---------- Übersicht ----------
  var KABINENFEST_CATALOG_ID = 16;

  function computeRow(id){
    var p = playersMap[id];
    var assigned = 0, bierliste = 0, kabinenfestErfuellt = 0, kistenBezahltErfuellt = 0;
    eventsList.forEach(function(e){
      if(e.cancelled) return;
      if(e.playerId === id){
        assigned++;
        if(e.kabinenfest) kabinenfestErfuellt++;
        if(e.type === "spiel"){
          // Kabinenfest zählt weiterhin in die Bierliste. Wer bei einem Spiel "gebracht"
          // angehakt hat, bekommt automatisch 2 Strafkisten als bezahlt gutgeschrieben
          // (eine mitgebrachte Kiste deckt am Wochenende zwei offene Strafkisten).
          if(e.kabinenfest) bierliste++;
          if(e.done) kistenBezahltErfuellt += 2;
        } else {
          if(e.done || e.kabinenfest) bierliste++;
        }
      }
    });

    var catCounts = {};
    CATALOG.forEach(function(c){ catCounts[c.id] = 0; });
    var strafenSum = 0, bezahlt = 0;
    penaltiesList.forEach(function(pen){
      if(pen.playerId === id){
        if(pen.isPayment){
          bezahlt += (pen.amountEuro || 0);
        } else {
          catCounts[pen.catalogId] = (catCounts[pen.catalogId] || 0) + 1;
          strafenSum += (pen.amountEuro || 0);
        }
      }
    });
    var strafkisten = CRATE_CATALOG_IDS.reduce(function(s,cid){ return s + (catCounts[cid] || 0); }, 0);
    // "Strafkisten bezahlt" zählt automatisch aus dem Bierlog: pro Spiel, bei dem "gebracht"
    // angehakt ist, +2. Eventuell zuvor manuell eingetragene Werte (players/{id}.strafkistenBezahlt,
    // aus der Zeit vor dieser Automatisierung) werden weiterhin als Basis dazugezählt, damit
    // keine bereits erfassten Zahlungen verloren gehen.
    var strafkistenBezahlt = Number(p.strafkistenBezahlt || 0) + kistenBezahltErfuellt;
    var offeneKisten = strafkisten - strafkistenBezahlt;
    var offeneSumme = (TEAM_FEE + strafenSum) - bezahlt;
    var dienste = diensteList.reduce(function(s,d){ return s + dienstAssigned(d).filter(function(pid){ return pid === id; }).length; }, 0);
    var kfOffen = (catCounts[KABINENFEST_CATALOG_ID] || 0) - kabinenfestErfuellt;

    return {
      id:id, assigned:assigned, bierliste:bierliste, catCounts:catCounts, strafenSum:strafenSum,
      strafkisten:strafkisten, strafkistenBezahlt:strafkistenBezahlt,
      offeneKisten:offeneKisten, bezahlt:bezahlt, offeneSumme:offeneSumme, kfOffen:kfOffen,
      birthday:p.birthday || "", dienste:dienste
    };
  }

  // Sortierung der Übersicht per Klick auf einen Spaltenkopf (Name, feste Spalten oder eine
  // Strafenkatalog-Spalte). Erneuter Klick auf dieselbe Spalte kehrt die Richtung um.
  var uebersichtSort = {key: null, dir: "asc"};

  function sortArrowHTML(key){
    if(uebersichtSort.key !== key) return "";
    return uebersichtSort.dir === "asc" ? " ▲" : " ▼";
  }

  function uebersichtSortValue(key, id, r){
    if(key === "name") return Number(playersMap[id] && playersMap[id].number) || 0;
    if(key === "grundbeitrag") return TEAM_FEE;
    if(key.indexOf("cat") === 0){ return r.catCounts[Number(key.slice(3))] || 0; }
    var v = r[key];
    if(typeof v === "number") return v;
    return v || "";
  }

  $("uebersichtHead").addEventListener("click", function(e){
    var th = e.target.closest("th[data-sort]");
    if(!th) return;
    var key = th.dataset.sort;
    if(uebersichtSort.key === key){
      uebersichtSort.dir = uebersichtSort.dir === "asc" ? "desc" : "asc";
    } else {
      uebersichtSort.key = key;
      uebersichtSort.dir = "asc";
    }
    renderUebersicht();
  });

  // Berechnet für alle Spieler die Übersichtszeilen und die aktuell gültige Sortierreihenfolge
  // (nach uebersichtSort) – gemeinsam genutzt von renderUebersicht und dem PNG-Export, damit
  // der Export exakt das abbildet, was gerade auf dem Bildschirm zu sehen ist.
  function computeUebersichtRows(){
    var rowsById = {};
    playersOrder.forEach(function(id){ rowsById[id] = computeRow(id); });
    var order = playersOrder.slice();
    if(uebersichtSort.key){
      var key = uebersichtSort.key, dir = uebersichtSort.dir;
      order.sort(function(idA, idB){
        var av = uebersichtSortValue(key, idA, rowsById[idA]);
        var bv = uebersichtSortValue(key, idB, rowsById[idB]);
        if(av < bv) return dir === "desc" ? 1 : -1;
        if(av > bv) return dir === "desc" ? -1 : 1;
        return 0;
      });
    }
    return {rowsById: rowsById, order: order};
  }

  function renderUebersicht(){
    if(uebersichtEditing){ uebersichtRenderPending = true; return; }
    var visibleCols = UEBERSICHT_FIXED_COLS.filter(function(c){ return isColVisible(c.key); });
    var visibleCatalog = uebersichtCatalogVisible ? CATALOG : [];
    var headCells = ['<th class="sortable" data-sort="name">Name' + sortArrowHTML("name") + '</th>']
      .concat(visibleCols.map(function(c){
        var cls = "sortable" + (c.key === "offeneSumme" ? " wrap2" : "");
        var label = c.key === "offeneSumme" ? esc(c.label).replace(" ", "<br>") : esc(c.label);
        return '<th class="' + cls + '" data-sort="' + c.key + '">' + label + sortArrowHTML(c.key) + "</th>";
      }))
      .concat(visibleCatalog.map(function(c){
        return '<th class="sortable vert" data-sort="cat' + c.id + '">' + esc(c.name) + sortArrowHTML("cat" + c.id) + "</th>";
      }));
    $("uebersichtHead").innerHTML = headCells.join("");

    if(playersOrder.length === 0){
      $("uebersichtBody").innerHTML = '<tr><td colspan="' + headCells.length + '" class="empty">Kader wird geladen…</td></tr>';
      $("uebersichtOpenSum").textContent = euro(0);
      return;
    }

    var computed = computeUebersichtRows();
    var rowsById = computed.rowsById, order = computed.order;

    // Offene Summe nur über aktive Spieler – inaktive (ausgeschiedene) Spieler zählen nicht
    // mehr mit, unabhängig davon, ob bei ihnen noch ein offener Betrag steht.
    var openSum = 0;
    playersOrder.forEach(function(id){
      if(playersMap[id] && playersMap[id].active === false) return;
      openSum += rowsById[id].offeneSumme;
    });
    var sumEl = $("uebersichtOpenSum");
    sumEl.textContent = euro(openSum);
    sumEl.className = "value" + (openSum > 0 ? " danger" : "");

    $("uebersichtBody").innerHTML = order.map(function(id){
      var r = rowsById[id];
      var isInactive = playersMap[id] && playersMap[id].active === false;
      var cells = ['<td data-label="Name">' + activeToggleBtn(id) + playerChip(id) + '</td>'];
      visibleCols.forEach(function(c){
        var tdCls = c.key === "offeneSumme" ? ' class="narrow"' : "";
        cells.push('<td' + tdCls + ' data-label="' + esc(c.label) + '">' + fixedCellHTML(c, r, id) + '</td>');
      });
      visibleCatalog.forEach(function(c){
        var n = r.catCounts[c.id] || 0;
        cells.push('<td class="num catcol narrow' + (n > 0 ? " nonzero" : "") + '" data-label="' + esc(c.name) + '">' + n + '</td>');
      });
      return "<tr" + (isInactive ? ' class="row-inactive"' : "") + ">" + cells.join("") + "</tr>";
    }).join("");

    bindUebersichtInputs();
  }

  function activeToggleBtn(id){
    var p = playersMap[id];
    var isActive = p.active !== false;
    var cls = "active-toggle " + (isActive ? "is-active" : "is-inactive");
    var title = isActive
      ? "Als inaktiv markieren – wird ab jetzt nicht mehr im Bierlog eingeteilt"
      : "Wieder als aktiv markieren";
    return '<button type="button" class="' + cls + '" data-action="toggle-active-row" data-id="' + esc(id) + '" title="' + title + '">' + (isActive ? "●" : "○") + '</button>';
  }

  function fixedCellHTML(c, r, id){
    if(c.key === "birthday"){
      return r.birthday ? '<span class="num">' + formatDateDE(r.birthday) + '</span>' : '<span class="muted">–</span>';
    }
    if(c.key === "dienste") return '<span class="num">' + r.dienste + '</span>';
    if(c.key === "bierliste") return '<span class="num">' + r.bierliste + '</span>';
    if(c.key === "strafkisten") return '<span class="num">' + r.strafkisten + '</span>';
    if(c.key === "offeneKisten") return '<span class="num' + (r.offeneKisten > 0 ? " amount owed" : "") + '">' + r.offeneKisten + '</span>';
    if(c.key === "grundbeitrag") return '<span class="num">' + euro(TEAM_FEE) + '</span>';
    if(c.key === "strafen") return '<span class="num">' + euro(r.strafenSum) + '</span>';
    if(c.key === "offeneSumme") return '<span class="num amount' + (r.offeneSumme > 0 ? " owed" : " clear") + '">' + euro(r.offeneSumme) + '</span>';
    if(c.key === "kfOffen") return '<span class="num' + (r.kfOffen > 0 ? " amount owed" : "") + '">' + r.kfOffen + '</span>';
    if(c.key === "strafkistenBezahlt") return '<span class="num">' + r.strafkistenBezahlt + '</span>';
    if(c.key === "bezahlt") return '<span class="num">' + euro(r.bezahlt) + '</span>';
    return "";
  }

  function bindUebersichtInputs(){
    $("uebersichtBody").querySelectorAll("input[data-field]").forEach(function(inp){
      inp.addEventListener("focus", function(){ uebersichtEditing = true; });
      inp.addEventListener("blur", function(){
        uebersichtEditing = false;
        if(uebersichtRenderPending){ uebersichtRenderPending = false; renderUebersicht(); }
      });
      inp.addEventListener("change", function(){
        var field = inp.dataset.field, id = inp.dataset.id;
        var value = inp.type === "number" ? Number(inp.value || 0) : inp.value;
        var patch = {}; patch[field] = value;
        db.doc("players/" + id).update(patch).catch(function(e){ console.error(e); });
      });
    });
    $("uebersichtBody").querySelectorAll('[data-action="toggle-active-row"]').forEach(function(btn){
      btn.onclick = function(){
        var id = btn.dataset.id;
        var p = playersMap[id];
        db.doc("players/" + id).update({active: p.active === false ? true : false}).catch(function(e){ console.error(e); });
      };
    });
  }

  // ---------- Übersicht-Export (PNG) ----------
  // Baut clientseitig ein Canvas mit einer schlanken Tabelle (Name, Grundbeitrag, Strafen,
  // Bezahlt, Offene Summe) in derselben Reihenfolge, die gerade in der Übersicht zu sehen ist,
  // und bietet sie über die "downloads"-Capability als PNG zum Speichern an.
  function buildUebersichtExportCanvas(){
    var computed = computeUebersichtRows();
    // Inaktive Spieler (in der Übersicht ausgegraut) fließen nicht in den Export ein.
    var rows = computed.order.filter(function(id){
      var p = playersMap[id];
      return !p || p.active !== false;
    }).map(function(id){
      var p = playersMap[id];
      var r = computed.rowsById[id];
      return {
        name: (p && p.initials) || ("#" + id),
        grundbeitrag: euro(TEAM_FEE),
        strafen: euro(r.strafenSum),
        bezahlt: euro(r.bezahlt),
        offeneSumme: euro(r.offeneSumme),
        owed: r.offeneSumme > 0
      };
    });

    var cols = [
      {key:"name",          label:"Name",           width:170, align:"left"},
      {key:"grundbeitrag",  label:"Grundbeitrag",   width:130, align:"right"},
      {key:"strafen",       label:"Strafen",        width:110, align:"right"},
      {key:"bezahlt",       label:"Bezahlt",        width:110, align:"right"},
      {key:"offeneSumme",   label:"Offene Summe",   width:140, align:"right"}
    ];
    var tableWidth = cols.reduce(function(s,c){ return s + c.width; }, 0);
    var pad = 24, titleH = 54, headH = 36, rowH = 32;
    var width = tableWidth + pad * 2;
    var height = titleH + headH + Math.max(rows.length, 1) * rowH + pad;

    var scale = 2;
    var canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    var ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);

    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, width, height);

    ctx.textAlign = "left";
    ctx.fillStyle = "#101826";
    ctx.font = "600 18px Oswald, sans-serif";
    ctx.fillText("Übersicht Strafen und Beiträge", pad, 30);
    ctx.fillStyle = "#5B6B82";
    ctx.font = "12px 'Work Sans', sans-serif";
    ctx.fillText(formatDateDE(todayISO()), pad, 46);

    var y = titleH;
    ctx.fillStyle = "#E3E9F0";
    ctx.fillRect(pad, y, tableWidth, headH);
    ctx.fillStyle = "#101826";
    ctx.font = "600 12px 'Work Sans', sans-serif";
    var x = pad;
    cols.forEach(function(c){
      ctx.textAlign = c.align;
      ctx.fillText(c.label, c.align === "right" ? x + c.width - 10 : x + 10, y + headH / 2 + 4);
      x += c.width;
    });
    y += headH;

    ctx.font = "13px 'IBM Plex Mono', monospace";
    rows.forEach(function(row, i){
      if(i % 2 === 1){
        ctx.fillStyle = "#F4F6F9";
        ctx.fillRect(pad, y, tableWidth, rowH);
      }
      var x2 = pad;
      cols.forEach(function(c){
        ctx.textAlign = c.align;
        ctx.fillStyle = (c.key === "offeneSumme") ? (row.owed ? "#B83636" : "#1C8A4D") : "#101826";
        ctx.fillText(row[c.key], c.align === "right" ? x2 + c.width - 10 : x2 + 10, y + rowH / 2 + 4);
        x2 += c.width;
      });
      y += rowH;
    });

    ctx.strokeStyle = "#D7DEE8";
    ctx.lineWidth = 1;
    ctx.strokeRect(pad + 0.5, titleH + 0.5, tableWidth - 1, headH + rows.length * rowH - 1);

    return canvas;
  }

  // Fallback-Weg über die downloads-Capability (Speichern-Dialog der App): greift, wenn das
  // Gerät/der Browser kein natives Datei-Teilen unterstützt (z. B. am Desktop).
  function saveUebersichtViaDownloads(blob, filename, resultEl){
    if(!window.claude || typeof window.claude.use !== "function"){
      resultEl.textContent = "Export in dieser Ansicht nicht verfügbar.";
      return;
    }
    return window.claude.use("downloads").then(function(downloads){
      if(!downloads){ resultEl.textContent = "Download in dieser Ansicht nicht verfügbar."; return; }
      return downloads.save({filename: filename, data: blob})
        .then(function(){ resultEl.textContent = "PNG gespeichert."; })
        .catch(function(err){
          resultEl.textContent = err && err.code === "declined" ? "Export abgebrochen." : "Fehler beim Speichern: " + (err && err.message || err);
        });
    });
  }

  $("btnExportUebersicht").addEventListener("click", function(){
    var resultEl = $("exportUebersichtResult");
    resultEl.textContent = "Erzeuge PNG…";
    (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve())
      .then(function(){
        var canvas = buildUebersichtExportCanvas();
        return new Promise(function(resolve, reject){
          canvas.toBlob(function(blob){
            if(!blob) reject(new Error("PNG konnte nicht erzeugt werden."));
            else resolve(blob);
          }, "image/png");
        });
      })
      .then(function(blob){
        var filename = "uebersicht-" + todayISO() + ".png";
        var file = null;
        try{ file = new File([blob], filename, {type:"image/png"}); } catch(e){ /* File-Konstruktor evtl. nicht verfügbar */ }

        // Bevorzugt: natives Teilen-Menü des Geräts – v.a. auf dem Handy praktisch, da die
        // PNG-Datei direkt an Nachrichten/WhatsApp/Mail weitergegeben oder in Fotos gesichert
        // werden kann, statt über einen klassischen Download.
        if(file && navigator.share && navigator.canShare && navigator.canShare({files:[file]})){
          return navigator.share({files:[file], title:"Übersicht " + todayISO()})
            .then(function(){ resultEl.textContent = "Geteilt."; })
            .catch(function(err){
              if(err && err.name === "AbortError"){ resultEl.textContent = "Teilen abgebrochen."; return; }
              return saveUebersichtViaDownloads(blob, filename, resultEl);
            });
        }
        return saveUebersichtViaDownloads(blob, filename, resultEl);
      })
      .catch(function(err){ resultEl.textContent = "Fehler: " + (err && err.message || err); });
  });

  // ---------- Strafenlog ----------
  function renderCatalogTable(){
    $("catalogTable").innerHTML = CATALOG.map(function(c){
      var strafe = bestrafungText(c, c.amount);
      return '<tr><td class="num">' + c.id + '</td><td>' + esc(c.name) + '</td><td class="num">' + strafe + '</td></tr>';
    }).join("");
  }

  function bestrafungText(c, amount){
    if(c.individual) return amount != null ? "individuell: " + euro(amount) : "individuell";
    if(c.nonMonetary) return (amount ? euro(amount) + " + " : "") + c.nonMonetary;
    return euro(amount);
  }

  function buildPenaltySelect(){
    var sel = $("penaltyCatalog");
    sel.innerHTML = CATALOG.map(function(c){
      var suffix = c.individual ? " (individuell)" : (c.nonMonetary ? " (" + (c.amount ? euro(c.amount) + " + " : "") + c.nonMonetary + ")" : " (" + euro(c.amount) + ")");
      return '<option value="' + c.id + '">' + esc(c.name) + suffix + '</option>';
    }).join("") + '<option value="' + PAYMENT_ID + '">Beitrag bezahlt (Betrag eingeben)</option>';
    fillPlayerSelect($("penaltyPlayer"), true);
    var filter = $("penaltyFilter");
    var current = filter.value;
    filter.innerHTML = '<option value="">Alle Spieler</option>' + playersOrder.map(function(id){
      return '<option value="' + esc(id) + '">' + esc(playerLabel(id)) + '</option>';
    }).join("");
    filter.value = current;
    toggleAmountField();
  }
  $("penaltyCatalog").addEventListener("change", toggleAmountField);
  function toggleAmountField(){
    var val = $("penaltyCatalog").value;
    var c = CATALOG.find(function(c){ return String(c.id) === val; });
    $("penaltyAmountField").hidden = !((c && c.individual) || val === PAYMENT_ID);
  }

  $("penaltyForm").addEventListener("submit", function(ev){
    ev.preventDefault();
    if(!db) return;
    var playerId = $("penaltyPlayer").value;
    var selectedValue = $("penaltyCatalog").value;
    if(!playerId) return;
    var entry;
    if(selectedValue === PAYMENT_ID){
      entry = {
        playerId: playerId, catalogId: PAYMENT_ID, catalogName: "Beitrag bezahlt", isPayment:true,
        date: $("penaltyDate").value || todayISO(),
        amountEuro: Number($("penaltyAmount").value || 0), nonMonetary: null,
        note: $("penaltyNote").value.trim(), createdAt: new Date().toISOString()
      };
    } else {
      var catalogId = Number(selectedValue);
      var c = CATALOG.find(function(x){ return x.id === catalogId; });
      if(!c) return;
      var amount = c.individual ? Number($("penaltyAmount").value || 0) : (c.amount || 0);
      entry = {
        playerId: playerId, catalogId: c.id, catalogName: c.name, isPayment:false,
        date: $("penaltyDate").value || todayISO(),
        amountEuro: amount, nonMonetary: c.nonMonetary || null,
        note: $("penaltyNote").value.trim(), createdAt: new Date().toISOString()
      };
    }
    db.collection("penalties").add(entry).then(function(){
      ev.target.reset();
      $("penaltyDate").value = todayISO();
      buildPenaltySelect();
    }).catch(function(e){ console.error(e); });
  });
  $("penaltyFilter").addEventListener("change", renderStrafenlog);

  // ---------- Strafenlog-Altdaten-Import ----------
  // Einmaliger Massenimport historischer Strafen/Zahlungen. Jede Zeile
  // "Datum;Rückennummer;Strafe;Betrag;Bemerkung" (Betrag/Bemerkung optional). "Strafe" muss
  // exakt einem Namen aus dem Strafenkatalog entsprechen, oder "Beitrag bezahlt" für eine
  // Zahlung. Erneuter Import derselben Zeilen erzeugt keine Duplikate.
  $("btnImportStrafen").addEventListener("click", function(){
    if(!db) return;
    var raw = $("importStrafenText").value.split("\n");
    var toWrite = [], errors = [], skippedDup = 0;
    raw.forEach(function(line, idx){
      line = line.trim();
      if(!line || line.charAt(0) === "#") return;
      var parts = line.split(";").map(function(s){ return s.trim(); });
      if(parts.length < 3 || !parts[0] || !parts[1] || !parts[2]){ errors.push("Zeile " + (idx+1) + ": ungültiges Format"); return; }
      var date = parts[0], num = parts[1], catName = parts[2];
      var amountStr = parts[3] || "", note = parts[4] || "";
      var d;
      try{ d = parseISO(date); if(isNaN(d.getTime())) throw new Error("bad date"); }
      catch(e){ errors.push("Zeile " + (idx+1) + ": ungültiges Datum \"" + date + "\""); return; }
      var playerId = numberToPlayerId(num);
      if(!playerId){ errors.push("Zeile " + (idx+1) + ": Rückennummer " + num + " nicht im Kader gefunden"); return; }

      var entry;
      if(catName.toLowerCase() === "beitrag bezahlt"){
        entry = {
          playerId: playerId, catalogId: PAYMENT_ID, catalogName: "Beitrag bezahlt", isPayment:true,
          date: date, amountEuro: Number((amountStr || "0").replace(",", ".")) || 0, nonMonetary: null,
          note: note, createdAt: new Date().toISOString()
        };
      } else {
        var c = CATALOG.find(function(x){ return x.name.trim().toLowerCase() === catName.toLowerCase(); });
        if(!c){ errors.push("Zeile " + (idx+1) + ": Strafe \"" + catName + "\" nicht im Katalog gefunden"); return; }
        var amount = amountStr ? (Number(amountStr.replace(",", ".")) || 0) : (c.amount || 0);
        entry = {
          playerId: playerId, catalogId: c.id, catalogName: c.name, isPayment:false,
          date: date, amountEuro: amount, nonMonetary: c.nonMonetary || null,
          note: note, createdAt: new Date().toISOString()
        };
      }
      var already = penaltiesList.some(function(p){
        return p.playerId === entry.playerId && p.date === entry.date && p.catalogId === entry.catalogId &&
          Number(p.amountEuro || 0) === Number(entry.amountEuro || 0) && (p.note || "") === (entry.note || "");
      });
      if(already){ skippedDup++; return; }
      toWrite.push(entry);
    });
    if(toWrite.length === 0){
      $("importStrafenResult").textContent = "Nichts zu importieren. " +
        (skippedDup ? skippedDup + " Zeile(n) bereits vorhanden. " : "") +
        (errors.length ? "Fehler: " + errors.join(" | ") : "");
      return;
    }
    Promise.all(toWrite.map(function(p){ return db.collection("penalties").add(p); }))
      .then(function(){
        $("importStrafenResult").textContent = toWrite.length + " Eintrag/Einträge importiert." +
          (skippedDup ? " " + skippedDup + " bereits vorhanden übersprungen." : "") +
          (errors.length ? " Fehler: " + errors.join(" | ") : "");
        buildPenaltySelect();
      })
      .catch(function(e){ console.error(e); $("importStrafenResult").textContent = "Fehler beim Import: " + e.message; });
  });

  // Sortierbare Spaltenköpfe im Strafenlog: Klick sortiert danach auf-/absteigend (erneuter
  // Klick auf dieselbe Spalte kehrt die Richtung um). Wird einmalig gebunden, da der
  // Tabellenkopf statisch im HTML steht.
  $("penaltyTable").querySelectorAll("th.sortable").forEach(function(th){
    th.addEventListener("click", function(){
      var key = th.dataset.sort;
      if(penaltySort.key === key){
        penaltySort.dir = penaltySort.dir === "asc" ? "desc" : "asc";
      } else {
        penaltySort.key = key;
        penaltySort.dir = "asc";
      }
      renderStrafenlog();
    });
  });

  function sortPenaltyRows(rows){
    var key = penaltySort.key, dir = penaltySort.dir;
    return rows.slice().sort(function(a,b){
      var av, bv;
      if(key === "date"){ av = a.date || ""; bv = b.date || ""; }
      else if(key === "player"){
        av = Number(playersMap[a.playerId] && playersMap[a.playerId].number) || 0;
        bv = Number(playersMap[b.playerId] && playersMap[b.playerId].number) || 0;
      }
      else if(key === "note"){ av = (a.note || "").toLowerCase(); bv = (b.note || "").toLowerCase(); }
      else if(key === "catalog"){ av = (a.catalogName || "").toLowerCase(); bv = (b.catalogName || "").toLowerCase(); }
      else if(key === "amount"){ av = Number(a.amountEuro || 0); bv = Number(b.amountEuro || 0); }
      else { av = 0; bv = 0; }
      if(av < bv) return dir === "desc" ? 1 : -1;
      if(av > bv) return dir === "desc" ? -1 : 1;
      return 0;
    });
  }

  function renderStrafenlog(){
    var filter = $("penaltyFilter").value;
    var rows = sortPenaltyRows(penaltiesList.filter(function(p){ return !filter || p.playerId === filter; }));
    $("penaltyTable").querySelectorAll(".arrow").forEach(function(sp){
      sp.textContent = sp.dataset.arrow === penaltySort.key ? (penaltySort.dir === "asc" ? " ▲" : " ▼") : "";
    });
    $("penaltyEmpty").hidden = rows.length > 0;
    $("penaltyTable").querySelector("tbody").innerHTML = rows.map(function(p){
      var c = CATALOG.find(function(x){ return x.id === p.catalogId; });
      var bestrafung = p.isPayment ? ("+ " + euro(p.amountEuro)) : (c ? bestrafungText(c, p.amountEuro) : (p.amountEuro ? euro(p.amountEuro) : ""));
      return '<tr' + (p.isPayment ? ' style="background:var(--success-bg)"' : '') + '>' +
        '<td class="num" data-label="Datum">' + formatDateDE(p.date) + '</td>' +
        '<td data-label="Spieler">' + playerChip(p.playerId) + '</td>' +
        '<td class="muted" data-label="Bemerkung">' + esc(p.note || "") + '</td>' +
        '<td data-label="Strafe-Txt">' + esc(p.catalogName) + '</td>' +
        '<td class="amount num" data-label="Bestrafung">' + bestrafung + '</td>' +
        '<td data-label=""><button type="button" class="iconbtn" data-action="delete-penalty" data-id="' + esc(p.id) + '" title="Löschen">✕</button></td>' +
      '</tr>';
    }).join("");
    $("penaltyTable").querySelectorAll('[data-action="delete-penalty"]').forEach(function(btn){
      btn.onclick = function(){ db.doc("penalties/" + btn.dataset.id).delete().catch(function(e){ console.error(e); }); };
    });
  }

  init();
})();
