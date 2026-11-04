(() => {
  "use strict";
  const cfg = window.RASSON_CONFIG || {};
  const configured = cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_URL.includes("PASTE_") && !cfg.SUPABASE_ANON_KEY.includes("PASTE_");
  const $ = id => document.getElementById(id);
  let db;
  const msg = (id, text, type="") => { $(id).textContent=text; $(id).className="message "+type; };
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
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

  async function loadDashboard(){
    const [br,er]=await Promise.all([
      db.from("branches").select("id,name,code,is_active").order("name"),
      db.from("employees").select("id,employee_code,full_name,phone,is_active,branches(name)").order("full_name")
    ]);
    if(br.error) throw br.error; if(er.error) throw er.error;
    const branches=br.data||[], employees=er.data||[];
    $("branchCount").textContent=branches.length; $("employeeCount").textContent=employees.length;
    $("activeCount").textContent=employees.filter(e=>e.is_active).length;
    $("branchRows").innerHTML=branches.length?branches.map(b=>`<tr><td>${esc(b.name)}</td><td>${esc(b.code)}</td><td><span class="status ${b.is_active?"active":"inactive"}">${b.is_active?"Active":"Inactive"}</span></td></tr>`).join(""):'<tr><td colspan="3">No branches yet.</td></tr>';
    $("employeeBranch").innerHTML='<option value="">Select branch</option>'+branches.filter(b=>b.is_active).map(b=>`<option value="${esc(b.id)}">${esc(b.name)} (${esc(b.code)})</option>`).join("");
    $("employeeRows").innerHTML=employees.length?employees.map(e=>`<tr><td>${esc(e.employee_code)}</td><td>${esc(e.full_name)}<small>${esc(e.phone)}</small></td><td>${esc(e.branches?.name||"—")}</td><td><span class="status ${e.is_active?"active":"inactive"}">${e.is_active?"Active":"Inactive"}</span></td></tr>`).join(""):'<tr><td colspan="4">No employees yet.</td></tr>';
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
    $("branchForm").addEventListener("submit",async ev=>{ev.preventDefault();msg("branchMessage","Saving…");const {error}=await db.from("branches").insert({name:$("branchName").value.trim(),code:$("branchCode").value.trim().toUpperCase()});if(error){msg("branchMessage",error.message,"error");return;}$("branchForm").reset();msg("branchMessage","Branch added.","success");await loadDashboard();});
    $("employeeForm").addEventListener("submit",async ev=>{ev.preventDefault();msg("employeeMessage","Saving…");const {error}=await db.from("employees").insert({employee_code:$("employeeCode").value.trim().toUpperCase(),full_name:$("employeeName").value.trim(),phone:$("employeePhone").value.trim(),branch_id:$("employeeBranch").value,is_active:$("employeeActive").checked});if(error){msg("employeeMessage",error.message,"error");return;}$("employeeForm").reset();$("employeeActive").checked=true;msg("employeeMessage","Employee added.","success");await loadDashboard();});
    await refresh();
    db.auth.onAuthStateChange(event=>{if(["SIGNED_IN","SIGNED_OUT","TOKEN_REFRESHED"].includes(event)) window.setTimeout(refresh,0);});
  }
  start();
})();