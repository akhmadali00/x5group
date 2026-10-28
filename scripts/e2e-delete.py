import sys, json, urllib.request
from playwright.sync_api import sync_playwright
BASE=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:3100'
OUT='/tmp/claude-0/-home-claude/761864bc-a2dc-59ed-8bac-d1d6c9e1fbfc/scratchpad/'
jar=''
def api(m,path,body=None):
    global jar
    req=urllib.request.Request(BASE+path,method=m,data=json.dumps(body).encode() if body is not None else None,headers={'content-type':'application/json','x-x5':'1','origin':BASE,'cookie':jar})
    r=urllib.request.urlopen(req)
    sc=r.headers.get_all('set-cookie')
    if sc: jar='; '.join(c.split(';')[0] for c in sc)
    return json.loads(r.read())
api('POST','/api/auth/setup',{'name':'Sensei','email':'sensei@x5group.uz','password':'parol12345'})
api('POST','/api/members',{'kind':'account','name':'Ali','email':'ali@x5.uz','password':'parol12345','position':'Kontent Maker','role':'member','permissions':['bosh'],'projects':[]})
api('POST','/api/members',{'kind':'freelance','name':'Vali','position':'Montajor'})
api('POST','/api/projects',{'name':'Loyiha A','pms':['Sensei'],'contractMonths':3,'contractStart':'2026-10-01','planTotal':12})
fails=[]
def ok(n,c):
    print('OK  ' if c else 'FAIL',n)
    if not c: fails.append(n)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium')
    pg=b.new_page(viewport={'width':1280,'height':1000}); errs=[]
    pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)))
    pg.on('console',lambda m: errs.append('CONSOLE '+m.text) if m.type=='error' else None)
    pg.goto(BASE); pg.wait_for_timeout(1500)
    pg.fill('#login-email','sensei@x5group.uz') if pg.locator('#login-email').count() else None
    pg.fill('#login-pass','parol12345') if pg.locator('#login-pass').count() else None
    pg.click('[data-act=login]'); pg.wait_for_timeout(2500)
    # --- a'zo faolsizlantirish
    pg.click('[data-page=jamoa]'); pg.wait_for_timeout(700)
    pg.click('[data-member=Ali]'); pg.wait_for_timeout(800)
    pg.click('.lx-page:not([hidden]) [data-act=edit-member]'); pg.wait_for_timeout(500)
    dz=pg.locator('.lx-overlay .lx-dz')
    ok('member danger zone visible', dz.count()==1)
    pg.screenshot(path=OUT+'e2e_del_member_sheet.png')
    btn=dz.locator('button').nth(0)
    btn.click(); ok('armed text', btn.inner_text()=='Tasdiqlang')
    btn.click(); pg.wait_for_timeout(1500)
    ok('sheet closed', pg.locator('.lx-overlay').count()==0)
    pg.click('[data-page=arxiv]'); pg.wait_for_timeout(700)
    pg.click('[data-atab=azolar]'); pg.wait_for_timeout(500)
    rows=pg.locator('.lx-arow')
    ok("archive A'zolar has Ali", rows.count()==1 and 'Ali' in rows.first.inner_text())
    pg.screenshot(path=OUT+'e2e_del_arch_members.png')
    # qayta faollashtirish
    rows.first.locator('[data-restore]').click(); pg.wait_for_timeout(1200)
    ok('reactivated -> empty archive', pg.locator('.lx-arow').count()==0)
    # qayta faolsizlantirib, butunlay o'chirish
    pg.click('[data-page=jamoa]'); pg.wait_for_timeout(600)
    pg.click('[data-frilans=Vali]'); pg.wait_for_timeout(600)
    d2=pg.locator('.lx-overlay .lx-dz button').nth(1)
    d2.click(); d2.click(); pg.wait_for_timeout(1500)
    pg.click('[data-page=jamoa]'); pg.wait_for_timeout(600)
    ok('Vali removed from Jamoa', pg.locator('.lx-page:not([hidden]) >> text=Vali').count()==0)
    # --- loyiha arxivi
    pg.click('[data-page=loyihalar]'); pg.wait_for_timeout(700)
    pg.locator('.lx-page:not([hidden]) [data-project="Loyiha A"]').first.click(); pg.wait_for_timeout(800)
    pg.click("text=Loyiha ma'lumotlari"); pg.wait_for_timeout(400)
    pg.click('.lx-page:not([hidden]) [data-act=edit-project]'); pg.wait_for_timeout(500)
    pb=pg.locator('.lx-overlay .lx-dz button').first
    ok('project archive button', pb.count()==1)
    pb.click(); pb.click(); pg.wait_for_timeout(1500)
    pg.click('[data-page=arxiv]'); pg.wait_for_timeout(700)
    pg.click('[data-atab=loyihalar]'); pg.wait_for_timeout(500)
    ok('archive Loyihalar has Loyiha A', pg.locator('.lx-arow').count()==1 and 'Loyiha A' in pg.locator('.lx-arow').first.inner_text())
    pg.screenshot(path=OUT+'e2e_del_arch_projects.png')
    fv=pg.locator('.lx-arow [data-forever]').first
    fv.click(); pg.wait_for_timeout(300)
    ok('warn toast shown', pg.locator('.lx-toast').count()==1)
    fv.click(); pg.wait_for_timeout(1500)
    ok('project deleted forever', pg.locator('.lx-arow').count()==0)
    print('errors', errs)
    b.close()
sys.exit(1 if fails else 0)
