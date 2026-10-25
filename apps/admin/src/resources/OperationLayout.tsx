import { Box, Typography } from '@mui/material';
export function OperationLayout({title,children,embedded=false}:{title:string;children:React.ReactNode;embedded?:boolean}) {
  if(embedded)return <>{children}</>;
  return <Box sx={{px:{xs:2,md:3,lg:4},py:{xs:2.5,lg:3},pb:8,
    maxWidth:1120,width:'100%',minWidth:0,mx:'auto'}}>
    <Typography component="h1" sx={{fontSize:{xs:23,md:27},fontWeight:750,lineHeight:1.3,mb:2.2}}>{title}</Typography>
    <Box sx={{maxWidth:920,minWidth:0,
      '& .MuiCardContent-root':{p:{xs:2,md:3}},
      '& .MuiCardContent-root:last-child':{pb:{xs:2,md:3}}}}>{children}</Box>
  </Box>;
}
