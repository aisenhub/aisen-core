import type { ReactNode } from 'react';
import { useListContext } from 'react-admin';
import { Box, CircularProgress, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography, useMediaQuery } from '@mui/material';

// React-admin's default DatagridLoading leaves the data area empty for the
// first second, then renders anonymous placeholder columns. Keep known headings
// visible while waiting; the real Datagrid still owns all data interactions.
export type PendingColumn = { label: string; hideBelow?: 'mobile' | 'wide' };

export function PendingDatagrid({ columns, children, selection = false, minWidth }: {
  columns: PendingColumn[];
  children: ReactNode;
  selection?: boolean;
  minWidth?: number;
}) {
  const { isPending } = useListContext();
  const mobile=useMediaQuery('(max-width:599px)');
  if (!isPending) return <>{children}</>;
  // On a narrow viewport, a horizontally scrollable desktop table is not a
  // useful pending placeholder. Show only the table body's local status.
  if (mobile) return <Box role="status" aria-live="polite"
    sx={{minHeight:200,display:'flex',alignItems:'center',justifyContent:'center',gap:1.5}}>
    <CircularProgress size={22} aria-hidden/>
    <Typography color="text.secondary" variant="body2">正在读取记录…</Typography>
  </Box>;
  return <TableContainer aria-busy="true" sx={{width:'100%',maxWidth:'100%',overflowX:'auto'}}>
    <Table size="small" sx={{minWidth}}>
      <TableHead><TableRow>
        {selection&&<TableCell padding="checkbox" aria-label="选择列"/>}
        {columns.map(({label,hideBelow})=><TableCell key={label}
          sx={hideBelow==='mobile'?{'@media (max-width:700px)':{display:'none'}}:
            hideBelow==='wide'?{'@media (max-width:1100px)':{display:'none'}}:{}}>
          {label}
        </TableCell>)}
      </TableRow></TableHead>
      <TableBody><TableRow><TableCell colSpan={columns.length+(selection?1:0)} sx={{p:0,borderBottom:0}}>
        <Box role="status" aria-live="polite"
          sx={{minHeight:200,display:'flex',alignItems:'center',justifyContent:'center',gap:1.5}}>
          <CircularProgress size={22} aria-hidden/>
          <Typography color="text.secondary" variant="body2">正在读取记录…</Typography>
        </Box>
      </TableCell></TableRow></TableBody>
    </Table>
  </TableContainer>;
}
