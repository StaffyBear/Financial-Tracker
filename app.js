/**************************************************
 * Financial Tracker – app.js
 * Tiles: Monthly Summary, Bills, Accounts, Finances, Admin
 * Uses SAME Supabase project as your Delivery Tracker
 * Tables used: fin_accounts, fin_bills, fin_bill_payments, fin_companies, fin_shifts
 **************************************************/

// ✅ Set these:
const SITE_URL = "https://staffybear.github.io/Financial-Tracker/"; // must end with /
const SUPABASE_URL = "https://qntswiybgqijbbhpzpas.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_JW0SqP8JbZFsgVfpPevHrg__FeyrIgq";

// Optional: invite code gate for registration
const INVITE_CODE_REQUIRED = "1006";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = (id) => document.getElementById(id);

const VIEWS = ["authView","resetView","menuView","monthlyView","billsView","accountsView","financesView","adminView"];

let monthCursor = startOfMonth(new Date());
let finDateStr = yyyyMmDd(new Date());
let activeCompanyId = "";

/* ---------------- helpers ---------------- */
function pad2(n){ return String(n).padStart(2,"0"); }
function yyyyMmDd(d=new Date()){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function todayStr(){ return yyyyMmDd(new Date()); }

function startOfMonth(d){ return new Date(d.getFullYear(), d.getMonth(), 1, 12,0,0,0); }
function addMonths(d, delta){ const x=new Date(d); x.setMonth(x.getMonth()+delta); return startOfMonth(x); }
function monthLabel(d){ return d.toLocaleString(undefined, { month:"long", year:"numeric" }); }
function monthRange(d){
  const start = new Date(d.getFullYear(), d.getMonth(), 1, 0,0,0,0);
  const end = new Date(d.getFullYear(), d.getMonth()+1, 1, 0,0,0,0);
  return { start, end };
}
function parseDateStr(dateStr){ const [y,m,dd]=dateStr.split("-").map(Number); return new Date(y,m-1,dd,12,0,0,0); }
function addDays(dateStr, delta){ const dt=parseDateStr(dateStr); dt.setDate(dt.getDate()+delta); return yyyyMmDd(dt); }

function toLocalInput(dt){
  const d = new Date(dt);
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function fromLocalInput(v){
  if (!v) return null;
  const [dp,tp] = v.split("T");
  const [y,m,dd] = dp.split("-").map(Number);
  const [hh,mm] = tp.split(":").map(Number);
  return new Date(y, m-1, dd, hh, mm, 0, 0);
}
function hoursBetween(start,end){
  if (!start || !end) return null;
  const ms = end - start;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return ms / 3600000;
}
function numberOrNull(v){
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : null;
}
function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function showView(id, push=true){
  for (const v of VIEWS){
    const el=$(v);
    if (el) el.classList.toggle("hidden", v !== id);
  }
  if (push) history.pushState({ view:id }, "", "#"+id);
}
window.addEventListener("popstate", (e) => {
  const view = e.state?.view || (location.hash ? location.hash.replace("#","") : "menuView");
  if (VIEWS.includes(view)) showView(view, false);
});

function setText(id, msg){ const el=$(id); if (el) el.textContent = msg || ""; }

async function requireUser(){
  const { data, error } = await sb.auth.getUser();
  if (error || !data?.user) throw new Error("Not logged in.");
  return data.user;
}

/* ---------------- auth ---------------- */
async function doRegister(){
  try{
    const email = ($("email").value || "").trim();
    const password = $("password").value || "";
    const invite = ($("inviteCode").value || "").trim();

    if (!email || !password) return setText("authMsg","Enter BOTH email and password.");
    if (invite !== INVITE_CODE_REQUIRED) return setText("authMsg","Invite code required for registration.");

    setText("authMsg","Registering…");
    const res = await sb.auth.signUp({ email, password, options:{ emailRedirectTo: SITE_URL }});
    if (res.error) throw res.error;
    setText("authMsg","Registered ✅ If email confirmation is enabled, confirm then login.");
  }catch(err){
    setText("authMsg", err.message || String(err));
  }
}
async function doLogin(){
  try{
    const email = ($("email").value || "").trim();
    const password = $("password").value || "";
    if (!email || !password) return setText("authMsg","Enter BOTH email and password.");

    setText("authMsg","Logging in…");
    const res = await sb.auth.signInWithPassword({ email, password });
    if (res.error) throw res.error;

    setText("authMsg","");
    await refreshAll();
    showView("menuView");
  }catch(err){
    setText("authMsg", err.message || String(err));
  }
}
async function doForgotPassword(){
  try{
    const email = ($("email").value || "").trim();
    if (!email) return setText("authMsg","Enter your email first.");

    setText("authMsg","Sending reset email…");
    const res = await sb.auth.resetPasswordForEmail(email, { redirectTo: SITE_URL });
    if (res.error) throw res.error;

    setText("authMsg","Reset email sent ✅ Check inbox/spam.");
  }catch(err){
    setText("authMsg", err.message || String(err));
  }
}
function isRecoveryLink(){ return (location.hash || "").includes("type=recovery"); }

async function setNewPassword(){
  try{
    const p1 = $("newPassword").value || "";
    const p2 = $("newPassword2").value || "";
    if (!p1 || p1.length < 6) return setText("resetMsg","Password must be at least 6 characters.");
    if (p1 !== p2) return setText("resetMsg","Passwords do not match.");

    setText("resetMsg","Updating password…");
    const res = await sb.auth.updateUser({ password: p1 });
    if (res.error) throw res.error;

    setText("resetMsg","Password updated ✅ Please login.");
    history.replaceState(null, "", location.pathname + location.search);
    await sb.auth.signOut();
    showView("authView");
  }catch(err){
    setText("resetMsg", err.message || String(err));
  }
}
async function doLogout(){
  await sb.auth.signOut();
  showView("authView");
}

/* ---------------- data fetchers ---------------- */
async function listAccounts(){
  const user = await requireUser();
  const res = await sb.from("fin_accounts")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending:true });
  if (res.error) throw res.error;
  return res.data || [];
}
async function listBills(){
  const user = await requireUser();
  const res = await sb.from("fin_bills")
    .select("*")
    .eq("user_id", user.id)
    .order("next_due_date", { ascending:true });
  if (res.error) throw res.error;
  return res.data || [];
}
async function listCompanies(){
  const user = await requireUser();
  const res = await sb.from("fin_companies")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending:true });
  if (res.error) throw res.error;
  return res.data || [];
}
async function fetchShift(companyId, dateStr){
  const user = await requireUser();
  const res = await sb.from("fin_shifts")
    .select("*")
    .eq("user_id", user.id)
    .eq("company_id", companyId)
    .eq("work_date", dateStr)
    .maybeSingle();
  if (res.error && res.status !== 406) throw res.error;
  return res.data || null;
}
async function listCompanyMonthShifts(companyId, monthDate){
  const user = await requireUser();
  const { start, end } = monthRange(monthDate);
  const res = await sb.from("fin_shifts")
    .select("work_date,start_time,end_time,total_mileage,estimated_pay")
    .eq("user_id", user.id)
    .eq("company_id", companyId)
    .gte("start_time", start.toISOString())
    .lt("start_time", end.toISOString())
    .order("work_date", { ascending:false });
  if (res.error) throw res.error;
  return res.data || [];
}

/* ---------------- Accounts UI ---------------- */
function clearAccountForm(){
  $("accountId").value = "";
  $("accountName").value = "";
  $("accountType").value = "bank";
  $("accountNotes").value = "";
  setText("accountsMsg","");
}
async function saveAccount(){
  try{
    const user = await requireUser();
    const id = ($("accountId").value || "").trim();
    const name = ($("accountName").value || "").trim();
    const account_type = $("accountType").value || "bank";
    const notes = ($("accountNotes").value || "").trim() || null;

    if (!name) return setText("accountsMsg","Account name is required.");
    setText("accountsMsg","Saving…");

    if (id){
      const res = await sb.from("fin_accounts").update({ name, account_type, notes })
        .eq("id", id).eq("user_id", user.id);
      if (res.error) throw res.error;
    }else{
      const res = await sb.from("fin_accounts").insert({ user_id:user.id, name, account_type, notes });
      if (res.error) throw res.error;
    }
    clearAccountForm();
    await renderAccounts();
    await fillBillAccountsSelect();
    setText("accountsMsg","Saved ✅");
  }catch(err){
    console.error(err);
    setText("accountsMsg", err.message || String(err));
  }
}
async function renderAccounts(){
  const rows = await listAccounts();
  const ul = $("accountsList");
  ul.innerHTML = "";

  if (!rows.length){
    setText("accountsMsg","No accounts yet. Add one above.");
    return;
  }

  for (const a of rows){
    const li = document.createElement("li");
    li.innerHTML = `
      <b>${escapeHtml(a.name)}</b> • ${escapeHtml(a.account_type)}
      <button class="secondary miniInlineBtn" data-edit="${a.id}" type="button">Edit</button>
      <button class="secondary miniInlineBtn" data-del="${a.id}" type="button">Delete</button>
    `;
    ul.appendChild(li);
  }

  ul.querySelectorAll("[data-edit]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = btn.getAttribute("data-edit");
      const a = rows.find(x=>x.id===id);
      if (!a) return;
      $("accountId").value = a.id;
      $("accountName").value = a.name || "";
      $("accountType").value = a.account_type || "bank";
      $("accountNotes").value = a.notes || "";
      setText("accountsMsg","Editing…");
      window.scrollTo({ top:0, behavior:"smooth" });
    });
  });

  ul.querySelectorAll("[data-del]").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const id = btn.getAttribute("data-del");
      const a = rows.find(x=>x.id===id);
      if (!a) return;
      if (!confirm(`Delete account "${a.name}"?\n\nBills that use it will keep working (account becomes blank).`)) return;
      try{
        const user = await requireUser();
        const res = await sb.from("fin_accounts").delete().eq("id", id).eq("user_id", user.id);
        if (res.error) throw res.error;
        await renderAccounts();
        await fillBillAccountsSelect();
      }catch(err){
        setText("accountsMsg", err.message || String(err));
      }
    });
  });
}

/* ---------------- Bills UI ---------------- */
function clearBillForm(){
  $("billId").value = "";
  $("billName").value = "";
  $("billAmount").value = "";
  $("billNextDue").value = "";
  $("billFrequency").value = "monthly";
  $("billCategory").value = "";
  $("billExpiry").value = "";
  $("billAutoPay").checked = true;
  $("billVariable").checked = false;
  $("billActive").checked = true;
  $("billNotes").value = "";
  setText("billsMsg","");
}

async function fillBillAccountsSelect(){
  const sel = $("billAccount");
  const accounts = await listAccounts();
  sel.innerHTML = `<option value="">(none)</option>` + accounts.map(a=>(
    `<option value="${a.id}">${escapeHtml(a.name)}</option>`
  )).join("");
}

async function saveBill(){
  try{
    const user = await requireUser();
    const id = ($("billId").value || "").trim();

    const name = ($("billName").value || "").trim();
    const amount = numberOrNull($("billAmount").value);
    const next_due_date = $("billNextDue").value || null;

    if (!name) return setText("billsMsg","Bill name is required.");
    if (amount === null || amount < 0) return setText("billsMsg","Enter a valid amount (positive number).");
    if (!next_due_date) return setText("billsMsg","Next due date is required.");

    const frequency = $("billFrequency").value || "monthly";
    const category = ($("billCategory").value || "").trim() || null;
    const expiry_date = $("billExpiry").value || null;
    const account_id = $("billAccount").value || null;

    const auto_pay = $("billAutoPay").checked;
    const variable_amount = $("billVariable").checked;
    const active = $("billActive").checked;
    const notes = ($("billNotes").value || "").trim() || null;

    setText("billsMsg","Saving…");

    const payload = {
      user_id: user.id,
      name,
      amount,
      currency: "GBP",
      is_recurring: frequency !== "one_off",
      frequency,
      next_due_date,
      category,
      vendor: null,
      due_day: null,
      account_id,
      auto_pay,
      variable_amount,
      expiry_date,
      active,
      notes
    };

    if (id){
      const res = await sb.from("fin_bills").update(payload).eq("id", id).eq("user_id", user.id);
      if (res.error) throw res.error;
    }else{
      const res = await sb.from("fin_bills").insert(payload);
      if (res.error) throw res.error;
    }

    clearBillForm();
    await renderBills();
    setText("billsMsg","Saved ✅");
  }catch(err){
    console.error(err);
    setText("billsMsg", err.message || String(err));
  }
}

async function renderBills(){
  const bills = await listBills();
  const accounts = await listAccounts();
  const accMap = new Map(accounts.map(a=>[a.id, a.name]));

  const ul = $("billsList");
  ul.innerHTML = "";

  if (!bills.length){
    setText("billsMsg","No bills yet. Add one above.");
    return;
  }

  setText("billsMsg","");

  for (const b of bills){
    const acc = b.account_id ? (accMap.get(b.account_id) || "Account") : "";
    const freq = b.frequency || (b.is_recurring ? "monthly" : "one_off");
    const act = b.active ? "" : " (inactive)";
    const li = document.createElement("li");
    li.innerHTML = `
      <b>${escapeHtml(b.name)}</b>${act}
      • £${Number(b.amount).toFixed(2)}
      • due ${b.next_due_date}
      • ${escapeHtml(freq)}
      ${acc ? "• " + escapeHtml(acc) : ""}
      <button class="secondary miniInlineBtn" data-edit="${b.id}" type="button">Edit</button>
      <button class="secondary miniInlineBtn" data-del="${b.id}" type="button">Delete</button>
    `;
    ul.appendChild(li);
  }

  ul.querySelectorAll("[data-edit]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = btn.getAttribute("data-edit");
      const b = bills.find(x=>x.id===id);
      if (!b) return;

      $("billId").value = b.id;
      $("billName").value = b.name || "";
      $("billAmount").value = b.amount ?? "";
      $("billNextDue").value = b.next_due_date || "";
      $("billFrequency").value = b.frequency || "monthly";
      $("billAccount").value = b.account_id || "";
      $("billCategory").value = b.category || "";
      $("billExpiry").value = b.expiry_date || "";
      $("billAutoPay").checked = !!b.auto_pay;
      $("billVariable").checked = !!b.variable_amount;
      $("billActive").checked = !!b.active;
      $("billNotes").value = b.notes || "";

      setText("billsMsg","Editing…");
      window.scrollTo({ top:0, behavior:"smooth" });
    });
  });

  ul.querySelectorAll("[data-del]").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const id = btn.getAttribute("data-del");
      const b = bills.find(x=>x.id===id);
      if (!b) return;
      if (!confirm(`Delete bill "${b.name}"?`)) return;
      try{
        const user = await requireUser();
        const res = await sb.from("fin_bills").delete().eq("id", id).eq("user_id", user.id);
        if (res.error) throw res.error;
        await renderBills();
      }catch(err){
        setText("billsMsg", err.message || String(err));
      }
    });
  });
}

/* ---------------- Admin (Companies) ---------------- */
function clearCompanyForm(){
  $("companyId").value = "";
  $("companyName").value = "";
  $("cfgMileage").checked = true;
  $("cfgParcels").checked = true;
  $("cfgStops").checked = true;
  $("cfgPay").checked = true;
  setText("adminMsg","");
}
async function saveCompany(){
  try{
    const user = await requireUser();
    const id = ($("companyId").value || "").trim();
    const name = ($("companyName").value || "").trim();

    if (!name) return setText("adminMsg","Company name is required.");
    setText("adminMsg","Saving…");

    const payload = {
      user_id: user.id,
      name,
      uses_mileage: $("cfgMileage").checked,
      uses_parcels: $("cfgParcels").checked,
      uses_stops: $("cfgStops").checked,
      uses_pay: $("cfgPay").checked
    };

    if (id){
      const res = await sb.from("fin_companies").update(payload).eq("id", id).eq("user_id", user.id);
      if (res.error) throw res.error;
    }else{
      const res = await sb.from("fin_companies").insert(payload);
      if (res.error) throw res.error;
    }

    clearCompanyForm();
    await renderCompanies();
    await fillCompanySelect();
    setText("adminMsg","Saved ✅");
  }catch(err){
    console.error(err);
    setText("adminMsg", err.message || String(err));
  }
}
async function renderCompanies(){
  const companies = await listCompanies();
  const ul = $("companiesList");
  ul.innerHTML = "";

  if (!companies.length){
    setText("adminMsg","No companies yet. Add one above (e.g. Evri).");
    return;
  }

  setText("adminMsg","");

  for (const c of companies){
    const li = document.createElement("li");
    li.innerHTML = `
      <b>${escapeHtml(c.name)}</b>
      <button class="secondary miniInlineBtn" data-edit="${c.id}" type="button">Edit</button>
      <button class="secondary miniInlineBtn" data-del="${c.id}" type="button">Delete</button>
    `;
    ul.appendChild(li);
  }

  ul.querySelectorAll("[data-edit]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = btn.getAttribute("data-edit");
      const c = companies.find(x=>x.id===id);
      if (!c) return;

      $("companyId").value = c.id;
      $("companyName").value = c.name || "";
      $("cfgMileage").checked = !!c.uses_mileage;
      $("cfgParcels").checked = !!c.uses_parcels;
      $("cfgStops").checked = !!c.uses_stops;
      $("cfgPay").checked = !!c.uses_pay;

      setText("adminMsg","Editing…");
      window.scrollTo({ top:0, behavior:"smooth" });
    });
  });

  ul.querySelectorAll("[data-del]").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const id = btn.getAttribute("data-del");
      const c = companies.find(x=>x.id===id);
      if (!c) return;
      if (!confirm(`Delete company "${c.name}"?\n\nIf you have shifts saved for it, deletion may be blocked (restrict).`)) return;
      try{
        const user = await requireUser();
        const res = await sb.from("fin_companies").delete().eq("id", id).eq("user_id", user.id);
        if (res.error) throw res.error;
        await renderCompanies();
        await fillCompanySelect();
      }catch(err){
        setText("adminMsg", err.message || String(err));
      }
    });
  });
}

/* ---------------- Finances (Shift entry) ---------------- */
let companyCache = [];

async function fillCompanySelect(){
  companyCache = await listCompanies();
  const sel = $("finCompanySelect");
  sel.innerHTML = companyCache.length
    ? companyCache.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("")
    : `<option value="">No companies yet (go Admin)</option>`;

  if (!activeCompanyId || !companyCache.find(c=>c.id===activeCompanyId)){
    activeCompanyId = companyCache[0]?.id || "";
  }
  sel.value = activeCompanyId || "";
  applyCompanyToggles();
}

function applyCompanyToggles(){
  const c = companyCache.find(x=>x.id===activeCompanyId);
  const usesMileage = !!c?.uses_mileage;
  const usesParcels = !!c?.uses_parcels;
  const usesStops = !!c?.uses_stops;
  const usesPay = !!c?.uses_pay;

  $("mileageBlock").classList.toggle("hidden", !usesMileage);
  $("mileageBadgeWrap").classList.toggle("hidden", !usesMileage);

  $("parcelsWrap").classList.toggle("hidden", !usesParcels);
  $("stopsWrap").classList.toggle("hidden", !usesStops);
  $("statsBlock").classList.toggle("hidden", !(usesParcels || usesStops));

  $("payBlock").classList.toggle("hidden", !usesPay);
  $("rateBadgeWrap").classList.toggle("hidden", !usesPay);

  refreshShiftBadges();
}

function syncFinDatePicker(){
  $("finDatePicker").max = todayStr();
  $("finDatePicker").value = finDateStr;
  $("finNext").disabled = finDateStr >= todayStr();
}

function calcShiftMileage(){
  const s = numberOrNull($("shiftStartMileage").value);
  const e = numberOrNull($("shiftEndMileage").value);
  if (s === null || e === null || e < s){
    $("shiftTotalMileage").value = "";
    return null;
  }
  const t = Number((e - s).toFixed(1));
  $("shiftTotalMileage").value = String(t);
  return t;
}

function calcShiftHours(){
  const st = fromLocalInput($("shiftStartTime").value);
  const et = fromLocalInput($("shiftEndTime").value);
  const h = hoursBetween(st, et);
  return h ? Number(h.toFixed(2)) : null;
}

function calcRate(){
  const h = calcShiftHours();
  const pay = numberOrNull($("shiftPay").value);
  if (h === null || pay === null || h <= 0) return null;
  return Number((pay / h).toFixed(2));
}

function refreshShiftBadges(){
  const h = calcShiftHours();
  $("hoursBadge").textContent = h === null ? "—" : String(h);

  const mi = calcShiftMileage();
  $("mileageBadge").textContent = mi === null ? "—" : String(mi);

  const r = calcRate();
  $("rateBadge").textContent = r === null ? "—" : String(r);
  $("shiftPayPerHour").value = r === null ? "" : String(r);
}

function clearShiftForm(){
  $("shiftStartTime").value = "";
  $("shiftEndTime").value = "";
  $("shiftStartMileage").value = "";
  $("shiftEndMileage").value = "";
  $("shiftTotalMileage").value = "";
  $("shiftParcels").value = "";
  $("shiftStops").value = "";
  $("shiftPay").value = "";
  $("shiftPayPerHour").value = "";
  $("shiftNotes").value = "";
  refreshShiftBadges();
}

async function loadShift(){
  setText("finMsg","Loading…");
  clearShiftForm();

  if (!activeCompanyId){
    setText("finMsg","Add a company in Admin first.");
    return;
  }

  const row = await fetchShift(activeCompanyId, finDateStr);
  if (!row){
    setText("finMsg","No shift saved for this date yet.");
    return;
  }

  if (row.start_time) $("shiftStartTime").value = toLocalInput(row.start_time);
  if (row.end_time) $("shiftEndTime").value = toLocalInput(row.end_time);

  $("shiftStartMileage").value = row.start_mileage ?? "";
  $("shiftEndMileage").value = row.end_mileage ?? "";
  $("shiftTotalMileage").value = row.total_mileage ?? "";

  $("shiftParcels").value = row.total_parcels ?? "";
  $("shiftStops").value = row.total_stops ?? "";

  $("shiftPay").value = row.estimated_pay ?? "";
  $("shiftNotes").value = row.notes ?? "";

  refreshShiftBadges();
  setText("finMsg","");
}

async function saveShift(){
  try{
    if (!activeCompanyId) return setText("finMsg","Select a company first.");

    const user = await requireUser();

    const st = fromLocalInput($("shiftStartTime").value);
    if (!st) return setText("finMsg","Start time is required.");

    const et = fromLocalInput($("shiftEndTime").value);

    const start_mileage = numberOrNull($("shiftStartMileage").value);
    const end_mileage = numberOrNull($("shiftEndMileage").value);
    const total_mileage = calcShiftMileage();

    const total_parcels = numberOrNull($("shiftParcels").value);
    const total_stops = numberOrNull($("shiftStops").value);
    const estimated_pay = numberOrNull($("shiftPay").value);
    const notes = ($("shiftNotes").value || "").trim() || null;

    setText("finMsg","Saving…");

    const payload = {
      user_id: user.id,
      company_id: activeCompanyId,
      work_date: finDateStr,
      start_time: st.toISOString(),
      end_time: et ? et.toISOString() : null,
      break_minutes: null,

      start_mileage,
      end_mileage,
      total_mileage,

      total_parcels,
      total_stops,

      estimated_pay,
      notes
    };

    const res = await sb.from("fin_shifts").upsert([payload], { onConflict:"user_id,company_id,work_date" });
    if (res.error) throw res.error;

    setText("finMsg","Saved ✅");
    await loadShift();
    await renderShiftMonthList();
  }catch(err){
    console.error(err);
    setText("finMsg", err.message || String(err));
  }
}

async function deleteShift(){
  try{
    if (!activeCompanyId) return;
    if (!confirm("Delete saved shift for this date?")) return;

    const user = await requireUser();
    const res = await sb.from("fin_shifts")
      .delete()
      .eq("user_id", user.id)
      .eq("company_id", activeCompanyId)
      .eq("work_date", finDateStr);
    if (res.error) throw res.error;

    clearShiftForm();
    setText("finMsg","Deleted ✅");
    await renderShiftMonthList();
  }catch(err){
    console.error(err);
    setText("finMsg", err.message || String(err));
  }
}

function startShiftNow(){
  $("shiftStartTime").value = toLocalInput(new Date());
  refreshShiftBadges();
  setText("finMsg","Start time set. Tap Save when ready.");
}
function endShiftNow(){
  $("shiftEndTime").value = toLocalInput(new Date());
  refreshShiftBadges();
  setText("finMsg","End time set. Tap Save when ready.");
}

async function renderShiftMonthList(){
  const ul = $("shiftMonthList");
  ul.innerHTML = "";

  if (!activeCompanyId) return;

  const rows = await listCompanyMonthShifts(activeCompanyId, monthCursor);
  if (!rows.length) return;

  for (const r of rows){
    const st = r.start_time ? new Date(r.start_time) : null;
    const et = r.end_time ? new Date(r.end_time) : null;
    const h = st && et ? hoursBetween(st, et) : null;
    const hTxt = h ? `${h.toFixed(2)}h` : "—";
    const miTxt = (r.total_mileage ?? null) !== null ? `${Number(r.total_mileage).toFixed(1)} mi` : "";
    const payTxt = (r.estimated_pay ?? null) !== null ? `£${Number(r.estimated_pay).toFixed(2)}` : "";
    const li = document.createElement("li");
    li.innerHTML = `<b>${r.work_date}</b> • ${hTxt}${miTxt ? " • "+miTxt : ""}${payTxt ? " • "+payTxt : ""}`;
    ul.appendChild(li);
  }
}

/* ---------------- Monthly Summary ---------------- */
async function listShiftsInMonth(monthDate){
  const user = await requireUser();
  const { start, end } = monthRange(monthDate);
  const res = await sb.from("fin_shifts")
    .select("start_time,end_time,estimated_pay")
    .eq("user_id", user.id)
    .gte("start_time", start.toISOString())
    .lt("start_time", end.toISOString());
  if (res.error) throw res.error;
  return res.data || [];
}

async function listBillsDueInMonth(monthDate){
  const user = await requireUser();
  const { start, end } = monthRange(monthDate);
  const startStr = yyyyMmDd(start);
  const endStr = yyyyMmDd(new Date(end.getTime() - 86400000)); // inclusive end of month
  const res = await sb.from("fin_bills")
    .select("name,amount,next_due_date,active")
    .eq("user_id", user.id)
    .eq("active", true)
    .gte("next_due_date", startStr)
    .lte("next_due_date", endStr)
    .order("next_due_date", { ascending:true });
  if (res.error) throw res.error;
  return res.data || [];
}

async function listUpcomingBills(days=14){
  const user = await requireUser();
  const startStr = todayStr();
  const endStr = yyyyMmDd(new Date(Date.now() + days*86400000));
  const res = await sb.from("fin_bills")
    .select("name,amount,next_due_date,active")
    .eq("user_id", user.id)
    .eq("active", true)
    .gte("next_due_date", startStr)
    .lte("next_due_date", endStr)
    .order("next_due_date", { ascending:true });
  if (res.error) throw res.error;
  return res.data || [];
}

async function renderMonthly(){
  $("monthLabel").textContent = monthLabel(monthCursor);
  $("monthNext").disabled = (monthCursor >= startOfMonth(new Date()));

  setText("monthlyMsg","Loading…");

  const shifts = await listShiftsInMonth(monthCursor);
  const billsDue = await listBillsDueInMonth(monthCursor);
  const upcoming = await listUpcomingBills(14);

  let shiftCount = 0;
  let totalHours = 0;
  let totalIncome = 0;

  for (const r of shifts){
    shiftCount += 1;
    const st = r.start_time ? new Date(r.start_time) : null;
    const et = r.end_time ? new Date(r.end_time) : null;
    const h = st && et ? hoursBetween(st, et) : 0;
    totalHours += (h || 0);
    totalIncome += Number(r.estimated_pay || 0);
  }

  let totalBills = 0;
  for (const b of billsDue){
    totalBills += Number(b.amount || 0);
  }

  setText("kpiShifts", String(shiftCount));
  setText("kpiHours", totalHours.toFixed(2));
  setText("kpiIncome", totalIncome.toFixed(2));
  setText("kpiBills", totalBills.toFixed(2));
  setText("kpiNet", (totalIncome - totalBills).toFixed(2));
  setText("kpiUpcoming", String(upcoming.length));

  const ul = $("upcomingBillsList");
  ul.innerHTML = "";
  if (!upcoming.length){
    ul.innerHTML = `<li>No upcoming bills in the next 14 days.</li>`;
  }else{
    for (const b of upcoming){
      const li = document.createElement("li");
      li.innerHTML = `<b>${escapeHtml(b.name)}</b> • £${Number(b.amount).toFixed(2)} • due ${b.next_due_date}`;
      ul.appendChild(li);
    }
  }

  setText("monthlyMsg","");
}

/* ---------------- Refresh all ---------------- */
async function refreshAll(){
  try{
    setText("menuMsg","Loading…");
    await fillBillAccountsSelect();
    await renderAccounts();
    await renderBills();
    await renderCompanies();
    await fillCompanySelect();

    // if no companies, tell user on Finances page
    syncFinDatePicker();
    setText("menuMsg", "");
  }catch(err){
    console.error(err);
    setText("menuMsg", err.message || String(err));
  }
}

/* ---------------- init ---------------- */
async function init(){
  // auth
  $("btnLogin").onclick = doLogin;
  $("btnRegister").onclick = doRegister;
  $("btnForgot").onclick = doForgotPassword;
  $("btnSetNewPassword").onclick = setNewPassword;

  // menu
  $("btnLogout").onclick = doLogout;
  $("btnRefresh").onclick = refreshAll;

  $("goMonthly").onclick = async ()=>{ await renderMonthly(); showView("monthlyView"); };
  $("goBills").onclick = async ()=>{ await fillBillAccountsSelect(); await renderBills(); showView("billsView"); };
  $("goAccounts").onclick = async ()=>{ await renderAccounts(); showView("accountsView"); };
  $("goFinances").onclick = async ()=>{ await fillCompanySelect(); syncFinDatePicker(); await loadShift(); await renderShiftMonthList(); showView("financesView"); };
  $("goAdmin").onclick = async ()=>{ await renderCompanies(); showView("adminView"); };

  // back buttons
  $("monthlyBack").onclick = ()=> showView("menuView");
  $("billsBack").onclick = ()=> showView("menuView");
  $("accountsBack").onclick = ()=> showView("menuView");
  $("financesBack").onclick = ()=> showView("menuView");
  $("adminBack").onclick = ()=> showView("menuView");

  // monthly nav
  $("monthPrev").onclick = async ()=>{ monthCursor = addMonths(monthCursor,-1); await renderMonthly(); };
  $("monthNext").onclick = async ()=>{ monthCursor = addMonths(monthCursor,+1); await renderMonthly(); };

  // accounts actions
  $("btnSaveAccount").onclick = saveAccount;
  $("btnClearAccount").onclick = clearAccountForm;

  // bills actions
  $("btnSaveBill").onclick = saveBill;
  $("btnClearBill").onclick = clearBillForm;

  // admin companies actions
  $("btnSaveCompany").onclick = saveCompany;
  $("btnClearCompany").onclick = clearCompanyForm;

  // finances
  $("finCompanySelect").onchange = async (e)=>{
    activeCompanyId = e.target.value || "";
    applyCompanyToggles();
    await loadShift();
    await renderShiftMonthList();
  };

  $("finPrev").onclick = async ()=>{ finDateStr = addDays(finDateStr,-1); syncFinDatePicker(); await loadShift(); };
  $("finNext").onclick = async ()=>{ finDateStr = addDays(finDateStr,+1); syncFinDatePicker(); await loadShift(); };
  $("finDatePicker").onchange = async (e)=>{ finDateStr = e.target.value; syncFinDatePicker(); await loadShift(); };

  $("btnStartShift").onclick = startShiftNow;
  $("btnEndShift").onclick = endShiftNow;
  $("btnSaveShift").onclick = saveShift;
  $("btnDeleteShift").onclick = deleteShift;

  ["shiftStartTime","shiftEndTime","shiftStartMileage","shiftEndMileage","shiftPay"].forEach(id=>{
    const el=$(id); if (el) el.addEventListener("input", refreshShiftBadges);
  });

  // initial view
  if (isRecoveryLink()){
    showView("resetView", false);
    return;
  }

  const sess = await sb.auth.getSession();
  if (sess.data?.session){
    await refreshAll();
    showView("menuView", false);
  }else{
    showView("authView", false);
  }

  finDateStr = todayStr();
  syncFinDatePicker();
}

init().catch((e)=>{ console.error(e); alert(e.message || String(e)); });
