/* GatePass frontend - connects the website with the GatePass smart contract using ethers.js */

const ROLE = ["Not registered", "Admin", "Warden", "Gate Security", "Student"];
const R = { None: 0, Admin: 1, Warden: 2, Guard: 3, Student: 4 };
const ST = { Pending: 0, Approved: 1, Rejected: 2, Out: 3, Returned: 4, Cancelled: 5 };
const TAB_ROLE = { student: R.Student, warden: R.Warden, gate: R.Guard, admin: R.Admin };

let cfg, provider, readC, users = [], current = null, chainNow = 0, passes = [];
const codeCache = {};

const $ = (id) => document.getElementById(id);
const short = (a) => (a ? a.slice(0, 6) + "..." + a.slice(-4) : "-");
const fmtTime = (s) => (Number(s) ? new Date(Number(s) * 1000).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "-");
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const same = (a, b) => a && b && a.toLowerCase() === b.toLowerCase();
const initials = (n) => (n || "?").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

function toast(msg, type = "") {
  const d = document.createElement("div");
  d.className = type;
  d.textContent = msg;
  $("toast").appendChild(d);
  setTimeout(() => d.remove(), 6500);
}

function errMsg(e) {
  const s = JSON.stringify(e) + " " + (e && e.message);
  const m = s.match(/reverted with reason string '([^']+)'/) || s.match(/reason="([^"]+)"/);
  if (m) return m[1];
  return (e && (e.reason || e.shortMessage || e.message)) || "Transaction failed";
}

function toLocalInput(ts) {
  const d = new Date(ts * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ---------------- setup ----------------
async function init() {
  cfg = await (await fetch("config.json")).json();
  provider = new ethers.JsonRpcProvider(location.origin + "/rpc", undefined, { staticNetwork: ethers.Network.from(cfg.chainId) });
  provider.pollingInterval = 400;
  readC = new ethers.Contract(cfg.address, cfg.abi, provider);

  document.querySelectorAll(".tabs button").forEach((b) => (b.onclick = () => openTab(b.dataset.tab)));
  $("walletSelect").onchange = () => { current = users[Number($("walletSelect").value)]; showWallet(); refresh(); };
  bindEvents();
  await loadUsers();
  current = users[0];
  showWallet();
  $("netInfo").textContent = `Connected to local Hardhat blockchain (Chain ID ${cfg.chainId}) | Contract: ${cfg.address}`;
  refresh();
}

async function loadUsers() {
  const sel = current ? current.address : null;
  users = [];
  for (let i = 0; i < cfg.wallets.length; i++) {
    const address = cfg.wallets[i];
    const role = Number(await readC.roles(address));
    const name = (await readC.names(address)) || `New Wallet ${i}`;
    const u = { address, role, name, student: null };
    if (role === R.Student) u.student = await readC.getStudent(address);
    users.push(u);
  }
  $("walletSelect").innerHTML = users.map((u, i) => `<option value="${i}">${esc(u.name)} - ${ROLE[u.role]}</option>`).join("");
  if (sel) current = users.find((u) => same(u.address, sel));
}

function showWallet() {
  $("walletSelect").value = users.indexOf(current);
  $("walletRole").textContent = ROLE[current.role];
  $("walletAddr").textContent = short(current.address);
}

const userOf = (a) => users.find((u) => same(u.address, a)) || { name: short(a), student: null };

function activeTab() { return document.querySelector(".tabs button.active").dataset.tab; }

function openTab(tab) {
  document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.id === "tab-" + tab));
  const need = TAB_ROLE[tab];
  if (need !== undefined && current.role !== need) {
    const u = users.find((x) => x.role === need);
    if (u) { current = u; showWallet(); }
  }
  refresh();
}

async function signer() { return provider.getSigner(current.address); }

async function sendTx(label, fn, btn) {
  if (btn) btn.disabled = true;
  try {
    const c = new ethers.Contract(cfg.address, cfg.abi, await signer());
    const tx = await fn(c);
    const rc = await tx.wait();
    logTx(label, rc);
    toast(label + " - saved on blockchain (block #" + rc.blockNumber + ")", "ok");
    return true;
  } catch (e) {
    console.error(e);
    toast("Error: " + errMsg(e), "err");
    return false;
  } finally {
    if (btn) btn.disabled = false;
  }
}

const txs = [];
function logTx(label, rc) {
  txs.unshift(`<div class="tx"><b>&#10004; ${esc(label)}</b> | Block #${rc.blockNumber} | By ${esc(userOf(rc.from).name)} | Tx ${rc.hash.slice(0, 18)}... | Gas ${rc.gasUsed}</div>`);
  $("txLog").innerHTML = txs.slice(0, 12).join("");
}

// ---------------- data ----------------
async function loadPasses() {
  chainNow = Number((await provider.getBlock("latest")).timestamp);
  $("chainTime").textContent = fmtTime(chainNow);
  const n = Number(await readC.passCount());
  passes = [];
  for (let i = 1; i <= n; i++) passes.push(await readC.getPass(i));
  return passes;
}

function view(p) {
  const s = Number(p.status);
  const overdue = chainNow > Number(p.returnBy);
  if (s === ST.Pending) return overdue ? { cls: "expired", text: "Expired (not approved)" } : { cls: "pending", text: "Pending Approval" };
  if (s === ST.Approved) return overdue ? { cls: "expired", text: "Expired (not used)" } : { cls: "approved", text: "Approved" };
  if (s === ST.Rejected) return { cls: "rejected", text: "Rejected" };
  if (s === ST.Out) return overdue ? { cls: "late", text: "Out - Overdue!" } : { cls: "out", text: "Out of Hostel" };
  if (s === ST.Returned) return p.late ? { cls: "late", text: "Returned Late" } : { cls: "returned", text: "Returned on Time" };
  return { cls: "cancelled", text: "Cancelled" };
}
const pill = (p) => { const v = view(p); return `<span class="pill ${v.cls}">${v.text}</span>`; };

// QR secret code: derived from the student's wallet signature, only its hash is stored on blockchain
async function qrCode(studentAddr, index) {
  const key = studentAddr.toLowerCase() + "-" + index;
  if (codeCache[key]) return codeCache[key];
  const s = await provider.getSigner(studentAddr);
  const sig = await s.signMessage(`GatePass QR | ${studentAddr.toLowerCase()} | request ${index}`);
  codeCache[key] = ethers.keccak256(sig).slice(2, 26);
  return codeCache[key];
}
const codeHash = (code) => ethers.keccak256(ethers.toUtf8Bytes(code));

function qrImg(text) {
  const q = qrcode(0, "M");
  q.addData(text);
  q.make();
  return q.createDataURL(5, 10);
}

// ---------------- refresh ----------------
async function refresh() {
  try {
    await loadPasses();
    const tab = activeTab();
    if (tab === "dashboard") await renderDashboard();
    if (tab === "student") await renderStudent();
    if (tab === "warden") renderWarden();
    if (tab === "admin") renderAdmin();
    if (tab === "parent" && $("enrollInput").value.trim()) parentCheck();
  } catch (e) { console.error(e); }
}

async function renderDashboard() {
  $("stStudents").textContent = (await readC.getStudents()).length;
  $("stPending").textContent = passes.filter((p) => Number(p.status) === ST.Pending && view(p).cls === "pending").length;
  const out = passes.filter((p) => Number(p.status) === ST.Out);
  $("stOut").textContent = out.length;
  $("stLate").textContent = passes.filter((p) => view(p).cls === "late").length;
  $("stReturned").textContent = passes.filter((p) => Number(p.status) === ST.Returned && !p.late).length;

  $("outTable").innerHTML = out.map((p) => {
    const st = userOf(p.student);
    return `<tr><td>#${p.id}</td><td><b>${esc(st.name)}</b></td><td>${esc(st.student?.room)}</td><td>${esc(p.destination)}</td>
      <td>${fmtTime(p.exitTime)}</td><td>${fmtTime(p.returnBy)}</td><td>${pill(p)}</td></tr>`;
  }).join("") || `<tr><td colspan="7" class="muted">All students are inside the hostel.</td></tr>`;

  $("allTable").innerHTML = passes.slice().reverse().map((p) => `<tr><td>#${p.id}</td><td><b>${esc(userOf(p.student).name)}</b></td>
    <td>${esc(p.reason)}</td><td>${esc(p.destination)}</td><td>${fmtTime(p.fromTime)}</td><td>${fmtTime(p.returnBy)}</td><td>${pill(p)}</td></tr>`).join("")
    || `<tr><td colspan="7" class="muted">No outpasses yet. Go to the Student tab to request one.</td></tr>`;
}

function passInfo(p) {
  const w = Number(p.decidedAt) ? userOf(p.warden).name : "-";
  return `<div class="info">
      <div><small>Reason</small><b>${esc(p.reason)}</b></div>
      <div><small>Destination</small><b>${esc(p.destination)}</b></div>
      <div><small>Requested On</small><b>${fmtTime(p.requestedAt)}</b></div>
      <div><small>Leaving Time</small><b>${fmtTime(p.fromTime)}</b></div>
      <div><small>Return By</small><b>${fmtTime(p.returnBy)}</b></div>
      <div><small>Warden Decision</small><b>${esc(w)}${p.wardenNote ? " - " + esc(p.wardenNote) : ""}</b></div>
      <div><small>Exit (Gate)</small><b>${fmtTime(p.exitTime)}</b></div>
      <div><small>Returned (Gate)</small><b>${fmtTime(p.entryTime)}</b></div>
    </div>`;
}

async function renderStudent() {
  if (current.role !== R.Student) {
    $("studentProfile").innerHTML = `<div class="alert grey">This wallet is not a registered student. Select a student wallet from the top.</div>`;
    $("requestCard").style.display = "none"; $("myPasses").innerHTML = ""; return;
  }
  const s = current.student;
  const active = Number(await readC.activePass(current.address));
  $("studentProfile").innerHTML = `<div class="card"><div class="profile"><div class="avatar">${initials(s.name)}</div>
    <div><h2 style="margin:0">${esc(s.name)}</h2><div class="muted">Enrollment: <b>${esc(s.enrollment)}</b> | Room: <b>${esc(s.room)}</b> | Parent: ${esc(s.parentName)}</div></div></div></div>`;
  $("requestCard").style.display = active ? "none" : "block";
  if (!active) {
    if (!$("pFrom").value) $("pFrom").value = toLocalInput(chainNow + 60);
    if (!$("pReturn").value) $("pReturn").value = toLocalInput(chainNow + 6 * 3600);
  }
  const ids = (await readC.getStudentPasses(current.address)).map(Number);
  if (!ids.length) { $("myPasses").innerHTML = `<div class="card muted">No outpasses yet.</div>`; return; }
  const cards = [];
  for (let k = ids.length - 1; k >= 0; k--) {
    const p = passes[ids[k] - 1];
    const s2 = Number(p.status);
    let side = "", alert = "";
    if (s2 === ST.Approved || s2 === ST.Out) {
      const code = await qrCode(current.address, k);
      const text = `GATEPASS|${p.id}|${code}`;
      const img = qrImg(text);
      side = `<div class="qrbox"><img src="${img}" alt="QR"/>Show this QR at the gate<br/><a href="${img}" download="GatePass-${p.id}.gif">Download QR</a></div>`;
    }
    const v = view(p).cls;
    if (s2 === ST.Pending) alert = `<div class="alert amber">Waiting for warden approval.</div>`;
    if (s2 === ST.Approved && v !== "expired") alert = `<div class="alert green">Approved! Show the QR code to gate security when leaving.</div>`;
    if (s2 === ST.Out) alert = v === "late" ? `<div class="alert red">You are late! Return time was ${fmtTime(p.returnBy)}.</div>`
      : `<div class="alert blue">You are out. Show the same QR at the gate when you return.</div>`;
    if (s2 === ST.Rejected) alert = `<div class="alert red">Rejected by warden${p.wardenNote ? ": " + esc(p.wardenNote) : ""}.</div>`;
    const cancel = (s2 === ST.Pending || s2 === ST.Approved) ? `<button class="btn" data-cancel="${p.id}">Cancel Pass</button>` : "";
    cards.push(`<div class="pass"><div class="phead"><h3>Outpass #${p.id}</h3>${pill(p)}</div>
      <div class="pbody"><div class="details">${passInfo(p)}${alert}${cancel}</div>${side}</div></div>`);
  }
  $("myPasses").innerHTML = cards.join("");
}

function renderWarden() {
  const pending = passes.filter((p) => Number(p.status) === ST.Pending && view(p).cls === "pending");
  $("pendingList").innerHTML = pending.map((p) => {
    const st = userOf(p.student);
    const hist = passes.filter((x) => same(x.student, p.student) && x.id !== p.id);
    const lateCount = hist.filter((x) => x.late || view(x).cls === "late").length;
    return `<div class="pass"><div class="phead"><h3>#${p.id} - ${esc(st.name)} (${esc(st.student?.enrollment)}, Room ${esc(st.student?.room)})</h3>${pill(p)}</div>
      <div class="pbody"><div class="details">${passInfo(p)}
        <div class="alert ${lateCount ? "red" : "grey"}">Past record (from blockchain): ${hist.length} earlier pass(es), late return ${lateCount} time(s).</div>
        <div class="row"><input id="note-${p.id}" placeholder="Note (optional) e.g. Return before 8 PM" />
          <button class="btn green" data-approve="${p.id}">Approve</button>
          <button class="btn danger" data-reject="${p.id}">Reject</button></div>
      </div></div></div>`;
  }).join("") || `<div class="card muted">No pending requests.</div>`;
  const decided = passes.filter((p) => Number(p.decidedAt) > 0).reverse();
  $("decidedTable").innerHTML = decided.map((p) => `<tr><td>#${p.id}</td><td>${esc(userOf(p.student).name)}</td><td>${esc(p.reason)}</td>
    <td>${fmtTime(p.returnBy)}</td><td>${esc(p.wardenNote) || "-"}</td><td>${pill(p)}</td></tr>`).join("")
    || `<tr><td colspan="6" class="muted">No decisions yet.</td></tr>`;
}

function renderAdmin() {
  const free = users.filter((u) => u.role === R.None);
  $("aWallet").innerHTML = free.map((u) => `<option value="${u.address}">${esc(u.name)} (${short(u.address)})</option>`).join("")
    || `<option value="">No free wallet left</option>`;
  $("usersTable").innerHTML = users.filter((u) => u.role !== R.None).map((u) => `<tr><td><b>${esc(u.name)}</b></td><td>${ROLE[u.role]}</td>
    <td>${esc(u.student?.enrollment) || "-"}</td><td>${esc(u.student?.room) || "-"}</td><td class="mono">${u.address}</td></tr>`).join("");
}

// ---------------- gate scan ----------------
let lastScan = "";
async function gateCheck(text) {
  text = (text || $("scanInput").value).trim();
  if (!text) return toast("Scan or paste a QR code first", "err");
  lastScan = text;
  $("scanInput").value = text;
  await loadPasses();
  const box = $("scanResult");
  const parts = text.split("|");
  const fake = (msg) => {
    box.innerHTML = `<div class="verdict FAKE"><div class="vhead"><h2>&#10006; FAKE PASS - DO NOT ALLOW</h2><p>${msg}</p></div></div>`;
  };
  if (parts.length !== 3 || parts[0] !== "GATEPASS" || !/^\d+$/.test(parts[1])) return fake("This is not a valid GatePass QR code.");
  const id = Number(parts[1]), code = parts[2];
  if (!(await readC.passExists(id))) return fake(`Pass #${id} does not exist on the blockchain.`);
  const p = await readC.getPass(id);
  if (codeHash(code) !== p.codeHash) return fake(`The QR code does not match the blockchain record of pass #${id}. It may be copied or edited.`);

  const st = userOf(p.student);
  const s = Number(p.status);
  const overdue = chainNow > Number(p.returnBy);
  let cls, title, msg, action = "";
  if (s === ST.Pending) { cls = "PENDING"; title = "&#9203; NOT APPROVED YET"; msg = "The warden has not approved this pass. Do not allow exit."; }
  else if (s === ST.Rejected) { cls = "REJECTED"; title = "&#10006; PASS REJECTED"; msg = "The warden rejected this pass. Do not allow exit."; }
  else if (s === ST.Cancelled) { cls = "REJECTED"; title = "&#10006; PASS CANCELLED"; msg = "The student cancelled this pass."; }
  else if (s === ST.Approved && overdue) { cls = "EXPIRED"; title = "&#9888; PASS EXPIRED"; msg = `Return time (${fmtTime(p.returnBy)}) is over. Do not allow exit.`; }
  else if (s === ST.Approved && chainNow + 3600 < Number(p.fromTime)) { cls = "PENDING"; title = "&#9203; TOO EARLY"; msg = `This pass is valid from ${fmtTime(p.fromTime)}.`; }
  else if (s === ST.Approved) {
    cls = "VALID"; title = "&#10004; VALID PASS - ALLOW EXIT"; msg = `Approved by ${esc(userOf(p.warden).name)}. Check the student's ID card and mark exit.`;
    action = `<button class="btn green big" id="exitBtn">Mark Exit</button>`;
  } else if (s === ST.Out) {
    cls = "RETURN"; title = "&#8617; STUDENT RETURNING - MARK ENTRY";
    msg = `Went out at ${fmtTime(p.exitTime)}. ` + (overdue ? `<b>LATE:</b> return time was ${fmtTime(p.returnBy)}.` : `Returning on time.`) +
      ` This pass cannot be used again for exit.`;
    action = `<button class="btn primary big" id="entryBtn">Mark Entry (Returned)</button>`;
  } else { cls = "USED"; title = "&#10006; PASS ALREADY USED"; msg = `This pass was used: exit at ${fmtTime(p.exitTime)}, returned at ${fmtTime(p.entryTime)}. It cannot be used again.`; }

  const tl = [`<li>Requested by student<small>${fmtTime(p.requestedAt)}</small></li>`];
  if (Number(p.decidedAt)) tl.push(`<li>${s === ST.Rejected ? "Rejected" : "Approved"} by ${esc(userOf(p.warden).name)}<small>${fmtTime(p.decidedAt)}</small></li>`);
  if (Number(p.exitTime)) tl.push(`<li>Exit marked at gate<small>${fmtTime(p.exitTime)}</small></li>`);
  if (Number(p.entryTime)) tl.push(`<li>Returned${p.late ? " (LATE)" : ""}<small>${fmtTime(p.entryTime)}</small></li>`);

  box.innerHTML = `<div class="verdict ${cls}"><div class="vhead"><h2>${title}</h2><p>${msg}</p></div>
    <div class="vbody">
      <div class="avatar" style="width:84px;height:84px;font-size:32px">${initials(st.name)}</div>
      <table>
        <tr><td>Student</td><td><b>${esc(st.name)}</b></td></tr>
        <tr><td>Enrollment</td><td>${esc(st.student?.enrollment)}</td></tr>
        <tr><td>Room</td><td>${esc(st.student?.room)}</td></tr>
        <tr><td>Pass</td><td>#${p.id} - ${esc(p.reason)}, going to ${esc(p.destination)}</td></tr>
        <tr><td>Valid</td><td>${fmtTime(p.fromTime)} to ${fmtTime(p.returnBy)}</td></tr>
        <tr><td>Status</td><td>${pill(p)}</td></tr>
      </table>
      <div><h3 style="margin:0 0 8px;color:#0f5c5c">Pass History</h3><ul class="timeline">${tl.join("")}</ul></div>
    </div>
    ${action ? `<div style="padding:0 22px 18px">${action}</div>` : ""}</div>`;
  if ($("exitBtn")) $("exitBtn").onclick = async (e) => { if (await sendTx(`markExit (pass #${id}, ${st.name})`, (c) => c.markExit(id, code), e.target)) gateCheck(text); };
  if ($("entryBtn")) $("entryBtn").onclick = async (e) => { if (await sendTx(`markEntry (pass #${id}, ${st.name})`, (c) => c.markEntry(id), e.target)) gateCheck(text); };
}

let camScanner = null;
async function toggleCamera() {
  if (camScanner) { await camScanner.stop().catch(() => {}); camScanner.clear(); camScanner = null; $("camBtn").textContent = "Scan with Camera"; return; }
  camScanner = new Html5Qrcode("reader");
  $("camBtn").textContent = "Stop Camera";
  try {
    await camScanner.start({ facingMode: "environment" }, { fps: 10, qrbox: 220 }, async (text) => {
      await toggleCamera();
      gateCheck(text);
    });
  } catch (e) {
    toast("Camera not available: " + e, "err");
    camScanner = null; $("camBtn").textContent = "Scan with Camera";
  }
}

// ---------------- parent ----------------
async function parentCheck() {
  const en = $("enrollInput").value.trim();
  if (!en) return toast("Enter enrollment number", "err");
  const addr = await readC.studentByEnrollment(en);
  if (addr === ethers.ZeroAddress) {
    $("parentResult").innerHTML = `<div class="alert red">No student found with enrollment number <b>${esc(en)}</b>.</div>`; return;
  }
  await loadPasses();
  const s = await readC.getStudent(addr);
  const mine = passes.filter((p) => same(p.student, addr)).reverse();
  const act = mine.find((p) => [ST.Pending, ST.Approved, ST.Out].includes(Number(p.status)));
  let status;
  if (act && Number(act.status) === ST.Out) {
    status = view(act).cls === "late"
      ? `<div class="alert red"><b>&#9888; OUTSIDE HOSTEL - LATE.</b> Went to ${esc(act.destination)} at ${fmtTime(act.exitTime)}. Had to return by ${fmtTime(act.returnBy)}.</div>`
      : `<div class="alert blue"><b>Outside hostel.</b> Went to ${esc(act.destination)} (${esc(act.reason)}) at ${fmtTime(act.exitTime)}. Will return by ${fmtTime(act.returnBy)}.</div>`;
  } else if (act && Number(act.status) === ST.Approved) {
    status = `<div class="alert green"><b>Inside hostel.</b> Outpass approved for ${esc(act.destination)} (${fmtTime(act.fromTime)} - ${fmtTime(act.returnBy)}), not left yet.</div>`;
  } else if (act) {
    status = `<div class="alert amber"><b>Inside hostel.</b> Has requested an outpass for ${esc(act.destination)}, waiting for warden approval.</div>`;
  } else {
    const last = mine.find((p) => Number(p.status) === ST.Returned);
    status = `<div class="alert green"><b>&#10004; Inside hostel.</b>${last ? " Last returned on " + fmtTime(last.entryTime) + "." : ""}</div>`;
  }
  $("parentResult").innerHTML = `<div class="card"><div class="profile"><div class="avatar">${initials(s.name)}</div>
      <div><h2 style="margin:0">${esc(s.name)}</h2><div class="muted">Enrollment: ${esc(s.enrollment)} | Room: ${esc(s.room)} | Parent: ${esc(s.parentName)}</div></div></div>
      ${status}</div>
    <div class="card"><h2>Outpass History</h2><table>
      <thead><tr><th>Pass</th><th>Reason</th><th>Destination</th><th>Went Out</th><th>Returned</th><th>Status</th></tr></thead>
      <tbody>${mine.map((p) => `<tr><td>#${p.id}</td><td>${esc(p.reason)}</td><td>${esc(p.destination)}</td><td>${fmtTime(p.exitTime)}</td>
        <td>${fmtTime(p.entryTime)}</td><td>${pill(p)}</td></tr>`).join("") || `<tr><td colspan="6" class="muted">No outpasses yet.</td></tr>`}</tbody>
    </table></div>`;
}

// ---------------- events ----------------
function bindEvents() {
  $("requestBtn").onclick = async () => {
    const dest = $("pDest").value.trim();
    if (!dest) return toast("Enter destination", "err");
    const from = Math.floor(new Date($("pFrom").value).getTime() / 1000);
    const ret = Math.floor(new Date($("pReturn").value).getTime() / 1000);
    if (!from || !ret) return toast("Select leaving and return time", "err");
    const index = (await readC.getStudentPasses(current.address)).length;
    const code = await qrCode(current.address, index);
    if (await sendTx(`requestPass (${current.name} - ${dest})`, (c) => c.requestPass($("pReason").value, dest, from, ret, codeHash(code)), $("requestBtn"))) {
      $("pDest").value = ""; $("pFrom").value = ""; $("pReturn").value = "";
      refresh();
    }
  };

  document.body.addEventListener("click", async (e) => {
    const t = e.target;
    if (t.dataset.approve) {
      const id = Number(t.dataset.approve);
      if (await sendTx(`approvePass (#${id})`, (c) => c.approvePass(id, $("note-" + id).value.trim()), t)) refresh();
    }
    if (t.dataset.reject) {
      const id = Number(t.dataset.reject);
      if (await sendTx(`rejectPass (#${id})`, (c) => c.rejectPass(id, $("note-" + id).value.trim() || "Not allowed"), t)) refresh();
    }
    if (t.dataset.cancel) {
      const id = Number(t.dataset.cancel);
      if (await sendTx(`cancelPass (#${id})`, (c) => c.cancelPass(id), t)) refresh();
    }
    if (t.dataset.skip) {
      const h = Number(t.dataset.skip);
      await provider.send("evm_increaseTime", [h * 3600]);
      await provider.send("evm_mine", []);
      toast(`Blockchain time moved forward by ${h} hour(s)`, "ok");
      refresh();
    }
  });

  $("checkBtn").onclick = () => gateCheck();
  $("scanInput").onkeydown = (e) => { if (e.key === "Enter") gateCheck(); };
  $("camBtn").onclick = toggleCamera;
  $("qrFile").onchange = async (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f) return;
    const sc = new Html5Qrcode("reader");
    try { gateCheck(await sc.scanFile(f, false)); }
    catch { toast("Could not read a QR code from this image", "err"); }
    finally { try { sc.clear(); } catch {} }
  };

  $("parentBtn").onclick = parentCheck;
  $("enrollInput").onkeydown = (e) => { if (e.key === "Enter") parentCheck(); };

  $("addStudentBtn").onclick = async () => {
    const w = $("aWallet").value, name = $("aName").value.trim(), en = $("aEnroll").value.trim();
    if (!w) return toast("No free wallet available", "err");
    if (!name || !en) return toast("Name and enrollment number are required", "err");
    if (await sendTx(`addStudent (${name})`, (c) => c.addStudent(w, name, en, $("aRoom").value.trim(), $("aParent").value.trim()), $("addStudentBtn"))) {
      ["aName", "aEnroll", "aRoom", "aParent"].forEach((i) => ($(i).value = ""));
      await loadUsers(); showWallet(); refresh();
    }
  };
}

init().catch((e) => {
  console.error(e);
  $("netInfo").textContent = "Could not connect to blockchain. Start the project first.";
});
