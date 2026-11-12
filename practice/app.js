"use strict";
const ACCESS_CODE = "NBCE9000";
const DUR = { door: 120, enc: 840, soap: 360, tech: 840 };
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const label = k => { const t = k.replace(/_/g, " "); return t.charAt(0).toUpperCase() + t.slice(1); };
const fmt = s => { s = Math.max(0, s); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

let ENC = [], TECH = [];
let timerId = null, timeLeft = 0, onDone = null;
const st = { mode: null, list: [], idx: 0, phase: "", revealed: {}, soap: "", scores: [] };

function stopTimer() { if (timerId) { clearInterval(timerId); timerId = null; } }
function startTimer(sec, done) {
  stopTimer(); timeLeft = sec; onDone = done; paintTimer();
  const end = Date.now() + sec * 1000;
  timerId = setInterval(() => {
    timeLeft = Math.round((end - Date.now()) / 1000);
    paintTimer();
    if (timeLeft <= 0) { stopTimer(); if (onDone) onDone(); }
  }, 250);
}
function paintTimer() {
  const t = $("timer"); if (!t) return;
  t.textContent = fmt(timeLeft);
  t.classList.toggle("low", timeLeft <= 30);
}

async function load() {
  const [a, b] = await Promise.all([fetch("encounters.json"), fetch("technique.json")]);
  ENC = await a.json(); TECH = await b.json();
}

function setupGate() {
  const go = async () => {
    if ($("code").value.trim().toUpperCase() !== ACCESS_CODE) {
      $("code-err").textContent = "Incorrect access code. Please try again.";
      $("code").value = ""; $("code").focus(); return;
    }
    try { await load(); } catch (e) { $("code-err").textContent = "Could not load practice data."; return; }
    $("gate").style.display = "none"; $("app").style.display = "block"; home();
  };
  $("code-btn").addEventListener("click", go);
  $("code").addEventListener("keydown", e => { if (e.key === "Enter") go(); });
}

function home() {
  stopTimer();
  const opts = ENC.map(e => `<option value="${esc(e.id)}">${esc(e.id)}: ${esc(e.title)}</option>`).join("");
  $("app").innerHTML = `
  <div class="card"><h1>NBCE Part IV Practice Tool</h1>
  <p class="muted">Real timing: each encounter has 2 minutes of door chart review, a 14 minute encounter and 6 minutes of SOAP writing. The technique station is 14 minutes for 10 setups. Work with a partner who reads the patient script. All scoring is self-scored.</p></div>
  <div class="card"><h2>Encounter mode</h2>
    <button class="btn" id="b-full">Full sitting (7 random encounters)</button>
    <h3>Or practice a single encounter</h3>
    <select id="sel-enc" style="padding:10px;max-width:100%;font-size:1rem;margin:4px 0">${opts}</select>
    <button class="btn alt" id="b-one">Start this encounter</button>
    <button class="btn alt" id="b-rand">Random single</button></div>
  <div class="card"><h2>Technique mode</h2>
    <p class="muted">10 random setups in one 14 minute block.</p>
    <button class="btn" id="b-tech">Start technique station</button></div>`;
  $("b-full").onclick = () => startEnc(shuffle(ENC).slice(0, 7), "full");
  $("b-one").onclick = () => startEnc(ENC.filter(e => e.id === $("sel-enc").value), "single");
  $("b-rand").onclick = () => startEnc(shuffle(ENC).slice(0, 1), "single");
  $("b-tech").onclick = startTech;
}

/* ---------- Encounter mode ---------- */
function startEnc(list, kind) {
  Object.assign(st, { mode: "enc", kind, list, idx: 0, scores: [] });
  doorPhase();
}
function progressBar() {
  return `<div class="progress">${st.list.map((_, i) => `<span class="${i < st.idx ? "done" : i === st.idx ? "cur" : ""}"></span>`).join("")}</div>`;
}
function topBar(phaseName, extra) {
  return `<div class="topbar"><div><span class="phase">${esc(phaseName)}</span><div class="muted">${st.mode === "enc" ? "Encounter " + (st.idx + 1) + " of " + st.list.length : "Technique"}</div></div><div class="timer" id="timer">0:00</div><div>${extra || ""}</div></div>${progressBar()}`;
}
function doorPhase() {
  const e = st.list[st.idx]; st.phase = "door"; st.revealed = {}; st.soap = "";
  const d = e.door_chart;
  $("app").innerHTML = topBar("Door chart review (2:00)", `<button class="btn alt" id="skip">Skip to encounter</button>`) +
    `<div class="card"><h2>Door chart</h2><dl class="kv">${Object.keys(d).map(k => `<dt>${esc(label(k))}</dt><dd>${esc(d[k])}</dd>`).join("")}</dl></div>`;
  $("skip").onclick = encPhase;
  startTimer(DUR.door, encPhase);
}
function encPhase() {
  const e = st.list[st.idx]; st.phase = "enc";
  const ps = e.patient_script, ef = e.exam_findings;
  const ask = Object.keys(ps.if_asked || {});
  $("app").innerHTML = topBar("Encounter (14:00)", `<button class="btn alt" id="skip">Skip to SOAP</button>`) +
    `<div class="card"><h2>Door chart (for reference)</h2><dl class="kv">${Object.keys(e.door_chart).map(k => `<dt>${esc(label(k))}</dt><dd>${esc(e.door_chart[k])}</dd>`).join("")}</dl></div>
    <div class="card"><h2>Patient script (partner reads this)</h2>
      <div class="script"><b>Opening line:</b> ${esc(ps.opening_line)}</div>
      <div class="script"><b>Behavior:</b> ${esc(ps.behavior)}</div>
      <h3>Answers only if asked</h3><ul>${ask.map(k => `<li><b>${esc(label(k))}:</b> ${esc(ps.if_asked[k])}</li>`).join("")}</ul>
      ${(ps.volunteers_only_if_asked || []).length ? `<h3>Reveal only when specifically asked</h3><ul>${ps.volunteers_only_if_asked.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}</div>
    <div class="card"><h2>Exam findings</h2><p class="muted">Tap a section only after the learner says what they would test.</p>
      <div id="ef">${Object.keys(ef).map(k => `<button class="btn alt efbtn" data-k="${esc(k)}">${esc(label(k))}</button><div class="finding" id="ef-${esc(k)}" style="display:none">${esc(ef[k])}</div>`).join("")}</div></div>`;
  document.querySelectorAll(".efbtn").forEach(b => b.onclick = () => {
    const el = $("ef-" + b.dataset.k); el.style.display = el.style.display === "none" ? "block" : "none";
  });
  $("skip").onclick = soapPhase;
  startTimer(DUR.enc, soapPhase);
}
function soapPhase() {
  st.phase = "soap";
  $("app").innerHTML = topBar("SOAP note (6:00)", `<button class="btn alt" id="skip">Finish writing</button>`) +
    `<div class="card"><h2>Write your SOAP note</h2><textarea id="soap" placeholder="S:&#10;O:&#10;A:&#10;P:"></textarea></div>`;
  $("soap").value = st.soap; $("soap").focus();
  $("skip").onclick = reviewPhase;
  startTimer(DUR.soap, reviewPhase);
}
const DOMAIN_ORDER = ["history", "physical_exam", "diagnosis_and_case_management", "communication", "professionalism"];
function reviewPhase() {
  const ta = $("soap"); if (ta) st.soap = ta.value;
  stopTimer(); st.phase = "review";
  const e = st.list[st.idx];
  $("app").innerHTML = `<div class="topbar"><div><span class="phase">Time is up</span><div class="muted">Encounter ${st.idx + 1} of ${st.list.length}: ${esc(e.title)}</div></div></div>${progressBar()}
    <div class="card"><h2>Your SOAP note</h2><pre style="white-space:pre-wrap;font-family:inherit">${esc(st.soap) || "<span class='muted'>(nothing written)</span>"}</pre></div>
    <div class="card center" style="margin-top:0"><button class="btn" id="reveal">Reveal checklist and model answer</button></div><div id="rev"></div>`;
  $("reveal").onclick = () => { $("reveal").parentElement.style.display = "none"; showReveal(e); };
}
function showReveal(e) {
  const cl = e.checklist, doms = DOMAIN_ORDER.filter(d => cl[d]).concat(Object.keys(cl).filter(d => !DOMAIN_ORDER.includes(d)));
  const dx = e.diagnosis;
  const dxHtml = Object.keys(dx).map(k => {
    const v = dx[k];
    return `<dt>${esc(label(k))}</dt><dd>${Array.isArray(v) ? "<ul>" + v.map(x => `<li>${esc(x)}</li>`).join("") + "</ul>" : esc(v)}</dd>`;
  }).join("");
  $("rev").innerHTML = `<div class="card"><h2>Checklist (self-score)</h2>
    ${doms.map((d, di) => `<h3>${esc(label(d))} <span class="muted" id="ds-${di}"></span></h3>${cl[d].map((it, i) => `<label class="chk"><input type="checkbox" class="cb" data-d="${di}" /><span>${esc(it)}</span></label>`).join("")}`).join("")}
    <div class="score" id="tally">Score: 0 of 0</div></div>
    <div class="card"><h2>Diagnosis</h2><dl class="kv">${dxHtml}</dl></div>
    <div class="card"><h2>Model SOAP</h2>${["S", "O", "A", "P"].map(k => `<h3>${k}</h3><p>${esc(e.model_soap[k])}</p>`).join("")}</div>
    <div class="card"><h2>Common errors</h2><ul>${(e.common_errors || []).map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>
    <div class="card"><button class="btn" id="next">${st.idx + 1 < st.list.length ? "Next encounter" : "Finish sitting"}</button> <button class="btn alt" id="home">Exit to menu</button></div>`;
  const cbs = [...document.querySelectorAll(".cb")];
  const tally = () => {
    const n = cbs.filter(c => c.checked).length; $("tally").textContent = `Score: ${n} of ${cbs.length} (${Math.round(100 * n / cbs.length)}%)`;
    doms.forEach((d, di) => { const g = cbs.filter(c => +c.dataset.d === di); $("ds-" + di).textContent = `${g.filter(c => c.checked).length}/${g.length}`; });
    return n;
  };
  cbs.forEach(c => c.onchange = tally); tally();
  $("home").onclick = home;
  $("next").onclick = () => {
    st.scores.push({ id: e.id, title: e.title, got: tally(), of: cbs.length });
    st.idx++;
    if (st.idx < st.list.length) doorPhase(); else encSummary();
  };
}
function encSummary() {
  const got = st.scores.reduce((a, s) => a + s.got, 0), of = st.scores.reduce((a, s) => a + s.of, 0);
  $("app").innerHTML = `<div class="card"><h1>Sitting complete</h1><div class="score">Total: ${got} of ${of} (${of ? Math.round(100 * got / of) : 0}%)</div>
    <p class="muted">Self-scored practice only. The real NBCE Part IV has no published percentage cut score.</p></div>
    <div class="card"><h2>By encounter</h2><ul>${st.scores.map(s => `<li>${esc(s.id)} ${esc(s.title)}: ${s.got} of ${s.of}</li>`).join("")}</ul></div>
    <button class="btn" id="home">Back to menu</button>`;
  $("home").onclick = home;
}

/* ---------- Technique mode ---------- */
function startTech() {
  Object.assign(st, { mode: "tech", list: shuffle(TECH).slice(0, 10), idx: 0, scores: [] });
  techAttempt(true);
}
function techAttempt(first) {
  const s = st.list[st.idx];
  $("app").innerHTML = topBar("Technique station (14:00 total)", `<button class="btn alt" id="end">End station</button>`) +
    `<div class="card"><span class="tag">${esc(s.id)}</span><span class="tag">${esc(s.region)}</span>
    <h2>Setup ${st.idx + 1} of ${st.list.length}</h2><p>${esc(s.task)}</p>
    <p class="muted">Say and demonstrate the setup, then reveal the details to check yourself.</p>
    <button class="btn" id="rev">Reveal setup details</button></div><div id="detail"></div>`;
  $("end").onclick = techSummary;
  $("rev").onclick = () => { $("rev").style.display = "none"; techReveal(s); };
  if (first) startTimer(DUR.tech, techSummary); else paintTimer();
}
function techReveal(s) {
  const kv = [["Patient position", s.patient_position], ["Doctor position and stance", s.doctor_position_and_stance], ["Segment or listing", s.segment_or_listing], ["Contact point", s.contact_point], ["Line of drive", s.line_of_drive]];
  const list = a => "<ul>" + (a || []).map(x => `<li>${esc(x)}</li>`).join("") + "</ul>";
  $("detail").innerHTML = `<div class="card"><h2>Setup details</h2><dl class="kv">${kv.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
    <h3>Setup steps</h3><ol style="padding-left:22px">${(s.setup_steps || []).map(x => `<li>${esc(x)}</li>`).join("")}</ol>
    <h3>Safety checks</h3>${list(s.safety_checks)}<h3>Common errors</h3>${list(s.common_errors)}</div>
    <div class="card"><h2>Grading points (self-score)</h2>${(s.grading_points || []).map(g => `<label class="chk"><input type="checkbox" class="cb" /><span>${esc(g)}</span></label>`).join("")}
    <div class="score" id="tally"></div></div>
    <div class="card"><button class="btn" id="next">${st.idx + 1 < st.list.length ? "Next setup" : "Finish station"}</button></div>`;
  const cbs = [...document.querySelectorAll(".cb")];
  const tally = () => { const n = cbs.filter(c => c.checked).length; $("tally").textContent = `Score: ${n} of ${cbs.length}`; return n; };
  cbs.forEach(c => c.onchange = tally); tally();
  $("next").onclick = () => {
    st.scores.push({ id: s.id, task: s.task, got: tally(), of: cbs.length });
    st.idx++;
    if (st.idx < st.list.length) techAttempt(false); else techSummary();
  };
}
function techSummary() {
  stopTimer();
  const got = st.scores.reduce((a, s) => a + s.got, 0), of = st.scores.reduce((a, s) => a + s.of, 0);
  $("app").innerHTML = `<div class="card"><h1>Technique station finished</h1><div class="score">Total: ${got} of ${of}</div>
    <p class="muted">${st.scores.length} of ${st.list.length} setups scored. Self-scored practice only.</p></div>
    <div class="card"><ul>${st.scores.map(s => `<li>${esc(s.id)}: ${s.got} of ${s.of}</li>`).join("")}</ul></div>
    <button class="btn" id="home">Back to menu</button>`;
  $("home").onclick = home;
}

setupGate();
