import type { I18nProvider } from 'react-admin';

// User-facing framework UI. All application labels remain in Chinese.
const messages: Record<string, string> = {
  'ra.action.add_filter': '添加筛选', 'ra.action.add': '添加', 'ra.action.back': '返回',
  'ra.action.bulk_actions': '批量操作', 'ra.action.cancel': '取消',
  'ra.action.clear_array_input': '清空', 'ra.action.clear_input_value': '清除',
  'ra.action.clone': '复制', 'ra.action.close': '关闭',
  'ra.action.confirm': '确认', 'ra.action.create': '新建',
  'ra.action.create_item': '新建 %{item}', 'ra.action.delete': '删除',
  'ra.action.edit': '编辑', 'ra.action.export': '导出',
  'ra.action.list': '返回列表', 'ra.action.refresh': '刷新',
  'ra.action.remove_filter': '移除筛选', 'ra.action.remove': '移除',
  'ra.action.save': '保存', 'ra.action.search': '搜索',
  'ra.action.show': '查看', 'ra.action.sort': '排序',
  'ra.action.undo': '撤销', 'ra.action.unselect': '取消选择',
  'ra.action.update': '更新', 'ra.action.open': '打开',
  'ra.boolean.true': '是', 'ra.boolean.false': '否',
  'ra.page.create': '新建 %{name}', 'ra.page.dashboard': '管理概览',
  'ra.page.edit': '编辑 %{name}', 'ra.page.list': '%{name}',
  'ra.page.show': '%{name} 详情', 'ra.page.empty': '暂无 %{name}',
  'ra.page.invite': '尚无内容', 'ra.page.not_found': '页面不存在',
  'ra.page.error': '页面遇到了问题', 'ra.page.loading': '正在载入…',
  'ra.message.about': '关于', 'ra.message.are_you_sure': '确定继续吗？',
  'ra.message.bulk_delete_content': '确定删除选中记录？',
  'ra.message.delete_content': '确定删除这条记录？',
  'ra.message.error': '操作失败，请重试',
  'ra.message.invalid_form': '请检查表单中的错误',
  'ra.message.loading': '正在载入…',
  'ra.message.no': '否', 'ra.message.not_found': '未找到记录',
  'ra.message.yes': '是',
  'ra.navigation.no_results': '没有符合条件的记录',
  'ra.navigation.no_more_results': '已经到底了',
  'ra.navigation.page_out_of_boundaries': '当前页超出范围',
  'ra.navigation.page_out_from_end': '最后一页',
  'ra.navigation.page_out_from_begin': '第一页',
  'ra.navigation.page_range_info': '%{offsetBegin}–%{offsetEnd} / %{total}',
  'ra.navigation.partial_page_range_info': '%{offsetBegin}–%{offsetEnd} / 多条',
  'ra.navigation.current_page': '第 %{page} 页',
  'ra.navigation.page_rows_per_page': '每页显示',
  'ra.navigation.next': '下一页', 'ra.navigation.prev': '上一页',
  'ra.navigation.first': '第一页', 'ra.navigation.last': '最后一页',
  'ra.navigation.skip_nav': '跳转至主内容',
  'ra.sort.sort_by': '排序：%{field} %{order}',
  'ra.sort.ASC': '升序', 'ra.sort.DESC': '降序',
  'ra.input.file.upload_several': '拖入文件或点击上传',
  'ra.input.file.upload_single': '拖入文件或点击上传',
  'ra.input.image.upload_several': '拖入图片或点击上传',
  'ra.input.image.upload_single': '拖入图片或点击上传',
  'ra.auth.auth_check_error': '请先登录并完成双因素认证',
  'ra.auth.user_menu': '账号菜单', 'ra.auth.username': '邮箱',
  'ra.auth.password': '密码', 'ra.auth.sign_in': '登录',
  'ra.auth.sign_in_error': '登录失败，请检查凭据',
  'ra.auth.logout': '退出登录', 'ra.auth.email': '邮箱',
  'ra.auth.welcome': '欢迎使用 AisenCore',
  'ra.notification.created': '创建成功',
  'ra.notification.updated': '修改成功',
  'ra.notification.deleted': '删除成功',
  'ra.notification.bad_item': '记录有误',
  'ra.notification.item_doesnt_exist': '记录不存在',
  'ra.notification.http_error': '请求失败',
  'ra.notification.data_provider_error': '数据暂不可用',
  'ra.validation.required': '此项为必填',
  'ra.validation.minLength': '字符数不能少于 %{min}',
  'ra.validation.maxLength': '字符数不能超过 %{max}',
  'ra.validation.minValue': '不能小于 %{min}',
  'ra.validation.maxValue': '不能大于 %{max}',
  'ra.validation.number': '请输入数字',
  'ra.validation.email': '请输入有效的邮箱地址',
  'ra.validation.oneOf': '请填写有效选项',
  'ra.validation.regex': '格式不符合要求',
  'ra.saved_queries.label': '已保存的筛选',
};

const resourceNames:Record<string,string> = {
  products:'产品',memberships:'成员关系',grants:'授权记录','code-batches':'发行批次',
  codes:'兑换码记录',redemptions:'核销记录',admins:'管理员权限',
  'audit-logs':'管理审计','membership-events':'成员事件',users:'查找账号',
};
for(const [key,label] of Object.entries(resourceNames)){
  messages['resources.'+key+'.name']=label;
  messages['resources.'+key+'.page.list']=label;
  messages['resources.'+key+'.page.show']=label+'详情';
  messages['resources.'+key+'.page.create']='新建'+label;
  messages['resources.'+key+'.empty']='暂无'+label+'记录';
  messages['resources.'+key+'.invite']='可使用当前页面创建或查看相关记录';
}

export const chineseI18nProvider: I18nProvider = {
  translate: (key, options) => {
    const template=messages[key] ?? key;
    return template.replace(/%\{([^}]+)\}/g, (_,name:string) =>
      String((options as Record<string, unknown>|undefined)?.[name] ?? ''));
  },
  changeLocale: async () => {},
  getLocale: () => 'zh-CN',
};
