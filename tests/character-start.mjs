// Older world/UI regressions must pass through the actual new-player flow.
// Baseline versions without character creation continue unchanged.
export async function completeCharacterCreation(page){
 const chooser=page.locator('#character-chooser');
 if(!await chooser.count()||!await chooser.evaluate(e=>e.open))return;
 await page.waitForFunction(()=>!!document.querySelector('#character-chooser iframe')?.contentWindow?.CharacterStudio,{timeout:120000});
 const studio=page.frameLocator('#character-chooser iframe');
 await studio.getByRole('button',{name:'적용하기',exact:true}).click({timeout:120000});
 await page.waitForFunction(()=>!window.__dev.avatars.isOpen,{timeout:120000});
}
