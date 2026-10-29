#!/usr/bin/env node
// Admin's viewport shell and table scrolling source contract against installed
// React-admin 5. Browser CDP acceptance separately checks actual scrollTop/rects.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=file=>readFileSync(path.join(root,file),'utf8');
const app=source('apps/admin/src/App.tsx');
const theme=source('apps/admin/src/theme.ts');
const lists=source('apps/admin/src/resources/WorkspaceLists.tsx');
const fromAdmin=createRequire(path.join(root,'apps/admin/package.json'));
const fromRa=createRequire(fromAdmin.resolve('react-admin'));
const uiEntry=fromRa.resolve('ra-ui-materialui');
const sidebar=readFileSync(path.join(path.dirname(uiEntry),'layout','Sidebar.js'),'utf8');
const datagrid=readFileSync(path.join(path.dirname(uiEntry),'list','datagrid','Datagrid.js'),'utf8');
for(const token of ['docked','fixed','paper'])
  assert.match(sidebar,new RegExp(token+': \\x60\\$\\{PREFIX\\}-'+token+'\\x60'));
assert.match(datagrid,/DatagridClasses\.tableWrapper/,'real RA datagrid scroll wrapper');
assert.match(app,/<Layout \{\.\.\.props\} appBar=\{AdminAppBar\} menu=\{AdminMenu\} appBarAlwaysOn/);
assert.match(app,/height:'100dvh',maxHeight:'100dvh',minHeight:'0 !important'/);
assert.match(app,/'& \.RaLayout-appFrame':\{/);
assert.match(app,/height:'calc\(100dvh - 64px\)'/);
assert.match(app,/'& \.RaLayout-contentWithSidebar':\{/);
assert.match(app,/minHeight:0,overflow:'hidden'/);
assert.match(app,/'& \.RaLayout-content':\{/);
assert.match(app,/overflowX:'hidden',overflowY:'auto',overscrollBehaviorY:'contain'/);
assert.match(app,/&:has\(\.aisen-admin-list-page\)':\{overflowY:'hidden'\}/);
assert.match(app,/'& \.aisen-admin-list-page \.list-page':\{/);
assert.match(app,/flex:'1 1 auto',minHeight:0,maxHeight:'100%'/);
assert.match(app,/'& \.aisen-admin-list-page \.RaDatagrid-tableWrapper':\{/);
assert.match(source('apps/admin/src/resources/FeedbackV2.tsx'),/className="aisen-admin-list-page"/);
assert.match(source('apps/admin/src/resources/WorkspaceLists.tsx'),/className="aisen-admin-list-page"/);
assert.match(source('apps/admin/src/resources/lists.tsx'),/className="aisen-admin-list-page"/);
assert.match(app,/'& \.RaSidebar-docked':\{\s*position:'relative !important'/);
assert.match(app,/'& \.RaSidebar-fixed':\{\s*position:'relative !important'/);
assert.match(app,/'& \.RaSidebar-paper':\{/);
assert.match(app,/overflowY:'auto',overflowX:'hidden',overscrollBehaviorY:'contain'/);
assert.match(theme,/'body:has\(\.RaLayout-appFrame\)': \{ overflow: 'hidden' \}/);
assert.match(theme,/'\.RaDatagrid-tableWrapper': \{/);
assert.match(theme,/maxHeight:'clamp\(240px, calc\(100dvh - 355px\), 760px\)'/);
assert.match(theme,/'\.RaDatagrid-tableWrapper \.MuiTableCell-head': \{/);
assert.match(theme,/position:'sticky',top:0,zIndex:2/);
assert.match(lists,/<Table stickyHeader sx=\{\{minWidth:700\}\}>/);
assert.match(lists,/overflowX:'auto',overflowY:'auto',overscrollBehavior:'contain'/);
assert.doesNotMatch(app,/['"]& \.RaSidebar-root['"]:\{/);
console.log('ADMIN_VIEWPORT_AND_TABLE_SCROLL_CONTRACT PASS (browser CDP signoff separately)');
