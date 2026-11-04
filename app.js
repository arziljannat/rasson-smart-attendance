(() => {
  "use strict";
  const cfg=window.RASSON_CONFIG||{};
  const configured=cfg.SUPABASE_URL&&cfg.SUPABASE_ANON_KEY&&!cfg.SUPABASE_URL.includes("PASTE_")&&!cfg.SUPABASE_ANON_KEY.includes("PASTE_");
  const $=id=>document.getElementById(id);
  let db,branchesCache=[],shiftsCache=[],employeesCache=[],attendanceCache=[];
  const msg=(id,text,type="")=>{$(id).textContent=text;$(id).className="message "+type;};
  const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const timeLabel=value=>String(value||"").slice(0,5);
  const localDate=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");};
  const localTime=()=>{const d=new Date();return String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");};
  const timeToMinutes=t=>{const [h,m]=String(t||"00:00").slice(0,5).split(":").map(Number);return h*60+m;};
  function signedOut(){$("loginPanel").classList.remove("hidden");$("appPanel").classList.add("hidden");$("signOutBtn").classList.add("hidden");}
  function signedIn(email){$("loginPanel").classList.add("hidden");$("appPanel").classList.remove("hidden");$("signOutBtn").classList.remove("hidden");$("adminEmail").textContent=email||"Admin";}

  async function adminUser(){
    const {data,error}=await db.auth.getUser();if(error||!data.user)return null;
    const {data:profile,error:pe}=await db.from("profiles").select("role").eq("id",data.user.id).maybeSingle();
    if(pe)throw pe;if(!profile||profile.role!=="admin"){await db.auth.signOut();throw new Error("This account is not an admin. Ask the project owner to grant admin access.");}return data.user;
  }
  function fillBranchSelects(){
    const opts=branchesCache.filter(b=>b.is_active).map(b=>`<option value="${esc(b.id)}">${esc(b.name)} (${esc(b.code)})</option>`).join("");
    $("employeeBranch").innerHTML='<option value="">Select branch</option>'+opts;$("shiftBranch").innerHTML='<option value="">Select branch</option>'+opts;renderEmployeeShiftOptions();
  }
  function renderEmployeeShiftOptions(){
    const branchId=$("employeeBranch").value,list=shiftsCache.filter(s=>s.is_active&&s.branch_id===branchId);
    $("employeeShift").innerHTML='<option value="">No shift assigned</option>'+list.map(s=>`<option value="${esc(s.id)}">${esc(s.name)} (${timeLabel(s.start_time)}–${timeLabel(s.end_time)})</option>`).join("");
    if(!branchId)$("employeeShift").innerHTML='<option value="">Select branch first</option>';
  }
  function renderEmployeeRows(){
    $("employeeRows").innerHTML=employeesCache.length?employeesCache.map(e=>{
      const opts=shiftsCache.filter(s=>s.branch_id===e.branch_id&&s.is_active).map(s=>`<option value="${esc(s.id)}" ${s.id===e.shift_id?"selected":""}>${esc(s.name)} · ${timeLabel(s.start_time)}–${timeLabel(s.end_time)}</option>`).join("");
      return `<tr><td>${esc(e.employee_code)}</td><td>${esc(e.full_name)}<small>${esc(e.phone)}</small></td><td>${esc(e.branches?.name||"—")}</td><td><div class="assign-control"><select class="row-shift" data-employee="${esc(e.id)}"><option value="">No shift</option>${opts}</select><button class="btn small-btn assign-shift" data-employee="${esc(e.id)}">Save</button></div></td><td><span class="status ${e.is_active?"active":"inactive"}">${e.is_active?"Active":"Inactive"}</span></td></tr>`;
    }).join(""):'<tr><td colspan="5">No employees yet.</td></tr>';
  }
  async function loadDashboard(){
    const [br,sr,er]=await Promise.all([
      db.from("branches").select("id,name,code,is_active").order("name"),
      db.from("shifts").select("id,branch_id,name,start_time,end_time,grace_minutes,is_active,branches(name)").order("name"),
      db.from("employees").select("id,employee_code,full_name,phone,is_active,branch_id,shift_id,branches(name)").order("full_name")
    ]);
    if(br.error)throw br.error;if(sr.error)throw sr.error;if(er.error)throw er.error;
    branchesCache=br.data||[];shiftsCache=sr.data||[];employeesCache=er.data||[];
    $("branchCount").textContent=branchesCache.length;$("employeeCount").textContent=employeesCache.length;$("activeCount").textContent=employeesCache.filter(e=>e.is_active).length;
    $("branchRows").innerHTML=branchesCache.length?branchesCache.map(b=>`<tr><td>${esc(b.name)}</td><td>${esc(b.code)}</td><td><span class="status ${b.is_active?"active":"inactive"}">${b.is_active?"Active":"Inactive"}</span></td></tr>`).join(""):'<tr><td colspan="3">No branches yet.</td></tr>';
    fillBranchSelects();
    $("shiftRows").innerHTML=shiftsCache.length?shiftsCache.map(s=>`<tr><td>${esc(s.branches?.name||"—")}</td><td>${esc(s.name)}</td><td>${timeLabel(s.start_time)}</td><td>${timeLabel(s.end_time)}</td><td>${Number(s.grace_minutes)} min</td><td><span class="status ${s.is_active?"active":"inactive"}">${s.is_active?"Active":"Inactive"}</span></td></tr>`).join(""):'<tr><td colspan="6">No shifts created yet.</td></tr>';
    renderEmployeeRows();await loadAttendance();
  }
  function statusText(record){return record?.attendance_status||"not_marked";}
  function statusClass(status){return status==="present"?"active":status==="late"?"late":status==="absent"?"inactive":status==="half_day"?"halfday":"pending";}
  function renderAttendance(){
    const recordsByEmployee=new Map(attendanceCache.map(r=>[r.employee_id,r]));
    const assigned=employeesCache.filter(e=>e.is_active&&e.shift_id&&shiftsCache.some(s=>s.id===e.shift_id&&s.is_active));
    let present=0,late=0,absent=0,notMarked=0;
    $("attendanceRows").innerHTML=assigned.length?assigned.map(e=>{
      const shift=shiftsCache.find(s=>s.id===e.shift_id),record=recordsByEmployee.get(e.id),status=statusText(record);
      if(status==="present")present++;else if(status==="late")late++;else if(status==="absent")absent++;else notMarked++;
      const actions=!record||status==="not_marked"
        ?`<button class="btn small-btn mark-checkin" data-employee="${esc(e.id)}">Check in</button><button class="btn small-btn mark-absent" data-employee="${esc(e.id)}">Absent</button>`
        :record.check_in&&!record.check_out
          ?`<button class="btn small-btn mark-checkout" data-record="${esc(record.id)}">Check out</button>`
          :'<span class="muted">Completed</span>';
      return `<tr><td><b>${esc(e.full_name)}</b><small>${esc(e.employee_code)}</small></td><td>${esc(e.branches?.name||"—")}<small>${esc(shift.name)}</small></td><td>${timeLabel(shift.start_time)}–${timeLabel(shift.end_time)}<small>${Number(shift.grace_minutes)} min grace</small></td><td>${record?.check_in?new Date(record.check_in).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}):"—"}</td><td>${record?.check_out?new Date(record.check_out).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}):"—"}</td><td><span class="status ${statusClass(status)}">${status.replace("_"," ")}</span></td><td><div class="attendance-actions">${actions}</div></td></tr>`;
    }).join(""):'<tr><td colspan="7">No active employees with an active shift assigned. Assign shifts in the Employees section first.</td></tr>';
    $("attendanceSummary").innerHTML=`<span>Present: <b>${present}</b></span><span>Late: <b>${late}</b></span><span>Absent: <b>${absent}</b></span><span>Not marked: <b>${notMarked}</b></span>`;
  }
  async function loadAttendance(){
    const date=$("attendanceDate").value;if(!date)return;
    const {data,error}=await db.from("attendance_records").select("id,employee_id,work_date,check_in,check_out,attendance_status").eq("work_date",date);
    if(error){msg("attendanceMessage",error.message+" — run supabase/attendance.sql in Supabase SQL Editor.","error");$("attendanceRows").innerHTML='<tr><td colspan="7">Attendance table setup required.</td></tr>';return;}
    attendanceCache=data||[];msg("attendanceMessage","Showing "+date+(date===localDate()?" · Today":" · Historical date"),"");
    renderAttendance();
  }
  async function saveAttendance(employeeId,mode,recordId){
    const date=$("attendanceDate").value;
    if(mode!=="absent"&&date!==localDate()){msg("attendanceMessage","Check-in/out actions are only allowed for today's date. You can mark a historical date absent.","error");return;}
    const employee=employeesCache.find(e=>e.id===employeeId);
    if(mode==="checkout"){
      const {error}=await db.from("attendance_records").update({check_out:new Date().toISOString()}).eq("id",recordId);
      if(error){msg("attendanceMessage",error.message,"error");return;}
    }else{
      const shift=shiftsCache.find(s=>s.id===employee?.shift_id);if(!employee||!shift){msg("attendanceMessage","Employee shift assignment is missing.","error");return;}
      let status="absent",checkIn=null;
      if(mode==="checkin"){
        checkIn=new Date().toISOString();
        const lateThreshold=timeToMinutes(shift.start_time)+Number(shift.grace_minutes);
        status=timeToMinutes(localTime())>lateThreshold?"late":"present";
      }
      const payload={employee_id:employee.id,branch_id:employee.branch_id,shift_id:shift.id,work_date:date,scheduled_start:shift.start_time,scheduled_end:shift.end_time,grace_minutes:Number(shift.grace_minutes),check_in:checkIn,check_out:null,attendance_status:status,source:"admin_manual"};
      const {error}=await db.from("attendance_records").upsert(payload,{onConflict:"employee_id,work_date"});
      if(error){msg("attendanceMessage",error.message,"error");return;}
    }
    msg("attendanceMessage",mode==="checkin"?"Check-in recorded.":mode==="checkout"?"Check-out recorded.":"Employee marked absent.","success");
    await loadAttendance();
  }
  async function refresh(){try{const user=await adminUser();if(!user){signedOut();return;}signedIn(user.email);await loadDashboard();}catch(e){signedOut();msg("loginMessage",e.message,"error");}}
  async function start(){
    if(!configured||!window.supabase){$("setupNotice").classList.remove("hidden");return;}
    db=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
    $("attendanceDate").value=localDate();
    $("loginForm").addEventListener("submit",async ev=>{ev.preventDefault();msg("loginMessage","Signing in…");const {error}=await db.auth.signInWithPassword({email:$("loginEmail").value.trim(),password:$("loginPassword").value});if(error){msg("loginMessage",error.message,"error");return;}await refresh();});
    $("signOutBtn").addEventListener("click",async()=>{await db.auth.signOut();signedOut();});
    $("branchForm").addEventListener("submit",async ev=>{ev.preventDefault();msg("branchMessage","Saving…");const {error}=await db.from("branches").insert({name:$("branchName").value.trim(),code:$("branchCode").value.trim().toUpperCase()});if(error){msg("branchMessage",error.message,"error");return;}$("branchForm").reset();msg("branchMessage","Branch added.","success");await loadDashboard();});
    $("shiftForm").addEventListener("submit",async ev=>{ev.preventDefault();const start=$("shiftStart").value,end=$("shiftEnd").value,grace=Number($("shiftGrace").value);if(!start||!end||start===end){msg("shiftMessage","Start and end times must be different.","error");return;}if(!Number.isInteger(grace)||grace<0||grace>240){msg("shiftMessage","Grace time must be between 0 and 240 minutes.","error");return;}msg("shiftMessage","Saving shift…");const {error}=await db.from("shifts").insert({branch_id:$("shiftBranch").value,name:$("shiftName").value.trim(),start_time:start,end_time:end,grace_minutes:grace});if(error){msg("shiftMessage",error.code==="23505"?"A shift with this name already exists for this branch.":error.message,"error");return;}$("shiftForm").reset();$("shiftStart").value="09:00";$("shiftEnd").value="21:00";$("shiftGrace").value="5";msg("shiftMessage","Shift created successfully.","success");await loadDashboard();});
    $("shiftName").addEventListener("change",()=>{
      if($("shiftName").value==="Morning Shift"){
        $("shiftStart").value="09:00";$("shiftEnd").value="21:00";
      }else if($("shiftName").value==="Night Shift"){
        $("shiftStart").value="21:00";$("shiftEnd").value="09:00";
      }
    });
    $("employeeBranch").addEventListener("change",renderEmployeeShiftOptions);
    $("employeeForm").addEventListener("submit",async ev=>{ev.preventDefault();msg("employeeMessage","Saving…");const payload={employee_code:$("employeeCode").value.trim().toUpperCase(),full_name:$("employeeName").value.trim(),phone:$("employeePhone").value.trim(),branch_id:$("employeeBranch").value,shift_id:$("employeeShift").value||null,is_active:$("employeeActive").checked};const {error}=await db.from("employees").insert(payload);if(error){msg("employeeMessage",error.message,"error");return;}$("employeeForm").reset();$("employeeActive").checked=true;renderEmployeeShiftOptions();msg("employeeMessage","Employee added.","success");await loadDashboard();});
    $("employeeRows").addEventListener("click",async ev=>{const button=ev.target.closest(".assign-shift");if(!button)return;const employeeId=button.dataset.employee,select=$("employeeRows").querySelector(`.row-shift[data-employee="${employeeId}"]`);button.disabled=true;button.textContent="Saving";const {error}=await db.from("employees").update({shift_id:select.value||null}).eq("id",employeeId);if(error){msg("employeeMessage",error.message,"error");button.disabled=false;button.textContent="Save";return;}msg("employeeMessage","Employee shift assignment updated.","success");await loadDashboard();});
    $("attendanceDate").addEventListener("change",loadAttendance);
    $("attendanceRows").addEventListener("click",async ev=>{const b=ev.target.closest("button");if(!b)return;b.disabled=true;if(b.classList.contains("mark-checkin"))await saveAttendance(b.dataset.employee,"checkin");else if(b.classList.contains("mark-checkout"))await saveAttendance(null,"checkout",b.dataset.record);else if(b.classList.contains("mark-absent"))await saveAttendance(b.dataset.employee,"absent");});
    await refresh();db.auth.onAuthStateChange(event=>{if(["SIGNED_IN","SIGNED_OUT","TOKEN_REFRESHED"].includes(event))window.setTimeout(refresh,0);});
  }
  start();
})();