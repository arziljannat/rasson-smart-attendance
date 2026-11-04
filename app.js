(() => {
  "use strict";
  const cfg = window.RASSON_CONFIG || {};
  const configured = cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_URL.includes("PASTE_") && !cfg.SUPABASE_ANON_KEY.includes("PASTE_");
  const $ = id => document.getElementById(id);
  let db, branchesCache = [], shiftsCache = [];
  const msg = (id, text, type="") => { $(id).textContent=text; $(id).className="message "+type; };
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const timeLabel = value => String(value || "").slice(0,5);
  function signedOut(){ $("loginPanel").classList.remove("hidden"); $("appPanel").classList.add("hidden"); $("signOutBtn").classList.add("hidden"); }
  function signedIn(email){ $("loginPanel").classList.add("hidden"); $("appPanel").classList.remove("hidden"); $("signOutBtn").classList.remove("hidden"); $("adminEmail").textContent=email||"Admin"; }

  async function adminUser(){
    const {data,error}=await db.auth.getUser();
    if(error||!data.user) return null;
    const {data:profile,error:profileError}=await db.from("profiles").select("role").eq("id",data.user.id).maybeSingle();
    if(profileError) throw profileError;
    if(!profile||profile.role!=="admin"){ await db.auth.signOut(); throw new Error("This account is not an admin. Ask the project owner to grant admin access."); }
    return data.user;
  }

  function fillBranchSelects(){
    const options = branchesCache.filter(b=>b.is_active).map(b=>`<option value="${esc(b.id)}">${esc(b.name)} (${esc(b.code)})</option>`).join("");
    $("employeeBranch").innerHTML='<option value="">Select branch</option>'+options;
    $("shiftBranch").innerHTML='<option value="">Select branch</option>'+options;
    renderEmployeeShiftOptions();
  }
  function renderEmployeeShiftOptions(){
    const branchId=$("employeeBranch").value;
    const list=shiftsCache.filter(s=>s.is_active && s.branch_id===branchId);
    $("employeeShift").innerHTML='<option value="">No shift assigned</option>'+list.map(s=>`<option value="${esc(s.id)}">${esc(s.name)} (${timeLabel(s.start_time)}–${timeLabel(s.end_time)})</option>`).join("");
    if(!branchId) $("employeeShift").innerHTML='<option value="">Select branch first</option>';
  }
  function renderEmployeeRows(employees){
    $("employeeRows").innerHTML=employees.length?employees.map(e=>{
      const options=shiftsCache.filter(s=>s.branch_id===e.branch_id && s.is_active).map(s=>`<option value="${esc(s.id)}" ${s.id===e.shift_id?"selected":""}>${esc(s.name)} · ${timeLabel(s.start_time)}–${timeLabel(s.end_time)}</option>`).join("");
      return `<tr><td>${esc(e.employee_code)}</td><td>${esc(e.full_name)}<small>${esc(e.phone)}</small></td><td>${esc(e.branches?.name||"—")}</td><td><div class="assign-control"><select class="row-shift" data-employee="${esc(e.id)}"><option value="">No shift</option>${options}</select><button class="btn small-btn assign-shift" data-employee="${esc(e.id)}">Save</button></div></td><td><span class="status ${e.is_active?"active":"inactive"}">${e.is_active?"Active":"Inactive"}</span></td></tr>`;
    }).join(""):'<tr><td colspan="5">No employees yet.</td></tr>';
  }

  async function loadDashboard(){
    const [br,sr,er]=await Promise.all([
      db.from("branches").select("id,name,code,is_active").order("name"),
      db.from("shifts").select("id,branch_id,name,start_time,end_time,grace_minutes,is_active,branches(name)").order("name"),
      db.from("employees").select("id,employee_code,full_name,phone,is_active,branch_id,shift_id,branches(name)").order("full_name")
    ]);
    if(br.error) throw br.error; if(sr.error) throw sr.error; if(er.error) throw er.error;
    branchesCache=br.data||[]; shiftsCache=sr.data||[];
    const employees=er.data||[];
    $("branchCount").textContent=branchesCache.length; $("employeeCount").textContent=employees.length;
    $("activeCount").textContent=employees.filter(e=>e.is_active).length;
    $("branchRows").innerHTML=branchesCache.length?branchesCache.map(b=>`<tr><td>${esc(b.name)}</td><td>${esc(b.code)}</td><td><span class="status ${b.is_active?"active":"inactive"}">${b.is_active?"Active":"Inactive"}</span></td></tr>`).join(""):'<tr><td colspan="3">No branches yet.</td></tr>';
    fillBranchSelects();
    $("shiftRows").innerHTML=shiftsCache.length?shiftsCache.map(s=>`<tr><td>${esc(s.branches?.name||"—")}</td><td>${esc(s.name)}</td><td>${timeLabel(s.start_time)}</td><td>${timeLabel(s.end_time)}</td><td>${Number(s.grace_minutes)} min</td><td><span class="status ${s.is_active?"active":"inactive"}">${s.is_active?"Active":"Inactive"}</span></td></tr>`).join(""):'<tr><td colspan="6">No shifts created yet.</td></tr>';
    renderEmployeeRows(employees);
  }

  async function refresh(){
    try{const user=await adminUser();if(!user){signedOut();return;}signedIn(user.email);await loadDashboard();}
    catch(e){signedOut();msg("loginMessage",e.message,"error");}
  }

  async function start(){
    if(!configured||!window.supabase){$("setupNotice").classList.remove("hidden");return;}
    db=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
    $("loginForm").addEventListener("submit",async ev=>{ev.preventDefault();msg("loginMessage","Signing in…");const {error}=await db.auth.signInWithPassword({email:$("loginEmail").value.trim(),password:$("loginPassword").value});if(error){msg("loginMessage",error.message,"error");return;}await refresh();});
    $("signOutBtn").addEventListener("click",async()=>{await db.auth.signOut();signedOut();});
    $("branchForm").addEventListener("submit",async ev=>{ev.preventDefault();msg("branchMessage","Saving…");const {error}=await db.from("branches").insert({name:$("branchName").value.trim(),code:$("branchCode").value.trim().toUpperCase()});if(error){msg("branchMessage",error.message,"error");return;} $("branchForm").reset();msg("branchMessage","Branch added.","success");await loadDashboard();});
    $("shiftForm").addEventListener("submit",async ev=>{
      ev.preventDefault();
      const start=$("shiftStart").value, end=$("shiftEnd").value, grace=Number($("shiftGrace").value);
      if(!start||!end||start===end){msg("shiftMessage","Start and end times must be different.","error");return;}
      if(!Number.isInteger(grace)||grace<0||grace>240){msg("shiftMessage","Grace time must be between 0 and 240 minutes.","error");return;}
      msg("shiftMessage","Saving shift…");
      const {error}=await db.from("shifts").insert({branch_id:$("shiftBranch").value,name:$("shiftName").value.trim(),start_time:start,end_time:end,grace_minutes:grace});
      if(error){msg("shiftMessage",error.code==="23505"?"A shift with this name already exists for this branch.":error.message,"error");return;}
      $("shiftForm").reset();$("shiftStart").value="09:00";$("shiftEnd").value="21:00";$("shiftGrace").value="5";
      msg("shiftMessage","Shift created successfully.","success");await loadDashboard();
    });
    $("employeeBranch").addEventListener("change",renderEmployeeShiftOptions);
    $("employeeForm").addEventListener("submit",async ev=>{
      ev.preventDefault();msg("employeeMessage","Saving…");
      const payload={employee_code:$("employeeCode").value.trim().toUpperCase(),full_name:$("employeeName").value.trim(),phone:$("employeePhone").value.trim(),branch_id:$("employeeBranch").value,shift_id:$("employeeShift").value||null,is_active:$("employeeActive").checked};
      const {error}=await db.from("employees").insert(payload);
      if(error){msg("employeeMessage",error.message,"error");return;}
      $("employeeForm").reset();$("employeeActive").checked=true;renderEmployeeShiftOptions();msg("employeeMessage","Employee added.","success");await loadDashboard();
    });
    $("employeeRows").addEventListener("click",async ev=>{
      const button=ev.target.closest(".assign-shift");if(!button)return;
      const employeeId=button.dataset.employee;
      const select=$("employeeRows").querySelector(`.row-shift[data-employee="${employeeId}"]`);
      button.disabled=true;button.textContent="Saving";
      const {error}=await db.from("employees").update({shift_id:select.value||null}).eq("id",employeeId);
      if(error){msg("employeeMessage",error.message,"error");button.disabled=false;button.textContent="Save";return;}
      msg("employeeMessage","Employee shift assignment updated.","success");await loadDashboard();
    });
    await refresh();
    db.auth.onAuthStateChange(event=>{if(["SIGNED_IN","SIGNED_OUT","TOKEN_REFRESHED"].includes(event)) window.setTimeout(refresh,0);});
  }
  start();
})();