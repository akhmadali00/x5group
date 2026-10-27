import sys
from playwright.sync_api import sync_playwright
BASE=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:3100'
OUT='/tmp/claude-0/-home-claude/761864bc-a2dc-59ed-8bac-d1d6c9e1fbfc/scratchpad/'
def vis(pg):
    return pg.evaluate("[...document.querySelectorAll('.lx-page')].filter(x=>!x.hidden).map(x=>x.id)")
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium')
    pg=b.new_page(viewport={'width':1280,'height':900}); errs=[]
    pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)))
    pg.on('console',lambda m: errs.append('CONSOLE '+m.text) if m.type=='error' else None)
    pg.goto(BASE); pg.wait_for_timeout(1500)
    pg.fill('#setup-name','Sensei'); pg.fill('#setup-email','sensei@x5group.uz'); pg.fill('#setup-pass','parol12345'); pg.fill('#setup-pass2','parol12345')
    pg.click('[data-act=setup-admin]'); pg.wait_for_timeout(2000)
    print('after setup', vis(pg))
    def tab(name):
        pg.click(f'[data-page={name}]'); pg.wait_for_timeout(500)
    # team member
    tab('jamoa')
    pg.click('.lx-page:not([hidden]) [data-act=toggle-member]'); pg.wait_for_timeout(400)
    sh=pg.locator('.lx-overlay .lx-sheet')
    pg.screenshot(path=OUT+'e2e_member_sheet.png')
    inputs=sh.locator('input[type=text],input[type=email],input[type=password],input[type=tel]')
    print('member inputs', inputs.count())
    sh.locator('input[type=text]').nth(0).fill('Ali')
    sh.locator('input[type=email]').fill('ali@x5.uz')
    sh.locator('input[type=password]').first.fill('parol12345')
    sh.locator('select').nth(0).select_option('Kontent Maker') if False else None
    pg.click('.lx-overlay [data-act=save]'); pg.wait_for_timeout(1500)
    print('overlay open after member save?', pg.locator('.lx-overlay').count(), 'hint', pg.locator('.lx-overlay .lx-hint').all_inner_texts())
    pg.screenshot(path=OUT+'e2e_after_member.png')
    # freelance
    pg.click('.lx-page:not([hidden]) [data-act=toggle-member]'); pg.wait_for_timeout(400)
    sh=pg.locator('.lx-overlay .lx-sheet')
    sh.locator('.lx-typeseg button').nth(1).click()
    sh.locator('input[type=text]').nth(0).fill('Vali')
    sh.locator('select').first.select_option('Montajor') if False else None
    # kasb select is visible one
    for i in range(sh.locator('select').count()):
        s=sh.locator('select').nth(i)
        if s.is_visible():
            opts=s.locator('option').all_inner_texts()
            if 'Montajor' in opts: s.select_option('Montajor')
    pg.click('.lx-overlay [data-act=save]'); pg.wait_for_timeout(1500)
    print('overlay after freelance', pg.locator('.lx-overlay').count(), pg.locator('.lx-overlay .lx-hint').all_inner_texts())
    # videograph freelancer
    pg.click('.lx-page:not([hidden]) [data-act=toggle-member]'); pg.wait_for_timeout(400)
    sh=pg.locator('.lx-overlay .lx-sheet')
    sh.locator('.lx-typeseg button').nth(1).click()
    sh.locator('input[type=text]').nth(0).fill('Dilshod')
    for i in range(sh.locator('select').count()):
        s_=sh.locator('select').nth(i)
        if s_.is_visible() and 'Videograph' in s_.locator('option').all_inner_texts(): s_.select_option('Videograph')
    pg.click('.lx-overlay [data-act=save]'); pg.wait_for_timeout(1500)
    print('videograph saved', pg.locator('.lx-overlay').count())
    # project
    tab('loyihalar')
    pg.click('.lx-page:not([hidden]) [data-act=toggle-project]'); pg.wait_for_timeout(400)
    sh=pg.locator('.lx-overlay .lx-sheet')
    sh.locator('[data-f=name]').fill('Test Loyiha')
    sh.locator('[data-f=pms] input').first.check()
    sh.locator('[data-f=contractStart]').fill('2026-10-01'); sh.locator('[data-f=contractMonths]').fill('3')
    sh.locator('[data-f=igLink]').fill('instagram.com/test'); sh.locator('[data-f=igStart]').fill('1200')
    sh.locator('[data-f=tgLink]').fill('t.me/test'); sh.locator('[data-f=tgStart]').fill('300')
    sh.locator('[data-f=planTotal]').fill('12')
    pg.click('.lx-overlay [data-act=save-project]'); pg.wait_for_timeout(1500)
    print('overlay after project', pg.locator('.lx-overlay').count(), pg.locator('.lx-overlay .lx-hint').all_inner_texts())
    pg.screenshot(path=OUT+'e2e_after_project.png')
    # task
    tab('vazifalar')
    pg.click('.lx-page:not([hidden]) [data-act=toggle-task]'); pg.wait_for_timeout(400)
    sh=pg.locator('.lx-overlay .lx-sheet')
    sh.locator('[data-f=assignee]').select_option(index=1) if sh.locator('[data-f=assignee] option').count()>1 else None
    print('assignee options', sh.locator('[data-f=assignee] option').all_inner_texts())
    sh.locator('[data-f=title]').fill('Reja tuz'); sh.locator('[data-f=durationDays]').fill('2')
    pg.click('.lx-overlay [data-act=save-newtask]'); pg.wait_for_timeout(1500)
    print('overlay after task', pg.locator('.lx-overlay').count(), pg.locator('.lx-overlay .lx-hint').all_inner_texts(), 'rows', pg.locator('.lx-taskrows > *').count())
    pg.screenshot(path=OUT+'e2e_after_task.png')
    # shoot with operator now
    tab('syomkalar')
    pg.click('.lx-page:not([hidden]) [data-act=toggle-shoot]'); pg.wait_for_timeout(400)
    sh=pg.locator('.lx-overlay .lx-sheet')
    sh.locator('[data-f=project]').select_option(index=0)
    sh.locator('[data-f=place]').fill('Studio'); sh.locator('[data-f=date]').fill('2026-11-05'); sh.locator('[data-f=time]').fill('10:00')
    sh.locator('[data-f=operator]').select_option(index=0)
    pg.click('.lx-overlay [data-act=save-shoot]'); pg.wait_for_timeout(1500)
    print('shoot saved overlay', pg.locator('.lx-overlay').count(), pg.locator('.lx-overlay .lx-hint').all_inner_texts(), 'rows', pg.locator('.lx-shootrows > *').count())
    pg.screenshot(path=OUT+'e2e_after_shoot.png')
    # content on project page
    tab('loyihalar')
    pg.click('.lx-page:not([hidden]) [data-project="Test Loyiha"]'); pg.wait_for_timeout(800)
    print('pages', vis(pg))
    pg.screenshot(path=OUT+'e2e_project_page.png')
    pg.click('.lx-page:not([hidden]) [data-act=toggle-content]'); pg.wait_for_timeout(400)
    sh=pg.locator('.lx-overlay .lx-sheet')
    sh.locator('input[type=text]').first.fill('Kontent 1')
    pg.click('.lx-overlay [data-act=save]'); pg.wait_for_timeout(1500)
    print('content saved overlay', pg.locator('.lx-overlay').count(), pg.locator('.lx-overlay .lx-hint').all_inner_texts(), 'crows', pg.locator('.lx-crow').count())
    pg.screenshot(path=OUT+'e2e_after_content.png')
    # open content, approve, set posting fields
    pg.click('.lx-crow'); pg.wait_for_timeout(500)
    sh=pg.locator('.lx-overlay .lx-sheet')
    sels=sh.locator('select')
    for i in range(sels.count()):
        if 'Tasdiqlandi' in sels.nth(i).locator('option').all_inner_texts(): sels.nth(i).select_option('Tasdiqlandi')
    sh.locator('.lx-check-row input[data-val=instagram]').check()
    sh.locator('input[type=date]').fill('2026-11-06'); sh.locator('input[type=time]').fill('12:00')
    pg.click('.lx-overlay [data-act=save]'); pg.wait_for_timeout(1500)
    print('content approved overlay', pg.locator('.lx-overlay').count(), pg.locator('.lx-overlay .lx-hint').all_inner_texts())
    pg.screenshot(path=OUT+'e2e_content_approved.png')
    # flag toggle
    fl=pg.locator('.lx-crow [data-flag=rekda]').first
    fl.click(); pg.wait_for_timeout(1200)
    print('rekda on', pg.locator('.lx-crow [data-flag=rekda].on').count())
    # task: open, change status
    tab('vazifalar')
    pg.click('.lx-page:not([hidden]) [data-task]'); pg.wait_for_timeout(400)
    sh=pg.locator('.lx-overlay .lx-sheet')
    for i in range(sh.locator('select').count()):
        if 'Jarayonda' in sh.locator('select').nth(i).locator('option').all_inner_texts(): sh.locator('select').nth(i).select_option('Jarayonda')
    sh.locator('textarea').fill('Boshladim')
    pg.click('.lx-overlay [data-act=save]'); pg.wait_for_timeout(1500)
    print('task saved overlay', pg.locator('.lx-overlay').count(), pg.locator('.lx-overlay .lx-hint').all_inner_texts())
    pg.screenshot(path=OUT+'e2e_task_status.png')
    # reload page: data persists
    pg.reload(); pg.wait_for_timeout(2000)
    print('after reload', vis(pg))
    print('errs', errs)
    b.close()
