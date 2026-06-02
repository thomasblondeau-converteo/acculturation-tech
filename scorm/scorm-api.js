/* ============================================================================
   Converteo Tech Academy — SCORM 1.2 Runtime Wrapper
   ----------------------------------------------------------------------------
   - Discovers the LMS API (window / parent / top / opener chains)
   - Initializes the session on load
   - Sends progress, score, completion/pass status, commits, and terminates
   - Exposes window.ConverteoSCORM for debugging & manual triggers
   - Falls back gracefully to standalone mode when no API is present
   This file is loaded BEFORE the course app and is framework-free (vanilla JS).
   ============================================================================ */
(function (global) {
  "use strict";

  var PASS_THRESHOLD = 70;     // percent required to mark "passed"
  var MAX_FIND_DEPTH = 10;     // how many parent frames to walk when searching

  var api = null;              // the discovered LMS API object
  var initialized = false;     // did LMSInitialize succeed?
  var terminated = false;      // did LMSFinish run?
  var standalone = false;      // true when no API is found
  var lastScore = null;        // most recent raw score sent
  var lastStatus = "not attempted";

  /* ---------------------------------------------------------------- logging */
  function log()  { try { console.log.apply(console, ["[SCORM]"].concat([].slice.call(arguments))); } catch (e) {} }
  function warn() { try { console.warn.apply(console, ["[SCORM]"].concat([].slice.call(arguments))); } catch (e) {} }

  /* ----------------------------------------------------- API DISCOVERY logic */
  // SCORM 1.2 exposes the API as a property literally named "API" on a window.
  function findAPIInWindow(win) {
    var depth = 0;
    try {
      while (win && win.API == null && win.parent && win.parent !== win && depth < MAX_FIND_DEPTH) {
        depth++;
        win = win.parent;
      }
      return win ? win.API || null : null;
    } catch (e) {
      // Cross-origin frame access throws; treat as "not found here" and move on.
      warn("Frame access blocked while searching for API (cross-origin):", e.message);
      return null;
    }
  }

  function discoverAPI() {
    var found = null;

    // 1) current window + its parent chain
    found = findAPIInWindow(global);
    if (found) { log("API found via window/parent chain."); return found; }

    // 2) top window + its parent chain
    try {
      if (global.top && global.top !== global) {
        found = findAPIInWindow(global.top);
        if (found) { log("API found via top chain."); return found; }
        if (global.top.API) { log("API found on window.top."); return global.top.API; }
      }
    } catch (e) { warn("Could not inspect top (cross-origin?):", e.message); }

    // 3) opener window (popup-launched courses) + its parent chain
    if (global.opener) {
      try {
        found = findAPIInWindow(global.opener);
        if (found) { log("API found via opener chain."); return found; }
        if (global.opener.top && global.opener.top.API) { log("API found on opener.top."); return global.opener.top.API; }
      } catch (e) { warn("Could not inspect opener (cross-origin?):", e.message); }
    }

    return null;
  }

  /* ------------------------------------------------------- safe API wrappers */
  function lmsGet(key) {
    if (!api || !initialized) return "";
    var v = api.LMSGetValue(key);
    return v == null ? "" : v;
  }

  function lmsSet(key, value) {
    if (!api || !initialized) { log("(standalone) set", key, "=", value); return false; }
    var ok = api.LMSSetValue(key, String(value));
    var err = api.LMSGetLastError ? api.LMSGetLastError() : "0";
    if (String(ok) !== "true" || (err && err !== "0")) {
      warn("LMSSetValue(" + key + ", " + value + ") returned", ok, "errorCode:", err,
           api.LMSGetErrorString ? api.LMSGetErrorString(err) : "");
    } else {
      log("set", key, "=", value);
    }
    return String(ok) === "true";
  }

  function lmsCommit() {
    if (!api || !initialized) return false;
    var ok = api.LMSCommit("");
    log("commit ->", ok);
    return String(ok) === "true";
  }

  /* ------------------------------------------------------------- public init */
  function initialize() {
    api = discoverAPI();

    if (!api) {
      standalone = true;
      warn("SCORM API not found — standalone mode. The course will work normally but no data is sent to an LMS.");
      return false;
    }

    var ok = api.LMSInitialize("");
    if (String(ok) !== "true") {
      var err = api.LMSGetLastError ? api.LMSGetLastError() : "?";
      warn("LMSInitialize failed (errorCode " + err + "). Falling back to standalone mode.");
      standalone = true;
      api = null;
      return false;
    }

    initialized = true;
    log("LMSInitialize OK. Session started.");

    // On first launch, mark the lesson as "incomplete" so the LMS shows it in progress.
    var current = lmsGet("cmi.core.lesson_status");
    lastStatus = current || "not attempted";
    if (!current || current === "not attempted" || current === "" || current === "unknown") {
      lmsSet("cmi.core.lesson_status", "incomplete");
      lastStatus = "incomplete";
    } else {
      log("Resuming with existing lesson_status:", current);
    }

    // Declare the score scale once (0..100).
    lmsSet("cmi.core.score.min", 0);
    lmsSet("cmi.core.score.max", 100);
    lmsCommit();
    return true;
  }

  /* ------------------------------------------------------- progress / scoring */
  // progressPct: 0..100  — recorded as a SCORM 1.2 comment (no native progress field in 1.2)
  function setProgress(progressPct) {
    if (standalone || !initialized) { log("(standalone) progress", progressPct + "%"); return; }
    var p = Math.max(0, Math.min(100, Math.round(progressPct)));
    // SCORM 1.2 has no cmi.progress_measure; we surface progress via lesson comments.
    lmsSet("cmi.comments", "progress=" + p + "%");
    lmsCommit();
  }

  // scoreRaw on a 0..100 scale.
  function setScore(scoreRaw) {
    lastScore = Math.max(0, Math.min(100, Math.round(scoreRaw)));
    if (standalone || !initialized) { log("(standalone) score.raw", lastScore); return; }
    lmsSet("cmi.core.score.raw", lastScore);
    lmsCommit();
  }

  // Mark the lesson complete; if a score is supplied, also decide passed/failed.
  function markComplete(scoreRaw) {
    if (typeof scoreRaw === "number") setScore(scoreRaw);

    if (standalone || !initialized) {
      lastStatus = "completed";
      log("(standalone) lesson_status -> completed" +
          (typeof scoreRaw === "number" ? " (score " + lastScore + ")" : ""));
      return;
    }

    if (typeof scoreRaw === "number") {
      var status = lastScore >= PASS_THRESHOLD ? "passed" : "failed";
      lmsSet("cmi.core.lesson_status", status);
      lastStatus = status;
    } else {
      lmsSet("cmi.core.lesson_status", "completed");
      lastStatus = "completed";
    }
    lmsCommit();
  }

  // Explicitly mark passed with a score (used by forcePassed / quiz pass path).
  function markPassed(scoreRaw) {
    if (typeof scoreRaw === "number") setScore(scoreRaw);
    if (standalone || !initialized) { lastStatus = "passed"; log("(standalone) lesson_status -> passed"); return; }
    lmsSet("cmi.core.lesson_status", "passed");
    lastStatus = "passed";
    lmsCommit();
  }

  /* ----------------------------------------------------- immediate finalize
     Called the instant the learner PASSES the final quiz, so the LMS validates
     the activity WITHOUT waiting for the close button. Sequence chosen for the
     widest SCORM 1.2 LMS compatibility:
       1) score.raw            (record the score)
       2) lesson_status=passed (records the pass / satisfies masteryscore)
       3) lesson_status=completed (the value most LMSes treat as "activity done")
       4) LMSCommit + LMSFinish (terminate the session now)
     lesson_status is a single field, so we write "passed", commit, then overwrite
     with "completed" and commit again — both values reach the LMS in order. */
  function finalizeQuiz(scoreRaw) {
    var pct = (typeof scoreRaw === "number") ? Math.max(0, Math.min(100, Math.round(scoreRaw))) : null;
    var passed = (pct != null) && (pct >= PASS_THRESHOLD);

    log("===== FINAL QUIZ FINALIZE =====");
    log("final quiz result:", passed ? "PASSED" : "completed (no pass threshold met)",
        pct != null ? "(score " + pct + "%, threshold " + PASS_THRESHOLD + "%)" : "");

    if (standalone || !initialized) {
      if (pct != null) lastScore = pct;
      lastStatus = passed ? "passed" : "completed";
      log("(standalone) score sent:", lastScore);
      log("(standalone) lesson_status sent:", lastStatus);
      log("(standalone) commit result: n/a — standalone mode");
      log("(standalone) finish result: n/a — standalone mode");
      log("===== FINALIZE DONE (standalone) =====");
      return { standalone: true, passed: passed, score: lastScore, status: lastStatus };
    }

    // 1) score
    if (pct != null) {
      setScore(pct);
      log("score sent: cmi.core.score.raw =", pct);
    }

    // 2) passed (only if threshold met)
    if (passed) {
      lmsSet("cmi.core.lesson_status", "passed");
      log("lesson_status sent: passed");
    }

    // 3) completed (value the broadest set of LMSes validate as "done")
    lmsSet("cmi.core.lesson_status", "completed");
    lastStatus = "completed";
    log("lesson_status sent: completed");

    // 4) commit + finish immediately
    var committed = lmsCommit();
    log("commit result:", committed);

    finish();
    log("finish result:", terminated ? "true (session terminated)" : "not terminated");
    log("===== FINALIZE DONE =====");

    return { standalone: false, passed: passed, score: pct,
             status: "completed", committed: committed, terminated: terminated };
  }

  /* ------------------------------------------------------------- termination */
  function finish() {
    if (standalone || !initialized || terminated) return;
    lmsCommit();
    var ok = api.LMSFinish("");
    terminated = true;
    log("LMSFinish ->", ok, "Session terminated.");
  }

  // Terminate cleanly when the learner leaves the page.
  global.addEventListener("beforeunload", function () { try { finish(); } catch (e) {} });
  // pagehide is more reliable on mobile / bfcache.
  global.addEventListener("pagehide", function () { try { finish(); } catch (e) {} });

  /* ------------------------------------------------- debug / manual interface */
  var ConverteoSCORM = {
    PASS_THRESHOLD: PASS_THRESHOLD,

    // Internal hooks used by the course (safe to call repeatedly).
    _init: initialize,
    setProgress: setProgress,
    setScore: setScore,
    markComplete: markComplete,
    markPassed: markPassed,
    finalizeQuiz: finalizeQuiz,
    finish: finish,

    // ----- explicit debug tools requested -----
    debug: function () {
      var info = {
        apiFound: !!api,
        initialized: initialized,
        standalone: standalone,
        terminated: terminated,
        passThreshold: PASS_THRESHOLD,
        lastScoreSent: lastScore,
        lastStatusSent: lastStatus
      };
      if (api && initialized) {
        info.lms = {
          lesson_status: lmsGet("cmi.core.lesson_status"),
          "score.raw": lmsGet("cmi.core.score.raw"),
          student_name: lmsGet("cmi.core.student_name"),
          entry: lmsGet("cmi.core.entry")
        };
      }
      log("DEBUG state:", info);
      if (standalone) log("SCORM API not found — standalone mode.");
      return info;
    },

    forceComplete: function () {
      log("forceComplete() called.");
      markComplete();
      return this.debug();
    },

    forcePassed: function (score) {
      var s = (typeof score === "number") ? score : 100;
      log("forcePassed(" + s + ") called.");
      markPassed(s);
      return this.debug();
    },

    getStatus: function () {
      if (standalone || !initialized) {
        return { standalone: true, status: lastStatus, score: lastScore };
      }
      return {
        standalone: false,
        status: lmsGet("cmi.core.lesson_status"),
        score: lmsGet("cmi.core.score.raw")
      };
    }
  };

  global.ConverteoSCORM = ConverteoSCORM;

  // Auto-initialize as early as possible (the API frame exists before the course DOM).
  initialize();

})(window);
