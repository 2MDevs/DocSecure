import re, sys
import os, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
_pat = re.compile(r'(?:hover:|focus:|active:|placeholder:)?(?:bg|text|border|divide|from|to|via)-(?:white|black|slate|gray|blue|sky|indigo|violet|purple|rose|red|emerald|green|amber|yellow|orange|teal|cyan|pink|lime|fuchsia)(?:-[0-9]{2,3})?(?:/[0-9]+)?')
classes = []
for f in (ROOT / 'src').rglob('*.tsx'):
    classes += _pat.findall(f.read_text(encoding='utf-8'))
classes += ['bg-[#f8fafc]','bg-[#f9fafb]','bg-[#eef1f5]','hover:bg-slate-50','hover:bg-slate-100','hover:bg-slate-200','active:bg-slate-100','active:bg-slate-200','hover:bg-white','focus:bg-white','hover:bg-blue-50','hover:bg-rose-50','hover:bg-red-50','hover:text-slate-900','hover:text-slate-950','hover:text-slate-800','hover:text-slate-700','hover:border-slate-300','hover:border-blue-100','bg-white/95','bg-white/80','placeholder:text-slate-400','placeholder:text-slate-500','divide-slate-100','divide-slate-200']
# Também cobre combinações ainda não usadas (para telas futuras)
_cols = ['slate','gray','blue','sky','indigo','violet','purple','rose','red','emerald','green','amber','yellow','orange','teal','cyan','pink','lime','fuchsia']
for c in _cols:
    for n in (50,100,200):
        classes += [f'bg-{c}-{n}', f'hover:bg-{c}-{n}', f'bg-{c}-{n}/50', f'bg-{c}-{n}/60', f'bg-{c}-{n}/70', f'bg-{c}-{n}/80']
    for n in (50,100,200,300):
        classes += [f'border-{c}-{n}', f'hover:border-{c}-{n}', f'divide-{c}-{n}']
    for n in (600,700,800,900):
        classes += [f'text-{c}-{n}', f'hover:text-{c}-{n}']
classes = sorted(set(classes))

# Paleta escura (superfícies)
SURF = {'white':'#111a2b','[#f8fafc]':'#0b1220','[#f9fafb]':'#0e1626','[#eef1f5]':'#0b1220',
        'slate-50':'#0e1524','slate-100':'#1a2436','slate-200':'#243046','slate-300':'#334155'}
TEXT = {'slate-900':'#e6eaf1','slate-800':'#d5dbe5','slate-700':'#c0c8d5','slate-600':'#a2adbf','slate-500':'#8b97ab'}
BORDER = {'slate-50':'#18212f','slate-100':'#1c2638','slate-200':'#243046','slate-300':'#33405a','white':'#1c2638'}
C = { # 300, 400, 500
 'blue':('#93c5fd','#60a5fa','59 130 246'),'sky':('#7dd3fc','#38bdf8','14 165 233'),'indigo':('#a5b4fc','#818cf8','99 102 241'),
 'violet':('#c4b5fd','#a78bfa','139 92 246'),'purple':('#d8b4fe','#c084fc','168 85 247'),'rose':('#fda4af','#fb7185','244 63 94'),
 'red':('#fca5a5','#f87171','239 68 68'),'emerald':('#6ee7b7','#34d399','16 185 129'),'green':('#86efac','#4ade80','34 197 94'),
 'amber':('#fcd34d','#fbbf24','245 158 11'),'yellow':('#fde047','#facc15','234 179 8'),'orange':('#fdba74','#fb923c','249 115 22'),
 'teal':('#5eead4','#2dd4bf','20 184 166'),'cyan':('#67e8f9','#22d3ee','6 182 212'),'pink':('#f9a8d4','#f472b6','236 72 153'),
 'lime':('#bef264','#a3e635','132 204 22'),'fuchsia':('#f0abfc','#e879f9','217 70 239'),
}
def esc(c): return re.sub(r'([:/\[\]#.])', r'\\\1', c)
def pseudo(variant):
    return {'hover':':hover','focus':':focus','active':':active','placeholder':'::placeholder','group-hover':''}.get(variant,'')
rules=[]
for cls in classes:
    m = re.match(r'^(?:(hover|focus|active|placeholder|group-hover):)?(bg|text|border|divide|ring|from|to|via)-(.+?)(?:/(\d+))?$', cls)
    if not m: continue
    variant, prop, color, alpha = m.groups()
    if variant=='group-hover': continue
    val=None
    a = int(alpha)/100 if alpha else None
    if prop=='bg':
        color = color.replace('gray-','slate-')
        if color in SURF:
            val = SURF[color]
            if a is not None and color=='white': val=f'rgb(17 26 43 / {a})' if a>=0.5 else None
        else:
            mm=re.match(r'([a-z]+)-(\d+)$',color)
            if mm and mm.group(1) in C and int(mm.group(2))<=200:
                rgb=C[mm.group(1)][2]; base={50:0.10,100:0.16,200:0.24}[int(mm.group(2))]
                val=f'rgb({rgb} / {round(base*(a if a is not None else 1)+ (0.02 if a else 0),3)})'
        decl = f'background-color:{val}' if val else None
    elif prop=='text':
        color = color.replace('gray-','slate-')
        if color in TEXT: val=TEXT[color]
        else:
            mm=re.match(r'([a-z]+)-(\d+)$',color)
            if mm and mm.group(1) in C and int(mm.group(2))>=600:
                val = C[mm.group(1)][1] if int(mm.group(2))==600 else C[mm.group(1)][0]
        decl = f'color:{val}' if val else None
    elif prop in ('border','divide'):
        color = color.replace('gray-','slate-')
        if color in BORDER: val=BORDER[color]
        else:
            mm=re.match(r'([a-z]+)-(\d+)$',color)
            if mm and mm.group(1) in C and int(mm.group(2))<=300:
                val=f'rgb({C[mm.group(1)][2]} / {0.22 if int(mm.group(2))<=100 else 0.32})'
        if not val: decl=None
        elif prop=='border': decl=f'border-color:{val}'
        else: decl=None; rules.append(f'html.dark .ds-app .{esc(cls)} > :not(:last-child){{border-color:{val}}}')
    elif prop in ('from','via','to'):
        mm=re.match(r'([a-z]+)-(\d+)$',color)
        if mm and mm.group(1) in C and int(mm.group(2))<=200:
            var={'from':'--tw-gradient-from','via':'--tw-gradient-via','to':'--tw-gradient-to'}[prop]
            decl=f'{var}:rgb({C[mm.group(1)][2]} / 0.18)'
        elif color in ('white','slate-50','slate-100'):
            var={'from':'--tw-gradient-from','via':'--tw-gradient-via','to':'--tw-gradient-to'}[prop]
            decl=f'{var}:{SURF.get(color,"#111a2b")}'
        else: decl=None
    else: decl=None
    if not decl: continue
    sel = '.'+esc(cls)+pseudo(variant)
    rules.append(f'html.dark .ds-app {sel}, html.dark .ds-app{sel}{{{decl}}}')
header = '''/* =============================================================================
   MODO ESCURO — gerado por scripts/gen-dark-theme.py (não editar à mão).
   Converte as classes claras do Tailwind usadas no app (fundo branco, textos
   cinza-escuro, bordas claras, tons pastel) para a paleta escura quando a
   página tem <html class="dark">. Telas novas: rode
       python3 scripts/gen-dark-theme.py
   ============================================================================= */
'''
out = ROOT / 'src' / 'styles' / 'dark-theme.css'
out.write_text(header + '\n'.join(rules) + '\n', encoding='utf-8')
print(f'{len(rules)} regras -> {out}')
