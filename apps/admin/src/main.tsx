import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { getConfigurationProblem } from './configuration';
import { SetupScreen } from './SetupScreen';

const root = createRoot(document.getElementById('root')!);
const problem = getConfigurationProblem();

// Don't import the Supabase client (via App) until public settings are valid.
// Previously, a top-level throw in supabaseClient.ts prevented React mounting.
if (problem) {
  root.render(<StrictMode><SetupScreen problem={problem} /></StrictMode>);
} else {
  void import('./App').then(({ default: App }) => {
    root.render(<StrictMode><App /></StrictMode>);
  }).catch(() => {
    root.render(<StrictMode><SetupScreen problem="页面模块加载失败，请检查开发服务器终端与浏览器控制台。" /></StrictMode>);
  });
}
