type Guard={index:number;confirmLeave:()=>boolean};
let active:Guard|undefined;
let restoreIndex:number|undefined;

// Import this module before BrowserRouter registers its popstate listener.
window.addEventListener('popstate',event=>{
 const nextIndex=event.state?.idx;
 if(restoreIndex!==undefined&&nextIndex===restoreIndex){restoreIndex=undefined;event.stopImmediatePropagation();return;}
 if(!active||!Number.isInteger(nextIndex)||nextIndex===active.index)return;
 if(!active.confirmLeave()){
  event.stopImmediatePropagation();restoreIndex=active.index;history.go(active.index-nextIndex);
 }
});

export function protectUnsavedNavigation(confirmLeave:()=>boolean){
 // shortcut: relies on BrowserRouter's entry indexes; recheck when changing the router.
 const current:Guard={index:history.state?.idx,confirmLeave};
 if(Number.isInteger(current.index))active=current;
 return()=>{if(active===current)active=undefined;};
}
