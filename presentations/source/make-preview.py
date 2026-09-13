"""Create the static slide gallery from the validated PPTX slide renders."""
from pathlib import Path
from html import escape
import zipfile, xml.etree.ElementTree as ET
root=Path(__file__).resolve().parents[1]
ns={'a':'http://schemas.openxmlformats.org/drawingml/2006/main'}
with zipfile.ZipFile(root/'mapexport-workshop.pptx') as z:
    notes=[]
    for i in range(1,17):
        r=ET.fromstring(z.read(f'ppt/notesSlides/notesSlide{i}.xml'))
        notes.append('\n'.join(t.text or '' for t in r.findall('.//a:t',ns)))
parts=['''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MapExport workshop</title><style>
@font-face{font-family:Apfel;src:url('../references/MapExport%20Design%20System/fonts/Apfel_Grotezk_Regular.woff2')}@font-face{font-family:Mayonnaise;src:url('../references/MapExport%20Design%20System/fonts/Mayonnaise_Black.woff2')}*{box-sizing:border-box}body{margin:0;background:#fef9e4;color:#18180f;font:18px Apfel,sans-serif}header{background:#f4501e;color:#fef9e4;padding:28px 4vw}h1{font:48px Mayonnaise;margin:0 0 14px}a{color:inherit}nav{display:flex;gap:28px;flex-wrap:wrap}main{max-width:1280px;margin:auto;padding:32px 0}figure{margin:0 0 45px}img{width:100%;display:block}figcaption{padding:12px 24px;background:#f5edcc}summary{cursor:pointer}pre{white-space:pre-wrap;font:17px/1.5 Apfel,sans-serif;max-width:100%}@media print{header,figcaption{display:none}main{padding:0}figure{break-after:page;margin:0}@page{size:landscape;margin:0}}
</style><header><h1>MAPEXPORT / WORKSHOP</h1><nav><a href="mapexport-workshop.pptx">Download PowerPoint</a><a href="assets/ghent-demo.svg" download>Gent demo SVG</a><a href="assets/ghent-recoloured.svg" download>Recoloured example</a><a href="https://coen.at/mapexport/">Open MapExport</a></nav></header><main>''']
for i,note in enumerate(notes,1):
    parts.append(f'<figure><img src="preview/slide-{i:02d}.png" alt="Workshop slide {i}" loading="lazy"><figcaption><details><summary>Slide {i:02d} · Speaker notes</summary><pre>{escape(note)}</pre></details></figcaption></figure>')
parts.append('</main></html>')
(root/'preview.html').write_text('\n'.join(parts))
