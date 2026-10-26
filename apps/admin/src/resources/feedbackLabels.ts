// Single display vocabulary for both queue and detail; database/RPC values remain unchanged.
export const priorityLabels:Record<string,string>={low:'低',normal:'普通',high:'高',urgent:'紧急'};
export const statusLabels:Record<string,string>={new:'新反馈',in_progress:'处理中',
  waiting_user:'待用户补充',resolved:'已解决',closed:'已关闭'};
// UI guidance only. The protected Admin RPC remains authoritative on every write.
export const allowedStatusTransitions:Record<string,readonly string[]>={
  new:['in_progress'],
  in_progress:['waiting_user','resolved'],
  waiting_user:['in_progress','resolved'],
  resolved:['closed','in_progress'],
  closed:['in_progress'],
};
export const categoryLabels:Record<string,string>={bug:'问题反馈',account:'账号问题',
  experience:'体验问题',suggestion:'功能建议',other:'其他'};
