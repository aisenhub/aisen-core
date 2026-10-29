import { Box, Button } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { adminRadii } from '../theme';

import { domainFor, domainViews, type DomainResourceName } from './domainNavigationModel';

export function DomainNavigation({resource}:{resource:DomainResourceName}){
  const group=domainFor[resource];
  if(!group)return resource==='membership-events'||resource==='memberships'?
    <Box sx={{mb:2}}><Button component={RouterLink} to="/users" size="small">
      返回用户中心
    </Button></Box>:null;
  const domain=domainViews[group];
  return <Box component="nav" aria-label={domain.title+'二级导航'}
    sx={{mb:1.4,borderBottom:'1px solid',borderColor:'divider',display:'flex',flexWrap:'wrap',
      gap:{xs:.5,md:1},pb:.8}}>
    {domain.views.map(([name,label])=><Button key={name} component={RouterLink}
      to={'/'+name} aria-current={resource===name?'page':undefined}
      size="small" variant={resource===name?'contained':'text'}
      sx={{borderRadius:adminRadii.pill,minHeight:40,px:{xs:1.4,sm:2},whiteSpace:'nowrap',
        bgcolor:resource===name?'primary.main':undefined,
        color:resource===name?'primary.contrastText':'text.secondary',
        '&:hover':{bgcolor:resource===name?'primary.dark':'action.hover'}}}>
      {label}
    </Button>)}
  </Box>;
}
