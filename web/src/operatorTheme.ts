import {defaultLightTheme,defaultDarkTheme,type RaThemeOptions} from 'react-admin';

function routeTheme(mode:'light'|'dark'):RaThemeOptions{
 const dark=mode==='dark',base=dark?defaultDarkTheme:defaultLightTheme;
 const ink=dark?'#f3f4f0':'#252b30',paper=dark?'#252b30':'#ffffff';
 return {
  ...base,
  palette:{...base.palette,mode,
   primary:{main:dark?'#f1a582':'#b94116',contrastText:dark?'#252b30':'#ffffff'},
   secondary:{main:dark?'#f1a582':'#b94116'},
   background:{default:dark?'#1d2328':'#f3f4f0',paper},
   text:{primary:ink,secondary:dark?'#b7beb8':'#61665f'},
   divider:dark?'#4a5358':'#d9ddd8',
  },
  shape:{borderRadius:6},
  typography:{fontFamily:'system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',fontSize:14,
   h6:{fontWeight:650,fontSize:'1rem'},button:{textTransform:'none',fontWeight:600}},
  sidebar:{width:240,closedWidth:56},
  components:{...base.components,
   MuiPaper:{styleOverrides:{root:{backgroundImage:'none'},rounded:{borderRadius:14}}},
   MuiButton:{styleOverrides:{root:{minHeight:44,boxShadow:'none'}}},
   MuiIconButton:{styleOverrides:{root:{minWidth:44,minHeight:44}}},
   MuiAppBar:{styleOverrides:{root:{background:paper,color:ink,boxShadow:'none',borderBottom:`1px solid ${dark?'#4a5358':'#d9ddd8'}`}}},
   RaSidebar:{styleOverrides:{root:{background:'#252b30','& .RaSidebar-fixed':{background:'#252b30'},'& .MuiDrawer-paper':{background:'#252b30',borderRadius:0}}}},
   RaMenu:{styleOverrides:{root:{padding:'16px 8px',marginTop:0}}},
   RaMenuItemLink:{styleOverrides:{root:{minHeight:46,margin:'2px 0',padding:'10px 14px',borderRadius:6,color:'#d8ddd8','& .MuiListItemIcon-root':{color:'inherit',minWidth:36},'&.RaMenuItemLink-active':{background:'#f3f4f0',color:'#252b30'},'&:hover':{background:'#41484c',color:'#ffffff'},'&:focus-visible':{outline:'2px solid #f1a582',outlineOffset:-2}}}},
   RaList:{styleOverrides:{root:{'& .RaList-content':{boxShadow:'none',background:'transparent'}}}},
  },
 };
}

export const operatorLightTheme=routeTheme('light');
export const operatorDarkTheme=routeTheme('dark');
