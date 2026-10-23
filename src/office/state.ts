import { create } from 'zustand';
export type OfficeView='overview'|'office'|'agents'|'projects'|'tasks'|'meetings'|'chat'|'documents'|'reports'|'finance'|'settings';
export const useOfficeUI=create<{view:OfficeView;selectedAgent:string|null;viewTo:(view:OfficeView)=>void;selectAgent:(id:string|null)=>void}>((set)=>({view:'overview',selectedAgent:null,viewTo:view=>set({view}),selectAgent:id=>set({selectedAgent:id})}));
export type AvatarState='idle'|'typing'|'reading'|'thinking'|'testing'|'waiting'|'error'|'completed'|'paused';
export function avatarState(status:string,role:string):AvatarState {
 if(status==='waiting_approval')return 'waiting';if(status==='error')return 'error';if(status==='completed')return 'completed';if(status==='paused')return 'paused';
 if(status==='working')return role==='tester'?'testing':role==='developer'?'typing':role==='ba'?'reading':'thinking';
 return 'idle';
}
export const roles:Record<string,string>={pm:'Quản lý dự án',ba:'Phân tích nghiệp vụ',developer:'Lập trình viên',tester:'Kiểm thử viên',accountant:'Kế toán',designer:'Thiết kế UI/UX',devops:'DevOps',security:'Bảo mật',dba:'Quản trị dữ liệu',researcher:'Nghiên cứu',marketing:'Marketing',analyst:'Phân tích dữ liệu',custom:'Chuyên viên'};
export const statuses:Record<string,string>={idle:'Sẵn sàng',working:'Đang làm việc',waiting_approval:'Chờ CEO duyệt',paused:'Tạm dừng',error:'Có lỗi',completed:'Hoàn thành',queued:'Đang xếp hàng',running:'Đang xử lý',succeeded:'Thành công',failed:'Thất bại',cancelled:'Đã hủy',todo:'Chưa bắt đầu',done:'Hoàn thành',blocked:'Bị chặn',pending:'Chờ phê duyệt',approved:'Đã duyệt',rejected:'Từ chối',active:'Đang hoạt động',draft:'Bản nháp'};
export function usd(micro:number){return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:6}).format(micro/1000000);}
export function usdInput(value:string):number {
 if(!/^\d{1,8}(\.\d{1,6})?$/.test(value))throw new Error('Nhập số USD dương, tối đa 6 chữ số thập phân.');
 const [whole,fraction='']=value.split('.');return Number(BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,'0')));
}
