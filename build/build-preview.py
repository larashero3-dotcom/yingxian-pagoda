#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从 index.html + assets/ 生成桌面预览稿：仓库根 → preview.html

哪份是源：仓库根的 index.html 和 assets/（拆开的那份）。预览稿是它的派生物。
反过来做过一次（preview → 拆开），代价是改完预览稿要重新拆一遍，而拆的规则
（剥 pv 壳、按 /*./assets/x.js*/ 标记切脚本、补上被剥掉的闭合 div）只在人的
脑子里 —— 换个人做就得重新推一遍。所以固定成这个方向，一条命令生成。

预览稿跟拆开那份的三处差别，全在这儿：
  1. 四个 .js 内联回 <script> 里，各自带 /*./assets/x.js*/ 标记
  2. 套桌面预览壳：pv-css（390x844 手机框）+ pv-shim（把 window 的
     innerWidth/innerHeight 改成读手机框的尺寸）+ #pv-shell 包裹 + #pv-note
  3. logo 换成 data: URI —— 预览稿是单文件、双击就能看的东西，不引外部文件

用法（在仓库任意位置）：python3 build/build-preview.py
"""
import base64
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)                    # 仓库根
SRC = ROOT                                      # index.html 与 assets/ 都在根上
OUT = os.path.join(ROOT, 'preview.html')
SHELL = os.path.join(HERE, 'preview-shell')
ORDER = ['three.js', 'tex.js', 'audio.js', 'app.js']


def read(p):
    with open(p, encoding='utf-8') as f:
        return f.read()


def main():
    html = read(os.path.join(SRC, 'index.html'))

    # ---- 1. 脚本内联 ----------------------------------------------------
    tags = ''.join('<script src="./assets/%s"></script>\n' % n for n in ORDER)
    if tags not in html:
        sys.exit('index.html 里找不到那四行连着的 <script src>，先看是不是被改过')
    inline = []
    for n in ORDER:
        body = read(os.path.join(SRC, 'assets', n)).rstrip('\n')
        inline.append('<script>/*./assets/%s*/\n%s\n\n</script>\n' % (n, body))
    html = html.replace(tags, ''.join(inline))

    # ---- 2. logo 换 data: URI ------------------------------------------
    with open(os.path.join(SRC, 'assets', 'moxt-logo.png'), 'rb') as f:
        uri = 'data:image/png;base64,' + base64.b64encode(f.read()).decode()
    if './assets/moxt-logo.png' not in html:
        sys.exit('index.html 里找不到 logo 的引用')
    html = html.replace('./assets/moxt-logo.png', uri)

    # ---- 3. 套预览壳 ---------------------------------------------------
    html = html.replace('</head>', '\n' + read(os.path.join(SHELL, 'pv-css.html'))
                        + '\n</head>', 1)
    html = html.replace('<body>', '<body>\n' + read(os.path.join(SHELL, 'pv-shim.html'))
                        + '\n\n<div id="pv-shell">', 1)
    html = html.replace('</body>', '</div>\n' + read(os.path.join(SHELL, 'pv-note.html'))
                        + '\n</body>', 1)

    # ---- 4. 自查：内联脚本数、壳齐了、没有残留的外部引用 ----------------
    n_inline = len(re.findall(r'<script>/\*\./assets/', html))
    if n_inline != 4:
        sys.exit('内联脚本数不对：%d（应为 4）' % n_inline)
    for k in ('pv-css', 'pv-shim', 'pv-shell', 'pv-note'):
        if k not in html:
            sys.exit('预览壳缺 %s' % k)
    if re.search(r'(src|href)="\./assets/', html):
        sys.exit('还有指向 ./assets/ 的引用没内联，预览稿就不是单文件了')

    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(html)
    print('写出 %s（%.2f MB，内联脚本 %d 段）'
          % (os.path.basename(OUT), os.path.getsize(OUT) / 1048576, n_inline))


if __name__ == '__main__':
    main()
