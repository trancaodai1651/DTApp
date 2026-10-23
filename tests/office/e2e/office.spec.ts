import { test,expect,type Page } from '@playwright/test';
const org='11111111-1111-4111-a111-111111111111',user='22222222-2222-4222-a222-222222222222',agent='33333333-3333-4333-a333-333333333333',project='44444444-4444-4444-a444-444444444444';
const now=new Date().toISOString();
// Explicit UI test fixtures. No production demo agents or fabricated runtime.
async function fixture(page:Page){
 const exp=Math.floor(Date.now()/1000)+3600;
 const token=`${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:user,exp,aud:'authenticated',role:'authenticated'})).toString('base64url')}.fixture-signature`;
 const account={id:user,aud:'authenticated',role:'authenticated',email:'ceo@fixture.invalid',app_metadata:{provider:'google'},user_metadata:{},created_at:now,is_anonymous:false};
 await page.addInitScript(({token,exp,account})=>{
  localStorage.setItem('dt.office.connection',JSON.stringify({supabaseUrl:'https://office-fixture.supabase.co',publishableKey:'sb_publishable_test_fixture_only',apiUrl:location.origin}));
  localStorage.setItem('dt-office-auth',JSON.stringify({access_token:token,refresh_token:'fixture-refresh',token_type:'bearer',expires_in:3600,expires_at:exp,user:account}));
 },{token,exp,account});
 await page.route('https://office-fixture.supabase.co/**',route=>{
  if(route.request().url().includes('/auth/v1/user'))return route.fulfill({json:account});
  if(route.request().url().includes('/organization_members'))return route.fulfill({json:{role:'ceo'}});
  return route.fulfill({json:[]});
 });
 await page.routeWebSocket('wss://office-fixture.supabase.co/**',ws=>ws.close());
 const data={agents:[{id:agent,organization_id:org,name:'Nhân viên fixture',role:'developer',status:'waiting_approval',enabled:true,created_at:now,updated_at:now}],agent_configs:[],model_providers:[],projects:[{id:project,organization_id:org,name:'Dự án fixture',goal:'Kiểm tra giao diện',status:'active'}],tasks:[],task_dependencies:[],agent_runs:[],approvals:[{id:'approval-fixture',organization_id:org,kind:'tool',status:'pending',summary:'{"tool":"run_tests","input":{"artifact_ids":[]}}'}],model_usage:[],budgets:[],activity_logs:[],conversations:[],agent_messages:[],project_documents:[],task_artifacts:[],agent_events:[],stats:{projects:1,active_projects:1,active_agents:0,running_tasks:0,failed_tasks:0,pending_approvals:1,cost_micro_usd:0,input_tokens:0,output_tokens:0}};
 await page.route('**/api/office/**',route=>{
  const url=route.request().url();
  if(url.endsWith('/organizations'))return route.fulfill({json:[{id:org,name:'Công ty fixture',created_by:user,stopped:false}]});
  if(url.endsWith('/snapshot'))return route.fulfill({json:data});
  return route.fulfill({json:{accepted:true}});
 });
}
test('Office setup rejects server secrets in the browser',async({page})=>{
 await page.goto('/#office');await expect(page.getByRole('heading',{name:'Kết nối văn phòng AI'})).toBeVisible();
 await page.getByLabel('Supabase Project URL').fill('https://office-fixture.supabase.co');
 await page.getByLabel('Publishable / anon key').fill('sb_secret_never_put_on_frontend');
 await page.getByRole('button',{name:'Lưu kết nối',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Server secret');
});
test('dashboard, avatar details, approval and Vietnamese navigation',async({page},testInfo)=>{
 await fixture(page);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.stack||e.message));
 await page.goto('/#office');await expect(page.getByRole('heading',{name:'Điều hành ý tưởng. Tạo ra kết quả.'})).toBeVisible();
 await expect(page.getByText('Phê duyệt thực thi công cụ',{exact:true})).toBeVisible();
 if(testInfo.project.name==='mobile')await page.getByRole('button',{name:'Nhân viên AI',exact:true}).click();
 else {await expect(page.locator('canvas')).toBeVisible();await expect(page.getByRole('button',{name:'⚠ Nhân viên fixture Chờ CEO duyệt'})).toBeVisible();await page.screenshot({path:'artifacts/office/initial-office.png',fullPage:true});await page.getByRole('button',{name:'⚠ Nhân viên fixture Chờ CEO duyệt'}).click();}
 if(testInfo.project.name==='mobile')await page.getByRole('button',{name:/Nhân viên fixture.*Chưa cấu hình model/}).click();
 await expect(page.getByRole('complementary',{name:'Chi tiết nhân viên'})).toContainText('Lập trình viên');
 await page.getByRole('button',{name:'Đóng chi tiết'}).click();
 await page.getByRole('button',{name:'Tổng quan',exact:true}).click();
 const request=page.waitForRequest(req=>req.url().endsWith('/approvals/approval-fixture')&&req.method()==='POST');
 await page.getByRole('button',{name:'Phê duyệt',exact:true}).click();expect((await request).postDataJSON()).toEqual({approved:true});
 if(testInfo.project.name==='desktop') {
  await page.getByRole('button',{name:'Văn phòng 3D',exact:true}).click();
  await expect(page.getByRole('button',{name:'⚠ Nhân viên fixture Chờ CEO duyệt'})).toBeInViewport();
  await page.screenshot({path:'artifacts/office/desktop-office.png',fullPage:true});
  await page.getByRole('button',{name:'Tổng quan',exact:true}).click();
  await expect(page.getByRole('button',{name:'⚠ Nhân viên fixture Chờ CEO duyệt'})).toBeInViewport();
 }
 await page.screenshot({path:`artifacts/office/${testInfo.project.name}-dashboard.png`,fullPage:true});
 expect(errors).toEqual([]);
});
test('shows API failure without creating fake staff or progress',async({page})=>{
 await fixture(page);await page.route('**/api/office/organizations',route=>route.fulfill({status:503,json:{error:'Supabase chưa cấu hình'}}));
 await page.goto('/#office');await expect(page.getByRole('alert')).toContainText('Supabase chưa cấu hình');await expect(page.getByText('Nhân viên fixture',{exact:true})).toHaveCount(0);
});
test('3D camera, lighting and list fallback survive repeated transitions',async({page},testInfo)=>{
 await fixture(page);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/#office');
 await page.getByRole('button',{name:'Văn phòng 3D',exact:true}).click();
 if(testInfo.project.name==='mobile')await page.getByRole('button',{name:'Bật 3D',exact:true}).click();
 await expect(page.locator('canvas')).toBeVisible();await expect(page.getByRole('button',{name:'⚠ Nhân viên fixture Chờ CEO duyệt'})).toBeInViewport();
 await page.getByRole('button',{name:'Isometric',exact:true}).click();await expect(page.getByRole('button',{name:'Phối cảnh',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Ban đêm',exact:true}).click();await expect(page.getByRole('button',{name:'Ban ngày',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Danh sách',exact:true}).click();await expect(page.locator('canvas')).toHaveCount(0);
 await page.getByRole('button',{name:'Bật 3D',exact:true}).click();await expect(page.locator('canvas')).toBeVisible();
 await expect(page.getByRole('button',{name:'⚠ Nhân viên fixture Chờ CEO duyệt'})).toBeVisible();expect(errors).toEqual([]);
});
