import { Alert, Box, Button, Card, CardContent, Container, CssBaseline, Stack, Typography } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { theme } from './theme';

export function SetupScreen({ problem }: { problem: string }) {
  return <ThemeProvider theme={theme}>
    <CssBaseline />
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', bgcolor: 'background.default', py: 6 }}>
      <Container maxWidth="sm">
        <Card variant="outlined"><CardContent sx={{ p: { xs: 3, sm: 5 } }}>
          <Stack spacing={2.5}>
            <Typography component="h1" variant="h5">AisenCore 管理平台</Typography>
            <Alert severity="warning" role="alert">开发环境尚未就绪：{problem}</Alert>
            <Typography color="text.secondary">前端已启动，但还不能连接 Supabase。请在仓库根目录完成以下配置：</Typography>
            <Typography component="div" variant="body2">
              1. 将 <Box component="code">apps/admin/.env.example</Box> 复制为 <Box component="code">apps/admin/.env.local</Box>。
            </Typography>
            <Box component="pre" sx={{ m: 0, p: 2, borderRadius: 1, bgcolor: 'background.default', overflowX: 'auto', fontSize: 12 }}>
              {'VITE_SUPABASE_URL=http://127.0.0.1:55321\nVITE_SUPABASE_PUBLISHABLE_KEY=你自己的本地PublishableKey'}
            </Box>
            <Typography variant="body2">2. 使用 <Box component="code">pnpm dlx supabase status</Box> 查看本地 Publishable Key；如未运行，请按项目 D2 指南启动对应本地 Supabase 服务。</Typography>
            <Typography variant="body2">3. 修改完环境变量后，停止并重新运行 <Box component="code">pnpm run dev</Box>，再刷新页面。</Typography>
            <Alert severity="info">浏览器中只能使用 Publishable/anon 公钥，绝不能填写 Secret、service_role、数据库密码或 R2 密钥。</Alert>
            <Button variant="outlined" href="/login">重新载入登录入口</Button>
          </Stack>
        </CardContent></Card>
      </Container>
    </Box>
  </ThemeProvider>;
}
