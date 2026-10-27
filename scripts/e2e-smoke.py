import sys
from playwright.sync_api import sync_playwright
BASE=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:3100'
OUT='/tmp/claude-0/-home-claude/761864bc-a2dc-59ed-8bac-d1d6c9e1fbfc/scratchpad/'
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium')
    pg=b.new_page(viewport={'width':1280,'height':800}); errs=[]
    pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)))
    pg.on('console',lambda m: errs.append('CONSOLE '+m.text) if m.type=='error' else None)
    pg.goto(BASE); pg.wait_for_timeout(1500)
    pg.screenshot(path=OUT+'real_1_setup.png')
    pg.fill('#setup-name','Sensei'); pg.fill('#setup-email','sensei@x5group.uz'); pg.fill('#setup-pass','parol12345'); pg.fill('#setup-pass2','parol12345')
    pg.click('[data-act=setup-admin]'); pg.wait_for_timeout(2000)
    pg.screenshot(path=OUT+'real_2_after_setup.png')
    print('pages', pg.evaluate("[...document.querySelectorAll('.lx-page')].filter(x=>!x.hidden).map(x=>x.id)"))
    print('errs', errs)
    b.close()
