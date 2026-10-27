import sys
from playwright.sync_api import sync_playwright
BASE='http://localhost:3100'
OUT='/tmp/claude-0/-home-claude/761864bc-a2dc-59ed-8bac-d1d6c9e1fbfc/scratchpad/'
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium')
    ctx=b.new_context(viewport={'width':1280,'height':900}, accept_downloads=True)
    pg=ctx.new_page(); errs=[]
    pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)))
    pg.on('console',lambda m: errs.append('CONSOLE '+m.text) if m.type=='error' else None)
    pg.goto(BASE); pg.wait_for_timeout(1500)
    pg.fill('#login-email','s@x5.uz'); pg.fill('#login-pass','parol12345')
    pg.keyboard.press('Enter'); pg.wait_for_timeout(2000)
    pg.click('[data-page=loyihalar]'); pg.wait_for_timeout(500)
    pg.click('.lx-page:not([hidden]) [data-project="Loyiha B"]'); pg.wait_for_timeout(800)
    # Export
    pg.click('.lx-fexport:has-text("Export")'); pg.wait_for_timeout(300)
    pg.screenshot(path=OUT+'tr_export.png')
    with pg.expect_download() as dl:
        pg.click('.lx-overlay button:has-text("Yuklab olish")')
    d=dl.value; print('download', d.suggested_filename)
    d.save_as(OUT+'dl_'+d.suggested_filename)
    pg.wait_for_timeout(500)
    print('overlay after export', pg.locator('.lx-overlay').count())
    # Import
    pg.click('.lx-fexport:has-text("Import")'); pg.wait_for_timeout(300)
    open(OUT+'imp.csv','w').write('Kontent nomi,Tayyorladi,Bosqich\nUI import 1,Ali,G\'oya\n,,\nUI import 2,,Xato bosqich\n')
    pg.set_input_files('.lx-overlay input[type=file]', OUT+'imp.csv')
    pg.click('.lx-overlay button:has-text("Yuklash")'); pg.wait_for_timeout(1500)
    pg.screenshot(path=OUT+'tr_import.png')
    print('hint', pg.locator('.lx-overlay .lx-hint').all_inner_texts())
    print('rows now', pg.locator('.lx-crow').count())
    print(errs)
    b.close()
