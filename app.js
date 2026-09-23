/* =============================================================
 * Study runtime. You should not need to edit this file —
 * everything configurable lives in config.js.
 * ============================================================= */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const app = $("app");
  const STORE_KEY = "recon_study_v1";

  /* A fingerprint of the parts of config.js that stored state refers to.
   * If you edit the method list or the scene list mid-study, a returning
   * participant's saved state would point at keys that no longer exist, so
   * we discard it rather than crash on render. */
  const CONFIG_SIG = [
    STUDY.methods.map((m) => m.key).join("|"),
    STUDY.scenes.map((s) => s.id).join("|"),
    STUDY.questions.map((q) => q.id).join("|"),
    "n=" + (STUDY.scenesPerParticipant || 0),
  ].join("::");

  /* ---------------- state ---------------- */
  const state = load() || {
    configSig: CONFIG_SIG,
    participant: { id: "", display: "", background: "" },
    startedAt: null,
    page: 0, // 0 = welcome, 1..N = scenes, N+1 = done
    sceneOrder: null,
    methodOrder: null, // per scene id -> array of method keys
    ratings: {},       // sceneId -> methodKey -> questionId -> 1..5
    timings: {},       // sceneId -> ms spent
    submissionId: null,
    submission: null,  // { status: "ok" | "failed", at, attempts }
  };
  let sceneEnteredAt = Date.now();

  let wiped = false; // set on reset, so the unload handler can't resurrect the state

  /* Private windows and strict privacy settings make localStorage throw. The
   * study still runs, but a refresh would then lose every answer with no
   * warning, so we detect it up front and say so rather than failing quietly. */
  const storageWorks = (() => {
    try {
      localStorage.setItem("__probe", "1");
      localStorage.removeItem("__probe");
      return true;
    } catch (e) { return false; }
  })();

  let saveBroken = false;
  function save() {
    if (wiped) return;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch (e) {
      if (!saveBroken) { saveBroken = true; showStorageWarning(); }
    }
  }

  function showStorageWarning() {
    if ($("storageWarn")) return;
    const el = document.createElement("div");
    el.id = "storageWarn";
    el.className = "warnbar";
    el.innerHTML =
      "<b>This browser is not saving your progress.</b> Your answers are held only in this tab — " +
      "do not refresh or close it, and finish in one sitting. (Private/incognito windows block storage.)";
    document.body.prepend(el);
  }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      if (s && s.configSig !== CONFIG_SIG) {
        console.warn("config.js changed since this session was saved — starting fresh");
        localStorage.removeItem(STORE_KEY);
        return null;
      }
      return s;
    } catch (e) { return null; }
  }

  /* ---------------- ordering ---------------- */
  const shuffle = (a) => {
    const r = a.slice();
    for (let i = r.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [r[i], r[j]] = [r[j], r[i]];
    }
    return r;
  };

  function ensureOrders() {
    if (!state.sceneOrder) {
      const ids = STUDY.scenes.map((s) => s.id);
      const n = subsetSize();
      /* A subset is drawn without repeats; shuffle then take the first n.
       * Showing every scene keeps the configured ordering unless asked. */
      state.sceneOrder =
        n < ids.length ? shuffle(ids).slice(0, n) : STUDY.shuffleScenes ? shuffle(ids) : ids;
    }
    if (!state.methodOrder) state.methodOrder = {};
    for (const s of STUDY.scenes) {
      if (!state.methodOrder[s.id]) {
        const keys = STUDY.methods.map((m) => m.key);
        state.methodOrder[s.id] = STUDY.shuffleMethods ? shuffle(keys) : keys;
      }
    }
  }

  const LETTERS = "ABCDEFGH";
  /* The letter is purely positional: leftmost tile is always A. It is assigned
   * from the shuffled display order, so the same method is labelled differently
   * on every scene and a participant cannot carry an impression across scenes.
   * The rating itself is always stored against the method's own key. */
  const labelFor = (sid, mk) => LETTERS[(state.methodOrder?.[sid] || []).indexOf(mk)] || "?";

  const sceneById = (id) => STUDY.scenes.find((s) => s.id === id);
  const methodByKey = (k) => STUDY.methods.find((m) => m.key === k);
  /* How many scenes this participant rates. Before they start there is no
   * draw yet, so fall back to the configured subset size. */
  const subsetSize = () => {
    const n = STUDY.scenesPerParticipant;
    return !n || n >= STUDY.scenes.length ? STUDY.scenes.length : n;
  };
  const nScenes = () => (state.sceneOrder ? state.sceneOrder.length : subsetSize());

  /* ---------------- rendering helpers ---------------- */
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function imgTile({ src, caption, cls = "", ref = false }) {
    const safe = esc(src || "");
    const inner = src
      ? `<img src="${safe}" alt="${esc(caption)}" loading="lazy"
             data-full="${safe}" data-cap="${esc(caption)}"
             onerror="this.closest('figure').innerHTML='<div class=&quot;missing&quot;><b>image unavailable</b></div>';console.warn('missing image: ${safe}')">`
      : `<div class="missing"><b>image unavailable</b></div>`;
    return `<div class="tile ${cls} ${ref ? "ref" : ""}">
        <figure>${inner}</figure>
        <figcaption>${esc(caption)}</figcaption>
      </div>`;
  }

  const STAR_SVG =
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5L2.6 9.4l6.5-.9z"/></svg>';

  function starsHTML(sceneId, methodKey, qid, value) {
    let out = `<div class="stars" role="radiogroup" aria-label="rating" data-scene="${sceneId}" data-method="${methodKey}" data-q="${qid}">`;
    for (let i = 1; i <= 5; i++) {
      out += `<button type="button" class="star ${value >= i ? "on" : ""}" role="radio"
        aria-checked="${value === i}" aria-label="${i} of 5" data-value="${i}">${STAR_SVG}</button>`;
    }
    return out + "</div>";
  }

  const getRating = (sid, mk, qid) => (state.ratings[sid]?.[mk]?.[qid]) || 0;
  function setRating(sid, mk, qid, v) {
    state.ratings[sid] ||= {};
    state.ratings[sid][mk] ||= {};
    state.ratings[sid][mk][qid] = v;
    save();
  }

  function sceneComplete(sid) {
    const needed = STUDY.methods.length * STUDY.questions.length;
    let have = 0;
    for (const m of STUDY.methods) for (const q of STUDY.questions) if (getRating(sid, m.key, q.id)) have++;
    return { have, needed, done: have === needed };
  }

  /* ---------------- pages ---------------- */
  function renderWelcome() {
    $("navbar").hidden = true;
    app.innerHTML = `
      <div class="prose">
        <h1>${esc(STUDY.title)}</h1>
        <p class="lede">${STUDY.subtitle}</p>

        <h2>What you will do</h2>
        <p>You will rate <b>${subsetSize()} scenes</b>${
          subsetSize() < STUDY.scenes.length
            ? `, drawn at random from a pool of ${STUDY.scenes.length}`
            : ""
        }. For each one you will see two comparisons:</p>
        <ul>
          <li><b>Perspective view</b> — one real RGB frame from the scene, followed by each method's reconstruction rendered from that same camera pose.</li>
          <li><b>Orthographic plan view</b> — a top-down view of the whole scene for each method.</li>
        </ul>
        <p>Then you rate every method on three criteria, from ★ (poor) to ★★★★★ (excellent).
        The methods are anonymous, labelled ${STUDY.methods.map((_, i) => `<span class="pill">${LETTERS[i]}</span>`).join(" ")}
        by their position on screen. <b>The labels are reshuffled on every scene</b> &mdash; ${LETTERS[0]} on
        one scene is not ${LETTERS[0]} on the next &mdash; so please judge each scene entirely on its own.</p>

        <h2>The three criteria</h2>
        <ul>${STUDY.questions.map((q) => `<li><b>${esc(q.title)}</b> — ${q.prompt}</li>`).join("")}</ul>

        <h2>About you</h2>
        <div class="card">
          <div class="field">
            <label for="pid">Participant ID <span style="font-weight:400">(any label your coordinator gave you, or make one up)</span></label>
            <input id="pid" value="${esc(state.participant.id)}" placeholder="e.g. p07">
          </div>
          <div class="field">
            <label for="pbg">Familiarity with 3D reconstruction / computer vision</label>
            <select id="pbg">
              ${["", "None", "Some — I've read about it", "Working knowledge", "Expert / I work in this area"]
                .map((o) => `<option value="${esc(o)}" ${state.participant.background === o ? "selected" : ""}>${o || "— select —"}</option>`)
                .join("")}
            </select>
          </div>
          <p style="font-size:12.5px;color:var(--text-dim);margin:14px 0 0">
            Takes about ${STUDY.estimatedMinutes} minutes. Your answers are stored in this browser as you go,
            so you can close the tab and come back. Your responses are sent when you finish.
          </p>
        </div>

        <p style="margin-top:22px"><button class="btn primary" id="startBtn">Start the study →</button></p>
      </div>`;

    $("startBtn").onclick = () => {
      state.participant.id =
        $("pid").value.trim() ||
        "anon-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
      state.participant.background = $("pbg").value;
      state.startedAt ||= new Date().toISOString();
      state.submissionId ||= newId();
      ensureOrders();
      go(1);
    };
  }

  function renderScene(idx) {
    ensureOrders();
    const sid = state.sceneOrder[idx - 1];
    const sc = sceneById(sid);
    const order = state.methodOrder[sid];

    /* one row: the reference first, then the four methods */
    const renderBlock =
      imgTile({ src: sc.rgb, caption: "Reference RGB frame", ref: true }) +
      order.map((k) => imgTile({ src: sc.methods[k]?.render, caption: labelFor(sid, k) })).join("");

    const orthoBlock =
      (sc.rgbOrtho ? imgTile({ src: sc.rgbOrtho, caption: "Reference (scan)", cls: "ortho", ref: true }) : "") +
      order.map((k) => imgTile({ src: sc.methods[k]?.ortho, caption: labelFor(sid, k), cls: "ortho" })).join("");

    const cols = order.length + 1;

    const raters = STUDY.questions
      .map(
        (q) => `
      <section class="panel">
        <div class="qhead">
          <h4>${esc(q.title)}</h4>
          <p>${q.prompt}</p>
        </div>
        ${order
          .map(
            (k) => `<div class="mrow">
              <div class="mlabel">${esc(labelFor(sid, k))}</div>
              ${starsHTML(sid, k, q.id, getRating(sid, k, q.id))}
            </div>`
          )
          .join("")}
        <div class="scale-legend"><span>1 · ${esc(q.lowLabel)}</span><span>${esc(q.highLabel)} · 5</span></div>
      </section>`
      )
      .join("");

    app.innerHTML = `
      <div class="scene-head">
        <h2>${esc(sc.name)}</h2>
        <span class="pill">scene ${idx} of ${nScenes()}</span>
      </div>

      <div class="scene-grid">
        <div>
          <section class="panel">
            <header><h3>Perspective view</h3><span class="hint">reconstructions rendered from the reference camera pose · click any image to enlarge</span></header>
            <div class="panel-body">
              <div class="strip persp" style="--n:${cols}">${renderBlock}</div>
            </div>
          </section>

          <section class="panel">
            <header><h3>Orthographic plan view</h3><span class="hint">top-down layout of the full scene</span></header>
            <div class="panel-body">
              <div class="strip ortho-strip" style="--n:${cols}">${orthoBlock}</div>
            </div>
          </section>
        </div>

        <div class="rater">
          ${raters}
        </div>
      </div>`;

    $("navbar").hidden = false;
    $("prevBtn").disabled = false;
    $("nextBtn").textContent = idx === nScenes() ? "Finish →" : "Next →";
    updateStatus(sid);
    sceneEnteredAt = Date.now();
  }

  function updateStatus(sid) {
    const { have, needed, done } = sceneComplete(sid);
    const st = $("status");
    st.textContent = done ? "All ratings complete" : `${have} of ${needed} ratings given`;
    st.className = "status" + (done ? " ready" : "");
    $("nextBtn").disabled = STUDY.requireAllAnswers && !done;
  }

  function renderDone() {
    $("navbar").hidden = true;
    const payload = buildPayload();
    const sent = state.submission?.status === "ok";
    /* With a relay configured the participant should not have to do anything:
     * we send on arrival and only ask for a file if that fails. Without one,
     * the download IS the submission, so say so loudly. */
    const box = !STUDY.submitEndpoint
      ? `<div class="card">
           <p style="margin-top:0"><b>Last step:</b> download your responses and send the file to the study coordinator.</p>
           <div class="row">
             <button class="btn primary" id="dlCsv">Download CSV</button>
             <button class="btn" id="dlJson">Download JSON</button>
           </div>
         </div>`
      : `<div class="card">
           <p id="sendState" class="sendstate" style="margin-top:0">${
             sent ? "\u2713 Your responses have been received. Nothing else to do." : "Sending your responses\u2026"
           }</p>
           <div id="sendFallback" ${sent ? "hidden" : ""}>
             <p style="font-size:13px;color:var(--text-dim);margin:8px 0 10px">
               If this does not succeed, please download the file and send it to the study coordinator.</p>
             <div class="row">
               <button class="btn" id="dlCsv">Download CSV</button>
               <button class="btn" id="dlJson">Download JSON</button>
             </div>
           </div>
         </div>`;

    app.innerHTML = `
      <div class="prose">
        <h1>Thank you.</h1>
        <p class="lede">You rated ${nScenes()} scenes × ${STUDY.methods.length} methods × ${STUDY.questions.length} criteria.</p>
        ${box}
        <h2>Your summary</h2>
        ${summaryTable(payload)}
        <div class="card" style="margin-top:26px">
          <p style="margin-top:0"><b>Next participant?</b> This browser remembers the session above,
          so anyone opening the link here lands on this page. Save the file first, then clear it.</p>
          <div class="row">
            <button class="btn" id="resetBtn">Clear and start a new participant</button>
            <button class="btn ghost" id="backBtn">← Back to the last scene</button>
          </div>
        </div>
      </div>`;

    const fileBase = String(payload.participant.id).replace(/[^A-Za-z0-9_-]/g, "_") || "responses";
    $("dlCsv").onclick = () => download(`${fileBase}_ratings.csv`, toCSV(payload), "text/csv");
    $("dlJson").onclick = () => download(`${fileBase}_ratings.json`, JSON.stringify(payload, null, 2), "application/json");
    $("backBtn").onclick = () => go(nScenes());
    $("resetBtn").onclick = () => {
      if (confirm("Clear this session? Make sure the responses have been saved first — this cannot be undone.")) {
        wiped = true;
        localStorage.removeItem(STORE_KEY);
        location.reload();
      }
    };
    if (STUDY.submitEndpoint && !sent) {
      const el = $("sendState");
      submitPayload(payload, (msg) => { el.textContent = msg; }).then((ok) => {
        if (ok) {
          el.textContent = "\u2713 Your responses have been received. Nothing else to do.";
          el.classList.add("ok");
          $("sendFallback").hidden = true;
        } else {
          el.innerHTML =
            "<b>Your responses could not be sent.</b> Nothing was lost \u2014 please download the " +
            "file below and send it to the study coordinator.";
          el.classList.add("bad");
          $("sendFallback").hidden = false;
        }
      });
    }
  }

  function summaryTable(p) {
    const head = STUDY.questions.map((q) => `<th style="text-align:right">${esc(q.title)}</th>`).join("");
    const rows = STUDY.methods
      .map((m) => {
        const cells = STUDY.questions
          .map((q) => {
            const vals = p.rows.filter((r) => r.method === m.key && r.question === q.id).map((r) => r.rating);
            const mean = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : "—";
            return `<td style="text-align:right;font-family:var(--mono)">${mean}</td>`;
          })
          .join("");
        return `<tr><td><span class="pill">${esc(m.key)}</span></td>${cells}</tr>`;
      })
      .join("");
    return `<div class="card" style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:14px">
      <thead><tr><th style="text-align:left">Method</th>${head}</tr></thead><tbody>${rows}</tbody></table>
      <p style="font-size:12.5px;color:var(--text-dim);margin-bottom:0">Your mean rating across all ${nScenes()} scenes. The rows are anonymous method codes &mdash; which system each one is was hidden from you throughout.</p></div>`;
  }

  /* ---------------- results ---------------- */
  const newId = () => Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);

  function buildPayload() {
    /* A session resumed from before this field existed, or any path that
     * skipped the welcome screen, would otherwise submit a null id and every
     * such response would collide on the same filename. */
    if (!state.submissionId) { state.submissionId = newId(); save(); }
    const rows = [];
    for (const sid of state.sceneOrder || STUDY.scenes.map((s) => s.id)) {
      for (const mk of state.methodOrder?.[sid] || STUDY.methods.map((m) => m.key)) {
        for (const q of STUDY.questions) {
          rows.push({
            participant: state.participant.id,
            scene: sid,
            method: mk,
            shownAs: labelFor(sid, mk),
            position: (state.methodOrder?.[sid] || []).indexOf(mk) + 1,
            question: q.id,
            rating: getRating(sid, mk, q.id) || null,
          });
        }
      }
    }
    return {
      study: STUDY.title,
      /* A per-attempt id. If a submission is retried or the participant
       * refreshes, the same id arrives twice — dedupe on it rather than
       * double-counting the rows. */
      submissionId: state.submissionId,
      configSig: CONFIG_SIG,
      participant: state.participant,
      startedAt: state.startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: state.startedAt ? Date.now() - Date.parse(state.startedAt) : null,
      client: { ua: navigator.userAgent, screen: `${screen.width}x${screen.height}`, tz: Intl.DateTimeFormat().resolvedOptions().timeZone },
      complete: (state.sceneOrder || []).every((sid) => sceneComplete(sid).done),
      sceneOrder: state.sceneOrder,
      methodOrder: state.methodOrder,
      timingsMs: state.timings,
      rows,
    };
  }

  /* RFC 4180: a field containing a quote, comma or newline is wrapped in
   * quotes and its own quotes are DOUBLED. JSON.stringify backslash-escapes
   * instead, which every CSV reader mis-parses — a participant id with a
   * quote in it silently corrupts the row. */
  function csvCell(v) {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function toCSV(p) {
    const cols = ["participant", "scene", "method", "shownAs", "position", "question", "rating"];
    const lines = [cols.join(",")];
    for (const r of p.rows) lines.push(cols.map((c) => csvCell(r[c])).join(","));
    return lines.join("\r\n"); // CRLF per the spec; Excel and pandas both accept it
  }

  /* ---------------- submission ----------------
   * Sent as text/plain deliberately: an application/json body triggers a CORS
   * preflight, and a failed preflight would silently lose every response.
   * text/plain is a "simple request" and goes straight through; the relay
   * reads the raw body and parses it itself. */
  async function postOnce(payload, timeoutMs = 20000) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const r = await fetch(STUDY.submitEndpoint, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
        signal: ctl.signal,
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json().catch(() => ({ ok: true }));
    } finally {
      clearTimeout(timer);
    }
  }

  async function submitPayload(payload, onStatus) {
    const delays = [0, 3000, 8000]; // three attempts, backing off
    let lastErr;
    for (let i = 0; i < delays.length; i++) {
      if (delays[i]) await new Promise((r) => setTimeout(r, delays[i]));
      onStatus(i === 0 ? "Sending your responses…" : `Connection problem — retrying (${i + 1}/${delays.length})…`);
      try {
        const res = await postOnce(payload);
        state.submission = { status: "ok", at: new Date().toISOString(), attempts: i + 1, path: res.path || null };
        save();
        return true;
      } catch (e) {
        lastErr = e;
      }
    }
    state.submission = { status: "failed", at: new Date().toISOString(), attempts: delays.length, error: String(lastErr) };
    save();
    return false;
  }

  function download(name, text, mime) {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  /* ---------------- navigation ---------------- */
  function go(page) {
    if (state.page >= 1 && state.page <= nScenes()) {
      const sid = state.sceneOrder[state.page - 1];
      state.timings[sid] = (state.timings[sid] || 0) + (Date.now() - sceneEnteredAt);
    }
    state.page = page;
    save();
    render();
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function render() {
    const p = state.page;
    if (p === 0) renderWelcome();
    else if (p >= 1 && p <= nScenes()) renderScene(p);
    else renderDone();

    const pct = p === 0 ? 0 : p > nScenes() ? 100 : ((p - 1) / nScenes()) * 100;
    $("progressBar").style.width = pct + "%";
    $("counter").textContent = p === 0 ? "" : p > nScenes() ? "complete" : `${p} / ${nScenes()}`;
    $("brand").textContent = STUDY.title;
    document.title = STUDY.title;
  }

  $("prevBtn").onclick = () => go(Math.max(0, state.page - 1));
  $("nextBtn").onclick = () => go(state.page + 1);

  /* ---------------- interactions ---------------- */
  document.addEventListener("click", (e) => {
    const star = e.target.closest(".star");
    if (star) {
      const grp = star.closest(".stars");
      const v = +star.dataset.value;
      setRating(grp.dataset.scene, grp.dataset.method, grp.dataset.q, v);
      grp.querySelectorAll(".star").forEach((s, i) => {
        s.classList.toggle("on", i < v);
        s.setAttribute("aria-checked", String(i + 1 === v));
      });
      updateStatus(grp.dataset.scene);
      return;
    }
    const img = e.target.closest("figure img");
    if (img && img.dataset.full) {
      $("lightboxImg").src = img.dataset.full;
      $("lightboxCap").textContent = img.dataset.cap || "";
      $("lightbox").classList.add("open");
    }
  });

  $("lightbox").onclick = () => $("lightbox").classList.remove("open");
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") $("lightbox").classList.remove("open");
    if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT") return;
    if (e.key === "ArrowRight" && !$("nextBtn").disabled && !$("navbar").hidden) go(state.page + 1);
    if (e.key === "ArrowLeft" && !$("navbar").hidden) go(Math.max(0, state.page - 1));
  });

  $("themeBtn").onclick = () => {
    const cur = document.documentElement.getAttribute("data-theme");
    const next = cur === "dark" ? "light" : cur === "light" ? "" : "dark";
    if (next) document.documentElement.setAttribute("data-theme", next);
    else document.documentElement.removeAttribute("data-theme");
    try { localStorage.setItem("recon_theme", next); } catch (e) {}
  };
  try {
    const t = localStorage.getItem("recon_theme");
    if (t) document.documentElement.setAttribute("data-theme", t);
  } catch (e) {}

  window.addEventListener("beforeunload", save);
  if (!storageWorks) showStorageWarning();
  render();
})();
